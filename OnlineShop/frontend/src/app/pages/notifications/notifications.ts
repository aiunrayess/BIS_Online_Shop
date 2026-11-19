import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AppNotification } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Your updates</p>
          <h1>Notification centre</h1>
          <p>Restock alerts and account updates appear here.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-secondary" (click)="markAllRead()" [disabled]="!unreadCount || markingAll">{{ markingAll ? 'Marking…' : 'Mark all read' }}</button>
          <button type="button" class="btn btn-secondary" (click)="load()" [disabled]="loading">Refresh</button>
        </div>
      </header>

      <p *ngIf="message" class="message" [class.error]="hasError" role="status">{{ message }}</p>
      <section *ngIf="loading" class="state" aria-live="polite">Loading notifications…</section>
      <section *ngIf="!loading && hasError" class="state error" role="alert">
        <p>{{ message }}</p><button type="button" class="btn btn-primary" (click)="load()">Try again</button>
      </section>
      <section *ngIf="!loading && !hasError && !notifications.length" class="state">
        <i class="fas fa-bell-slash" aria-hidden="true"></i>
        <h2>Nothing new yet</h2>
        <p>When a waitlisted product returns to stock, you will see it here.</p>
        <a class="btn btn-primary" routerLink="/saved">View waiting list</a>
      </section>

      <section *ngIf="!loading && !hasError && notifications.length" class="notification-list" aria-label="Notifications">
        <article *ngFor="let notification of notifications" class="notification" [class.unread]="!notification.is_read">
          <div class="icon" aria-hidden="true"><i [class]="iconFor(notification)"></i></div>
          <div class="copy">
            <div class="notification-title"><h2>{{ notification.title }}</h2><span *ngIf="!notification.is_read" class="unread-dot" aria-label="Unread"></span></div>
            <p>{{ notification.message }}</p>
            <div class="meta"><time [attr.datetime]="notification.created_at">{{ notification.created_at | date:'medium' }}</time><a *ngIf="notification.product" [routerLink]="['/products', notification.product]">View product</a></div>
          </div>
          <button *ngIf="!notification.is_read" type="button" class="read-button" [disabled]="pendingId === notification.id" (click)="markRead(notification)">{{ pendingId === notification.id ? 'Saving…' : 'Mark read' }}</button>
          <span *ngIf="notification.is_read" class="read-label">Read</span>
        </article>
      </section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page-header { display: flex; align-items: end; justify-content: space-between; gap: 22px; margin-bottom: 24px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }.page-header p:not(.eyebrow), .copy p, .meta, .read-label { color: var(--text-light); }.header-actions { display: flex; gap: 10px; }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.message { margin: 0 0 18px; color: #166534; font-weight: 700; }.message.error, .state.error { color: #b91c1c; }.state { display: grid; justify-items: center; gap: 12px; padding: 78px 20px; color: var(--text-light); text-align: center; }.state > i { color: #94a3b8; font-size: 2rem; }.notification-list { display: grid; gap: 12px; }.notification { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 15px; align-items: start; padding: 18px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.notification.unread { border-left: 4px solid var(--primary); background: #fffdf8; }.icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: #fef3c7; color: #b45309; }.notification-title { display: flex; align-items: center; gap: 8px; }.notification-title h2 { color: var(--secondary); font-size: 1rem; }.unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); }.copy p { margin: 5px 0 9px; line-height: 1.5; }.meta { display: flex; gap: 14px; font-size: .8rem; }.meta a { color: var(--primary-dark); font-weight: 700; }.read-button { padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: var(--secondary); font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; white-space: nowrap; }.read-button:disabled { opacity: .6; cursor: wait; }.read-label { font-size: .82rem; font-weight: 700; }@media (max-width: 650px) { .page { padding-inline: 14px; }.page-header { align-items: start; flex-direction: column; }.header-actions { width: 100%; }.header-actions .btn { flex: 1; }.notification { grid-template-columns: auto minmax(0, 1fr); }.read-button, .read-label { grid-column: 2; justify-self: start; }.meta { flex-wrap: wrap; } }
  `]
})
export class NotificationsComponent implements OnInit {
  notifications: AppNotification[] = [];
  loading = true;
  hasError = false;
  message = '';
  pendingId: number | null = null;
  markingAll = false;

  constructor(private readonly api: ApiService) {}

  get unreadCount(): number {
    return this.notifications.filter(notification => !notification.is_read).length;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.hasError = false;
    this.message = '';
    this.api.getNotifications().subscribe({
      next: response => {
        this.notifications = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.notifications = [];
        this.loading = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not load your notifications.');
      },
    });
  }

  markRead(notification: AppNotification): void {
    if (notification.is_read || this.pendingId !== null || this.markingAll) return;
    this.pendingId = notification.id;
    this.hasError = false;
    this.message = '';
    this.api.markNotificationRead(notification.id).subscribe({
      next: updated => {
        this.notifications = this.notifications.map(item => item.id === updated.id ? updated : item);
        this.pendingId = null;
      },
      error: error => {
        this.pendingId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not mark that notification as read.');
      },
    });
  }

  markAllRead(): void {
    const unread = this.notifications.filter(notification => !notification.is_read);
    if (!unread.length || this.markingAll || this.pendingId !== null) return;
    this.markingAll = true;
    this.hasError = false;
    this.message = '';
    forkJoin(unread.map(notification => this.api.markNotificationRead(notification.id))).subscribe({
      next: updated => {
        const byId = new Map(updated.map(notification => [notification.id, notification]));
        this.notifications = this.notifications.map(notification => byId.get(notification.id) ?? notification);
        this.markingAll = false;
        this.message = 'All notifications are marked as read.';
      },
      error: error => {
        this.markingAll = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not mark all notifications as read.');
      },
    });
  }

  iconFor(notification: AppNotification): string {
    const type = notification.type.toLowerCase();
    if (type.includes('stock') || type.includes('wait')) return 'fas fa-box-open';
    if (type.includes('support')) return 'fas fa-headset';
    if (type.includes('security')) return 'fas fa-shield-alt';
    return 'fas fa-bell';
  }
}
