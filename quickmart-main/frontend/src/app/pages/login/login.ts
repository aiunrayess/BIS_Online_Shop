import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-card">
        <p class="eyebrow">Online Shop account</p>
        <h1>Welcome back</h1>
        <p class="intro">Sign in to manage your orders, listings, or assigned workspace.</p>
        <p *ngIf="accessMessage" class="notice" role="status">{{ accessMessage }}</p>
        <p *ngIf="error" class="error" role="alert">{{ error }}</p>
        <form #form="ngForm" (ngSubmit)="submit()">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" [(ngModel)]="email" required email autocomplete="email" placeholder="you@example.com">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" [(ngModel)]="password" required minlength="8" autocomplete="current-password" placeholder="Your password">
          <button class="btn btn-primary" type="submit" [disabled]="form.invalid || submitting">{{ submitting ? 'Signing in…' : 'Sign in' }}</button>
        </form>
        <p class="footer-copy">New to Online Shop? <a routerLink="/register">Create an account</a></p>
      </section>
    </main>
  `,
  styles: [`
    .auth-page { min-height: 76vh; display: grid; place-items: center; padding: 48px 20px; background: var(--bg-offset); }.auth-card { width: min(100%, 440px); padding: 34px; border: 1px solid var(--border); border-radius: 16px; background: #fff; box-shadow: var(--shadow); }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 5px 0 8px; color: var(--secondary); }.intro { color: var(--text-light); }.notice, .error { margin-top: 16px; padding: 10px; border-radius: 8px; font-size: .9rem; }.notice { color: #92400e; background: #fffbeb; }.error { color: #b91c1c; background: #fef2f2; }form { display: grid; gap: 8px; margin-top: 23px; }label { margin-top: 7px; color: var(--secondary); font-size: .88rem; font-weight: 700; }input { padding: 11px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }.btn { width: 100%; margin-top: 15px; }.btn:disabled { opacity: .6; cursor: not-allowed; }.footer-copy { margin-top: 21px; color: var(--text-light); text-align: center; font-size: .9rem; }.footer-copy a { color: var(--primary-dark); font-weight: 800; }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  accessMessage = '';
  submitting = false;
  private readonly returnUrl: string;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    route: ActivatedRoute,
  ) {
    const candidate = route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.returnUrl = candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
    this.accessMessage = route.snapshot.queryParamMap.get('registered') === '1'
      ? 'Your account was created. You can sign in now.'
      : route.snapshot.queryParamMap.get('access') === 'denied'
      ? 'Your account does not have access to that page.'
      : route.snapshot.queryParamMap.get('access') === 'required'
        ? 'Please sign in to continue.'
        : '';
  }

  submit(): void {
    if (this.submitting) return;
    this.error = '';
    this.submitting = true;
    this.auth.login({ email: this.email.trim(), password: this.password }).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: error => {
        this.submitting = false;
        this.error = apiErrorMessage(error, 'We could not sign you in. Check your email and password.');
      }
    });
  }
}
