import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { TokenResponse, User, UserRole } from '../models/api.models';

interface LoginCredentials {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = '/api';
  private readonly accessTokenKey = 'Online Shop_access_token';
  private readonly refreshTokenKey = 'Online Shop_refresh_token';
  private readonly userKey = 'Online Shop_user';
  private readonly userSubject = new BehaviorSubject<User | null>(this.readStoredUser());
  private refreshRequest$?: Observable<string>;
  private restoreRequest$?: Observable<User | null>;
  private sessionResolved = false;

  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get accessToken(): string | null {
    return this.readStorage(this.accessTokenKey);
  }

  get refreshToken(): string | null {
    return this.readStorage(this.refreshTokenKey);
  }

  isLoggedIn(): boolean {
    return Boolean(this.accessToken && !this.isTokenExpired(this.accessToken));
  }

  hasAnyRole(...roles: UserRole[]): boolean {
    return Boolean(this.currentUser && roles.includes(this.currentUser.role));
  }

  login(credentials: LoginCredentials): Observable<User> {
    return this.http.post<TokenResponse>(`${this.baseUrl}/login/`, credentials).pipe(
      tap(tokens => this.storeTokens(tokens)),
      switchMap(() => this.fetchProfile()),
      tap(user => {
        this.sessionResolved = true;
        if (user) this.setCurrentUser(user);
        else this.clearSession();
      }),
      catchError(error => {
        this.clearSession();
        return throwError(() => error);
      })
    );
  }

  register(payload: Record<string, unknown>): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/registration/`, payload);
  }

  /** Resolves a browser session once and verifies cached roles through /api/me/. */
  restoreSession(): Observable<User | null> {
    if (this.sessionResolved) return of(this.currentUser);
    if (this.restoreRequest$) return this.restoreRequest$;

    const access = this.accessToken;
    const refresh = this.refreshToken;
    let request$: Observable<User | null>;

    if (access && !this.isTokenExpired(access)) {
      request$ = this.fetchProfile();
    } else if (refresh && !this.isTokenExpired(refresh)) {
      request$ = this.refreshAccessToken().pipe(switchMap(() => this.fetchProfile()));
    } else {
      this.clearSession();
      return of(null);
    }

    this.restoreRequest$ = request$.pipe(
      tap(user => {
        this.sessionResolved = true;
        if (user) this.setCurrentUser(user);
        else this.clearSession();
      }),
      catchError(error => {
        // A profile cannot be verified, so do not retain a cached role for protected routes.
        this.clearSession();
        return of(null);
      }),
      finalize(() => {
        this.restoreRequest$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.restoreRequest$;
  }

  ensureSession(): Observable<boolean> {
    return this.restoreSession().pipe(map(user => Boolean(user)));
  }

  refreshAccessToken(): Observable<string> {
    if (this.refreshRequest$) return this.refreshRequest$;
    const refresh = this.refreshToken;
    if (!refresh || this.isTokenExpired(refresh)) {
      this.clearSession();
      return throwError(() => new Error('Your session has expired. Please sign in again.'));
    }

    this.refreshRequest$ = this.http.post<TokenResponse>(`${this.baseUrl}/token/refresh/`, { refresh }).pipe(
      tap(tokens => this.storeTokens(tokens)),
      map(tokens => tokens.access),
      catchError(error => {
        this.clearSession();
        return throwError(() => error);
      }),
      finalize(() => {
        this.refreshRequest$ = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.refreshRequest$;
  }

  updateCurrentUser(user: User): void {
    this.sessionResolved = true;
    this.setCurrentUser(user);
  }

  logout(): Observable<void> {
    const refresh = this.refreshToken;
    if (!this.accessToken) {
      this.clearSession();
      return of(void 0);
    }
    return this.http.post<void>(`${this.baseUrl}/logout/`, refresh ? { refresh } : {}).pipe(
      // Browser cleanup is still guaranteed if a server-side token blacklist is unavailable.
      catchError(() => of(void 0)),
      finalize(() => this.clearSession())
    );
  }

  private fetchProfile(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/me/`);
  }

  private storeTokens(tokens: TokenResponse): void {
    this.writeStorage(this.accessTokenKey, tokens.access);
    if (tokens.refresh) this.writeStorage(this.refreshTokenKey, tokens.refresh);
  }

  private setCurrentUser(user: User): void {
    this.userSubject.next(user);
    this.writeStorage(this.userKey, JSON.stringify(user));
  }

  private clearSession(): void {
    this.removeStorage(this.accessTokenKey);
    this.removeStorage(this.refreshTokenKey);
    this.removeStorage(this.userKey);
    this.userSubject.next(null);
    this.sessionResolved = true;
  }

  private readStoredUser(): User | null {
    const raw = this.readStorage(this.userKey);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return this.isUser(parsed) ? parsed : null;
    } catch {
      this.removeStorage(this.userKey);
      return null;
    }
  }

  private isUser(value: unknown): value is User {
    return typeof value === 'object' && value !== null && 'id' in value && 'role' in value && 'email' in value;
  }

  private isTokenExpired(token: string | null): boolean {
    if (!token) return true;
    const pieces = token.split('.');
    if (pieces.length !== 3) return true;
    try {
      const payload = JSON.parse(this.decodeBase64Url(pieces[1])) as { exp?: unknown };
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now() + 5000;
    } catch {
      return true;
    }
  }

  private decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return atob(padded);
  }

  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage may be blocked in private browser contexts.
    }
  }

  private removeStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be blocked in private browser contexts.
    }
  }
}
