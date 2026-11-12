import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardOverview } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="page container">
      <header><div><p class="eyebrow">Leadership workspace</p><h1>Business overview</h1><p>Review current Online Shop activity and move to the appropriate operational workspace.</p></div><button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">Refresh</button></header>
      <p *ngIf="error" class="error" role="alert">{{ error }}</p>
      <section *ngIf="loading" class="state">Loading dashboard…</section>
      <section *ngIf="!loading && !error" class="metrics" aria-label="Dashboard metrics"><article *ngFor="let metric of metrics" class="metric"><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></article></section>
      <section class="quick-links"><a routerLink="/management"><i class="fas fa-boxes" aria-hidden="true"></i><span><strong>Store operations</strong><small>Orders, stock, and sales performance.</small></span></a><a routerLink="/users"><i class="fas fa-users" aria-hidden="true"></i><span><strong>People and roles</strong><small>Review account access and activity.</small></span></a><a *ngIf="canAccessSecurity" routerLink="/security"><i class="fas fa-shield-alt" aria-hidden="true"></i><span><strong>Security center</strong><small>Review the access audit trail.</small></span></a></section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page > header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); }.page header p:not(.eyebrow) { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.error { margin-top: 22px; color: #b91c1c; }.state { padding: 72px 0; color: var(--text-light); text-align: center; }.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin: 30px 0; }.metric { display: grid; gap: 8px; padding: 22px; border: 1px solid var(--border); border-radius: 13px; background: #fff; box-shadow: var(--shadow); }.metric span { color: var(--text-light); font-size: .86rem; }.metric strong { color: var(--secondary); font-size: 1.6rem; }.quick-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }.quick-links a { display: flex; gap: 14px; align-items: start; padding: 20px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.quick-links a:hover { box-shadow: var(--shadow-hover); }.quick-links i { color: var(--primary-dark); font-size: 1.25rem; }.quick-links span { display: grid; gap: 5px; }.quick-links small { color: var(--text-light); line-height: 1.4; }@media (max-width: 720px) { .page > header { align-items: start; flex-direction: column; }.quick-links { grid-template-columns: 1fr; } }
  `]
})
export class DashboardComponent implements OnInit {
  overview: DashboardOverview = {};
  loading = true;
  error = '';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  get canAccessSecurity(): boolean {
    return this.auth.hasAnyRole('security_manager', 'admin');
  }

  get metrics(): Array<{ label: string; value: string }> {
    const values = Object.entries(this.overview)
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      .slice(0, 8)
      .map(([label, value]) => ({ label: this.humanize(label), value: String(value) }));
    return values.length ? values : [{ label: 'Status', value: 'No overview metrics available yet' }];
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getDashboardOverview().subscribe({
      next: overview => {
        this.overview = overview;
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.error = error?.status === 404
          ? 'The dashboard endpoint is not available on this server yet.'
          : apiErrorMessage(error, 'We could not load the dashboard.');
      }
    });
  }

  private humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }
}
