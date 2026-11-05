import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User, UserRole } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="page container">
      <header><div><p class="eyebrow">Access management</p><h1>People and roles</h1><p>{{ canManageRoles ? 'Create operational accounts and assign day-to-day roles.' : 'Review account availability and protect access.' }}</p></div><button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">Refresh</button></header>
      <section *ngIf="canManageRoles" class="create-panel">
        <h2>Create an operational account</h2>
        <p>Head Managers can create Buyer, Seller, Sales Manager, and Warehouse accounts. Leadership and security roles are assigned only through the protected administrator workflow.</p>
        <form #accountForm="ngForm" (ngSubmit)="createAccount()">
          <label>Email<input name="new-email" type="email" [(ngModel)]="newAccount.email" required email maxlength="254" autocomplete="off"></label>
          <label>First name<input name="new-first-name" [(ngModel)]="newAccount.first_name" required maxlength="150"></label>
          <label>Last name<input name="new-last-name" [(ngModel)]="newAccount.last_name" required maxlength="150"></label>
          <label>Temporary password<input name="new-password" type="password" [(ngModel)]="newAccount.password" required minlength="8" autocomplete="new-password"></label>
          <label>Role<select name="new-role" [(ngModel)]="newAccount.role" required><option *ngFor="let role of assignableRoles" [ngValue]="role">{{ label(role) }}</option></select></label>
          <button class="btn btn-primary" type="submit" [disabled]="creating || accountForm.invalid">{{ creating ? 'Creating…' : 'Create account' }}</button>
        </form>
      </section>
      <div class="toolbar"><label for="user-search">Find an account</label><input id="user-search" name="user-search" [(ngModel)]="search" placeholder="Name or email"></div>
      <p *ngIf="message" [class.error]="hasError" class="message" role="status">{{ message }}</p>
      <section *ngIf="loading" class="state">Loading accounts…</section>
      <section *ngIf="!loading && !hasError && !filteredUsers.length" class="state"><h2>No matching accounts</h2><p>Try a different name or email.</p></section>
      <section *ngIf="!loading && filteredUsers.length" class="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody><tr *ngFor="let user of filteredUsers"><td><strong>{{ fullName(user) }}</strong><small>{{ user.email }}</small></td><td><ng-container *ngIf="canChangeRole(user); else roleText"><label class="visually-hidden" [for]="'role-' + user.id">Role for {{ user.email }}</label><select [id]="'role-' + user.id" [value]="user.role" (change)="changeRole(user, $event)" [disabled]="pendingId === user.id"><option *ngFor="let role of assignableRoles" [value]="role">{{ label(role) }}</option></select></ng-container><ng-template #roleText>{{ label(user.role) }}</ng-template></td><td><ng-container *ngIf="canToggleStatus(user); else statusText"><button type="button" class="status" [class.inactive]="user.is_active === false" (click)="toggleStatus(user)" [disabled]="pendingId === user.id">{{ user.is_active === false ? 'Inactive — enable' : 'Active — disable' }}</button></ng-container><ng-template #statusText>{{ user.is_active === false ? 'Inactive' : 'Active' }}</ng-template></td><td>{{ user.created_at ? (user.created_at | date:'mediumDate') : '—' }}</td></tr></tbody></table></section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page > header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); }.page header p:not(.eyebrow), small, .create-panel p { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.create-panel { display: grid; gap: 10px; margin-top: 24px; padding: 20px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.create-panel h2 { color: var(--secondary); font-size: 1.1rem; }.create-panel form { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: end; }.create-panel label { display: grid; gap: 6px; color: var(--secondary); font-size: .82rem; font-weight: 700; }.toolbar { display: grid; gap: 6px; max-width: 360px; margin: 26px 0 14px; color: var(--secondary); font-size: .85rem; font-weight: 700; }.toolbar input, select, .create-panel input { padding: 9px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; }.message { color: #166534; font-weight: 700; }.message.error { color: #b91c1c; }.state { padding: 75px 20px; color: var(--text-light); text-align: center; }.table-wrap { margin-top: 20px; overflow-x: auto; border: 1px solid var(--border); border-radius: 13px; background: #fff; }table { width: 100%; min-width: 680px; border-collapse: collapse; }th, td { padding: 13px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }th { color: var(--text-light); font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; }tbody tr:last-child td { border-bottom: 0; }small { display: block; margin-top: 3px; }.status { border: 1px solid #86efac; border-radius: 999px; background: #f0fdf4; color: #166534; padding: 6px 10px; font: inherit; font-size: .82rem; cursor: pointer; }.status.inactive { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }.status:disabled, select:disabled { opacity: .6; cursor: wait; }.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }@media (max-width: 900px) { .create-panel form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }@media (max-width: 600px) { .page > header { align-items: start; flex-direction: column; }.create-panel form { grid-template-columns: 1fr; } }
  `]
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  search = '';
  loading = true;
  pendingId: number | null = null;
  message = '';
  hasError = false;
  currentRole: UserRole | null = null;
  creating = false;
  newAccount = this.emptyAccount();
  readonly assignableRoles: UserRole[] = ['buyer', 'seller', 'warehouse', 'manager'];
  private readonly protectedRoles: UserRole[] = ['security_manager', 'head_manager', 'admin'];

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  get canManageRoles(): boolean {
    return this.currentRole === 'head_manager' || this.currentRole === 'admin';
  }

  get canManageStatus(): boolean {
    return this.currentRole === 'security_manager' || this.currentRole === 'admin';
  }

  get filteredUsers(): User[] {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.users;
    return this.users.filter(user => `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(query));
  }

  ngOnInit(): void {
    this.auth.restoreSession().subscribe(user => {
      this.currentRole = user?.role ?? null;
      this.load();
    });
  }

  load(): void {
    this.loading = true;
    this.hasError = false;
    this.api.getUsers().subscribe({
      next: response => {
        this.users = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not load user accounts.');
      }
    });
  }

  changeRole(user: User, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const nextRole = select.value as UserRole;
    if (nextRole === user.role || this.pendingId !== null) return;
    this.pendingId = user.id;
    this.hasError = false;
    this.message = '';
    this.api.updateUserRole(user.id, nextRole).subscribe({
      next: updated => {
        this.replace(updated);
        this.pendingId = null;
        this.message = `${updated.email} is now ${this.label(updated.role)}.`;
      },
      error: error => {
        this.pendingId = null;
        select.value = user.role;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not update this role.');
      }
    });
  }

  createAccount(): void {
    if (!this.canManageRoles || this.creating) return;
    this.creating = true;
    this.hasError = false;
    this.message = '';
    this.api.createUser({
      email: this.newAccount.email.trim(),
      first_name: this.newAccount.first_name.trim(),
      last_name: this.newAccount.last_name.trim(),
      password: this.newAccount.password,
      role: this.newAccount.role,
    }).subscribe({
      next: created => {
        this.creating = false;
        this.users = [created, ...this.users];
        this.newAccount = this.emptyAccount();
        this.message = `${created.email} was created.`;
      },
      error: error => {
        this.creating = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not create this account.');
      }
    });
  }

  toggleStatus(user: User): void {
    if (this.pendingId !== null) return;
    const nextIsActive = user.is_active === false;
    const reason = window.prompt(`Provide a reason to ${nextIsActive ? 'enable' : 'disable'} ${user.email}:`);
    if (!reason?.trim()) {
      this.hasError = true;
      this.message = 'A reason is required for an account status change.';
      return;
    }
    this.pendingId = user.id;
    this.hasError = false;
    this.message = '';
    this.api.updateUserStatus(user.id, nextIsActive, reason).subscribe({
      next: updated => {
        this.replace(updated);
        this.pendingId = null;
        this.message = `${updated.email} is now ${updated.is_active === false ? 'inactive' : 'active'}.`;
      },
      error: error => {
        this.pendingId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not update this account status.');
      }
    });
  }

  fullName(user: User): string {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
  }

  label(role: UserRole): string {
    return role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  canChangeRole(user: User): boolean {
    return this.canManageRoles && (
      this.currentRole === 'admin' || !this.protectedRoles.includes(user.role)
    );
  }

  canToggleStatus(user: User): boolean {
    return this.canManageStatus && (
      this.currentRole === 'admin' || (
        user.id !== this.auth.currentUser?.id && !this.protectedRoles.includes(user.role)
      )
    );
  }

  private replace(updated: User): void {
    this.users = this.users.map(user => user.id === updated.id ? { ...user, ...updated } : user);
  }

  private emptyAccount(): { email: string; first_name: string; last_name: string; password: string; role: UserRole } {
    return { email: '', first_name: '', last_name: '', password: '', role: 'warehouse' };
  }
}
