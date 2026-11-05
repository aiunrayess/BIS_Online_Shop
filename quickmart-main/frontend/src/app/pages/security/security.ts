import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditLogEntry } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="page container">
      <header><div><p class="eyebrow">Security workspace</p><h1>Security center</h1><p>Review account and operational activity recorded by Online Shop.</p></div><button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">Refresh log</button></header>
      <p *ngIf="error" class="error" role="alert">{{ error }}</p>
      <section *ngIf="loading" class="state">Loading audit events…</section>
      <section *ngIf="!loading && !error && !entries.length" class="state"><h2>No events recorded</h2><p>New security-relevant activity will appear here.</p></section>
      <section *ngIf="!loading && entries.length" class="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Event</th><th>Target</th><th>Details</th></tr></thead><tbody><tr *ngFor="let entry of entries"><td>{{ entry.created_at | date:'medium' }}</td><td>{{ entry.actor_email || actorLabel(entry) }}</td><td>{{ eventLabel(entry.event_type) }}</td><td>{{ targetLabel(entry) }}</td><td>{{ details(entry) }}</td></tr></tbody></table></section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page > header { display: flex; justify-content: space-between; align-items: end; gap: 20px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); }.page header p:not(.eyebrow) { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.error { margin-top: 22px; color: #b91c1c; }.state { padding: 75px 20px; color: var(--text-light); text-align: center; }.table-wrap { margin-top: 26px; overflow-x: auto; border: 1px solid var(--border); border-radius: 13px; background: #fff; }table { width: 100%; border-collapse: collapse; min-width: 800px; }th, td { padding: 13px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }th { color: var(--text-light); font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; }tbody tr:last-child td { border-bottom: 0; }@media (max-width: 600px) { .page > header { align-items: start; flex-direction: column; } }
  `]
})
export class SecurityComponent implements OnInit {
  entries: AuditLogEntry[] = [];
  loading = true;
  error = '';

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getAuditLogs().subscribe({
      next: response => {
        this.entries = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.error = error?.status === 404
          ? 'The audit-log endpoint is not available on this server yet.'
          : apiErrorMessage(error, 'We could not load the audit log.');
      }
    });
  }

  actorLabel(entry: AuditLogEntry): string {
    return entry.actor ? `Account #${entry.actor}` : 'System';
  }

  targetLabel(entry: AuditLogEntry): string {
    if (entry.target_user_email) return entry.target_user_email;
    if (entry.product) return `Product #${entry.product}`;
    if (entry.order) return `Order #${entry.order}`;
    return '—';
  }

  eventLabel(eventType: string): string {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  details(entry: AuditLogEntry): string {
    const values = Object.entries(entry.metadata ?? {});
    return values.length
      ? values.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`).join('; ')
      : '—';
  }
}
