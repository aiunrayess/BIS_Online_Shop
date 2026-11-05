import { Component } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { User, UserRole } from '../../models/api.models';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, FormsModule, NgIf, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <div class="container header-wrap">
        <a routerLink="/" class="brand" aria-label="Online Shop home">
          <span class="brand-mark" aria-hidden="true">Q</span>
          <span>Online Shop</span>
        </a>

        <nav aria-label="Main navigation" class="nav-bar">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
          <a routerLink="/products" routerLinkActive="active">Catalog</a>
          <a routerLink="/categories" routerLinkActive="active">Categories</a>
          <ng-container *ngIf="user$ | async as user">
            <a routerLink="/orders" routerLinkActive="active">Orders</a>
            <a routerLink="/profile" routerLinkActive="active">Profile</a>
            <a *ngIf="hasRole(user, 'seller')" routerLink="/sell" routerLinkActive="active">Sell</a>
            <a *ngIf="hasRole(user, 'seller')" routerLink="/seller/listings" routerLinkActive="active">My listings</a>
            <a *ngIf="hasRole(user, 'manager', 'warehouse', 'head_manager', 'admin')" routerLink="/management" routerLinkActive="active">Operations</a>
            <a *ngIf="hasRole(user, 'head_manager', 'admin')" routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
            <a *ngIf="hasRole(user, 'security_manager', 'admin')" routerLink="/security" routerLinkActive="active">Security</a>
            <a *ngIf="hasRole(user, 'head_manager', 'security_manager', 'admin')" routerLink="/users" routerLinkActive="active">Accounts</a>
          </ng-container>
        </nav>

        <div class="actions">
          <form class="search" (ngSubmit)="search()" role="search">
            <label class="visually-hidden" for="site-search">Search the catalog</label>
            <input id="site-search" name="site-search" [(ngModel)]="searchQuery" maxlength="120" placeholder="Search products">
            <button type="submit" aria-label="Search products"><i class="fas fa-search" aria-hidden="true"></i></button>
          </form>
          <a routerLink="/cart" class="cart-link" aria-label="Open shopping cart">
            <i class="fas fa-shopping-bag" aria-hidden="true"></i>
            <span class="count">{{ (cartCount$ | async) ?? 0 }}</span>
          </a>
          <ng-container *ngIf="user$ | async as user; else signedOut">
            <span class="account" [title]="user.email">{{ displayName(user) }}</span>
            <button type="button" class="logout" (click)="logout()">Sign out</button>
          </ng-container>
          <ng-template #signedOut>
            <a routerLink="/login" class="login">Sign in</a>
            <a routerLink="/register" class="join">Join</a>
          </ng-template>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .header { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid var(--border); }
    .header-wrap { min-height: 76px; display: flex; align-items: center; gap: 20px; }
    .brand { display: inline-flex; align-items: center; gap: 9px; color: var(--secondary); font-size: 1.15rem; font-weight: 800; white-space: nowrap; }
    .brand-mark { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--secondary); color: #fff; }
    .nav-bar { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; overflow-x: auto; }
    .nav-bar a { color: var(--text-light); font-size: .85rem; font-weight: 700; white-space: nowrap; }
    .nav-bar a:hover, .nav-bar a.active { color: var(--primary-dark); }
    .actions { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    .search { display: flex; align-items: center; width: min(190px, 18vw); border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
    .search input { border: 0; width: 100%; min-width: 0; padding: 8px 9px; font: inherit; outline: none; }
    .search button { border: 0; background: transparent; padding: 8px 10px; color: var(--secondary); cursor: pointer; }
    .cart-link { position: relative; color: var(--secondary); font-size: 1.1rem; padding: 7px; }
    .count { position: absolute; top: 0; right: 0; min-width: 16px; height: 16px; display: grid; place-items: center; border-radius: 10px; background: var(--primary); color: #fff; font-size: .65rem; font-weight: 800; }
    .account { max-width: 110px; overflow: hidden; text-overflow: ellipsis; color: var(--text-light); font-size: .8rem; }
    .logout, .login { border: 0; background: transparent; color: var(--secondary); font: inherit; font-weight: 700; cursor: pointer; }
    .join { padding: 8px 12px; border-radius: 8px; background: var(--secondary); color: #fff; font-size: .85rem; font-weight: 700; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 1050px) { .account, .search { display: none; } }
    @media (max-width: 720px) { .header-wrap { gap: 10px; } .nav-bar { gap: 11px; } .nav-bar a { font-size: .78rem; } .join { display: none; } }
  `]
})
export class HeaderComponent {
  searchQuery = '';
  constructor(
    private readonly auth: AuthService,
    private readonly cart: CartService,
    private readonly router: Router,
  ) {}

  get user$() {
    return this.auth.user$;
  }

  get cartCount$() {
    return this.cart.cartCount$;
  }

  hasRole(user: User, ...roles: UserRole[]): boolean {
    return roles.includes(user.role);
  }

  displayName(user: User): string {
    const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
    return name || user.email;
  }

  search(): void {
    const search = this.searchQuery.trim();
    this.router.navigate(['/products'], { queryParams: { search: search || null } });
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/']));
  }
}
