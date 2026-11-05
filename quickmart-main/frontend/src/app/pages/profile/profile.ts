import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/api.models';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="profile-page container">
      <section class="profile-card">
        <p class="eyebrow">Online Shop account</p><h1>My profile</h1>
        <p *ngIf="message" [class.error]="hasError" class="message" role="status">{{ message }}</p>
        <p *ngIf="loading" class="loading">Loading your profile…</p>
        <form *ngIf="profile" #profileForm="ngForm" (ngSubmit)="save()">
          <div class="two-column">
            <label>First name<input name="first_name" [(ngModel)]="profile.first_name" required maxlength="150" autocomplete="given-name"></label>
            <label>Last name<input name="last_name" [(ngModel)]="profile.last_name" required maxlength="150" autocomplete="family-name"></label>
          </div>
          <label>Email address<input name="email" type="email" [(ngModel)]="profile.email" required maxlength="254" autocomplete="email"></label>
          <label>Phone <span>(optional)</span><input name="phone" type="tel" [(ngModel)]="profile.phone" maxlength="20" autocomplete="tel"></label>
          <label>Delivery address<input name="address" [(ngModel)]="profile.address" required maxlength="200" autocomplete="street-address"></label>
          <p class="role-note">Account role: <strong>{{ profile.role }}</strong>. Role changes are managed by authorized staff.</p>
          <button class="btn btn-primary" type="submit" [disabled]="saving || profileForm.invalid">{{ saving ? 'Saving…' : 'Save profile' }}</button>
        </form>
      </section>

      <section class="profile-card password-card" *ngIf="profile">
        <h2>Change password</h2>
        <p class="helper">Use a unique password with at least 8 characters.</p>
        <p *ngIf="passwordMessage" [class.error]="passwordError" class="message" role="status">{{ passwordMessage }}</p>
        <form #passwordForm="ngForm" (ngSubmit)="changePassword()">
          <label>Current password<input name="currentPassword" type="password" [(ngModel)]="currentPassword" required autocomplete="current-password"></label>
          <label>New password<input name="newPassword" type="password" [(ngModel)]="newPassword" required minlength="8" autocomplete="new-password"></label>
          <button class="btn btn-secondary" type="submit" [disabled]="passwordSaving || passwordForm.invalid">{{ passwordSaving ? 'Updating…' : 'Update password' }}</button>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .profile-page { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 48px 20px 72px; align-items: start; }.profile-card { padding: 28px; border: 1px solid var(--border); border-radius: 15px; background: #fff; box-shadow: var(--shadow); }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 20px; color: var(--secondary); }h2 { color: var(--secondary); }.helper, .role-note, .loading { margin: 10px 0 18px; color: var(--text-light); font-size: .9rem; }.message { margin: 0 0 14px; color: #166534; font-weight: 600; }.error { color: #b91c1c; }form { display: grid; gap: 15px; }label { display: grid; gap: 6px; color: var(--secondary); font-size: .88rem; font-weight: 700; }label span { color: var(--text-light); font-weight: 400; }input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }.two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }.btn { width: fit-content; margin-top: 4px; }.btn:disabled { opacity: .6; cursor: not-allowed; }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }
    @media (max-width: 800px) { .profile-page { grid-template-columns: 1fr; } }.password-card { min-width: 0; }
  `]
})
export class ProfileComponent implements OnInit {
  profile: User | null = null;
  loading = true;
  saving = false;
  message = '';
  hasError = false;
  currentPassword = '';
  newPassword = '';
  passwordSaving = false;
  passwordMessage = '';
  passwordError = false;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.auth.restoreSession().subscribe(user => {
      this.profile = user ? { ...user } : null;
      this.loading = false;
      if (!user) {
        this.hasError = true;
        this.message = 'Please sign in to view your profile.';
      }
    });
  }

  save(): void {
    if (!this.profile || this.saving) return;
    this.saving = true;
    this.hasError = false;
    this.message = '';
    this.api.updateProfile({
      first_name: this.profile.first_name.trim(),
      last_name: this.profile.last_name.trim(),
      email: this.profile.email.trim(),
      phone: this.profile.phone?.trim() ?? '',
      address: this.profile.address.trim(),
    }).subscribe({
      next: user => {
        this.profile = { ...user };
        this.auth.updateCurrentUser(user);
        this.saving = false;
        this.message = 'Your profile was updated.';
      },
      error: error => {
        this.saving = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not save your profile.');
      }
    });
  }

  changePassword(): void {
    if (this.passwordSaving || !this.currentPassword || this.newPassword.length < 8) return;
    this.passwordSaving = true;
    this.passwordError = false;
    this.passwordMessage = '';
    this.api.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.passwordSaving = false;
        this.currentPassword = '';
        this.newPassword = '';
        this.passwordMessage = 'Your password was updated.';
      },
      error: error => {
        this.passwordSaving = false;
        this.passwordError = true;
        this.passwordMessage = error?.status === 404
          ? 'Password changes are not enabled on this server yet. Contact an administrator.'
          : apiErrorMessage(error, 'We could not update your password.');
      }
    });
  }
}
