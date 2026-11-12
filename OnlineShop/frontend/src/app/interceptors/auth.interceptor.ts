import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const isAuthenticationRequest = (url: string): boolean =>
  url.includes('/api/login/') || url.includes('/api/token/refresh/') || url.includes('/api/registration/');

/** Adds a single JWT header for all API traffic and retries once after a 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const authorized = token && !isAuthenticationRequest(request.url)
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthenticationRequest(request.url) ||
        request.headers.has('X-Online Shop-Retry')
      ) {
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(nextToken => next(
          request.clone({
            setHeaders: {
              Authorization: `Bearer ${nextToken}`,
              'X-Online Shop-Retry': '1'
            }
          })
        )),
        catchError(refreshError => throwError(() => refreshError))
      );
    })
  );
};
