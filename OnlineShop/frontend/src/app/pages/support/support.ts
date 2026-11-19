import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { SupportTicket, SupportTicketStatus, UserRole } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Client support</p>
          <h1>{{ isSupportStaff ? 'Support desk' : 'How can we help?' }}</h1>
          <p>{{ isSupportStaff ? 'Review customer requests, reply, and track their resolution.' : 'Send a request to the support team and follow its progress here.' }}</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="loadTickets()" [disabled]="loading">Refresh</button>
      </header>

      <section *ngIf="canOpenTicket" class="create-panel" aria-labelledby="new-ticket-heading">
        <h2 id="new-ticket-heading">Contact support</h2>
        <p>Do not include card numbers, passwords, or other sensitive details in your message.</p>
        <form #ticketForm="ngForm" (ngSubmit)="createTicket(ticketForm)">
          <label>Subject<input name="subject" [(ngModel)]="draft.subject" required maxlength="160" placeholder="What do you need help with?"></label>
          <label>Category<select name="category" [(ngModel)]="draft.category"><option value="general">General question</option><option value="order">Order or delivery</option><option value="product">Product or stock</option><option value="account">Account access</option><option value="technical">Technical issue</option></select></label>
          <label class="message-field">Message<textarea name="message" [(ngModel)]="draft.message" required minlength="10" maxlength="3000" rows="5" placeholder="Describe the issue and include any useful order or product references."></textarea><span>{{ draft.message.length }}/3000</span></label>
          <button type="submit" class="btn btn-primary" [disabled]="submitting || ticketForm.invalid">{{ submitting ? 'Sending…' : 'Send support request' }}</button>
        </form>
      </section>

      <section *ngIf="!canViewTickets" class="access-notice">
        <h2>Support access is role-based</h2>
        <p>Customers can create and follow requests here. Support staff can review and respond to customer requests.</p>
      </section>

      <p *ngIf="message" class="message" [class.error]="hasError" role="status">{{ message }}</p>
      <section *ngIf="canViewTickets && loading" class="state" aria-live="polite">Loading support requests…</section>
      <section *ngIf="canViewTickets && !loading && hasError" class="state error" role="alert"><p>{{ message }}</p><button type="button" class="btn btn-primary" (click)="loadTickets()">Try again</button></section>
      <section *ngIf="canViewTickets && !loading && !hasError && !tickets.length" class="state"><h2>No support requests yet</h2><p>Your submitted requests will appear here.</p></section>

      <section *ngIf="canViewTickets && !loading && !hasError && tickets.length" class="ticket-list" aria-label="Support requests">
        <article *ngFor="let ticket of tickets" class="ticket">
          <header class="ticket-header">
            <div><p class="ticket-id">Request #{{ ticket.id }} <span *ngIf="isSupportStaff && ticket.customer">· {{ customerName(ticket) }}</span></p><h2>{{ ticket.subject }}</h2></div>
            <span class="status" [ngClass]="statusClass(ticket.status)">{{ ticket.status }}</span>
          </header>
          <p class="ticket-meta">{{ categoryLabel(ticket.category) }} · Opened {{ ticket.created_at | date:'medium' }}</p>
          <p class="ticket-message">{{ ticket.message }}</p>
          <div *ngIf="ticket.response" class="response"><strong>Support response</strong><p>{{ ticket.response }}</p><small *ngIf="ticket.updated_at">Updated {{ ticket.updated_at | date:'medium' }}</small></div>

          <form *ngIf="isSupportStaff" class="staff-form" #updateForm="ngForm" (ngSubmit)="updateTicket(ticket)">
            <label>Status<select [name]="'status-' + ticket.id" [(ngModel)]="ticket.status" required><option *ngFor="let status of availableStatuses(ticket)" [ngValue]="status">{{ status }}</option></select></label>
            <label>Response<textarea [name]="'response-' + ticket.id" [(ngModel)]="ticket.response" maxlength="3000" rows="3" placeholder="Write a clear, helpful response for the customer."></textarea></label>
            <button type="submit" class="btn btn-primary" [disabled]="updatingId === ticket.id || updateForm.invalid">{{ updatingId === ticket.id ? 'Saving…' : 'Save update' }}</button>
          </form>
        </article>
      </section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page-header { display: flex; align-items: end; justify-content: space-between; gap: 22px; margin-bottom: 25px; }.eyebrow, .ticket-id { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }.page-header p:not(.eyebrow), .create-panel > p, .ticket-meta, .response small, .access-notice p { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.create-panel, .access-notice { display: grid; gap: 9px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: #fff; }.create-panel h2, .access-notice h2 { color: var(--secondary); font-size: 1.2rem; }.create-panel form { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(150px, .65fr); gap: 12px; }.create-panel label, .staff-form label { display: grid; gap: 6px; color: var(--secondary); font-size: .82rem; font-weight: 700; }.create-panel input, .create-panel select, .create-panel textarea, .staff-form select, .staff-form textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; }.create-panel textarea, .staff-form textarea { resize: vertical; }.create-panel .message-field { grid-column: 1 / -1; }.message-field span { color: var(--text-light); font-weight: 400; text-align: right; }.create-panel button { justify-self: start; }.message { margin: 20px 0 0; color: #166534; font-weight: 700; }.message.error, .state.error { color: #b91c1c; }.state { display: grid; justify-items: center; gap: 12px; padding: 76px 20px; color: var(--text-light); text-align: center; }.ticket-list { display: grid; gap: 16px; margin-top: 26px; }.ticket { padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: #fff; }.ticket-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }.ticket-header h2 { margin-top: 5px; color: var(--secondary); font-size: 1.1rem; }.status { display: inline-flex; padding: 5px 9px; border-radius: 999px; font-size: .78rem; font-weight: 800; white-space: nowrap; }.status-open { background: #dbeafe; color: #1d4ed8; }.status-progress { background: #fef3c7; color: #92400e; }.status-resolved { background: #dcfce7; color: #166534; }.status-closed { background: #f3f4f6; color: #4b5563; }.ticket-meta { margin: 8px 0 12px; font-size: .83rem; }.ticket-message { color: #374151; line-height: 1.55; white-space: pre-wrap; }.response { margin-top: 15px; padding: 14px; border-radius: 9px; background: #f8fafc; }.response strong { color: var(--secondary); font-size: .87rem; }.response p { margin: 5px 0; color: #374151; line-height: 1.5; white-space: pre-wrap; }.staff-form { display: grid; grid-template-columns: minmax(150px, .45fr) minmax(220px, 1fr) auto; gap: 12px; align-items: end; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border); }.staff-form button { min-height: 42px; }.staff-form button:disabled { opacity: .6; cursor: wait; }@media (max-width: 720px) { .page { padding-inline: 14px; }.page-header { align-items: start; flex-direction: column; }.page-header > .btn { width: 100%; }.create-panel form, .staff-form { grid-template-columns: 1fr; }.create-panel button { width: 100%; }.ticket-header { flex-direction: column; }.status { align-self: start; } }
  `]
})
export class SupportComponent implements OnInit {
  tickets: SupportTicket[] = [];
  loading = true;
  submitting = false;
  updatingId: number | null = null;
  hasError = false;
  message = '';
  currentRole: UserRole | null = null;
  draft = this.emptyDraft();

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {}

  get isSupportStaff(): boolean {
    return this.currentRole !== null && ['manager', 'head_manager', 'security_manager', 'admin'].includes(this.currentRole);
  }

  get canOpenTicket(): boolean {
    return this.currentRole === 'buyer' || this.currentRole === 'seller';
  }

  get canViewTickets(): boolean {
    return this.canOpenTicket || this.isSupportStaff;
  }

  ngOnInit(): void {
    this.auth.restoreSession().subscribe(user => {
      this.currentRole = user?.role ?? null;
      if (this.canViewTickets) this.loadTickets();
      else this.loading = false;
    });
  }

  loadTickets(): void {
    if (!this.canViewTickets) return;
    this.loading = true;
    this.hasError = false;
    this.message = '';
    this.api.getSupportTickets().subscribe({
      next: response => {
        this.tickets = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.tickets = [];
        this.loading = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not load support requests.');
      },
    });
  }

  createTicket(form: NgForm): void {
    if (this.submitting || form.invalid) return;
    this.submitting = true;
    this.hasError = false;
    this.message = '';
    this.api.createSupportTicket({
      subject: this.draft.subject.trim(),
      message: this.draft.message.trim(),
      category: this.draft.category,
    }).subscribe({
      next: created => {
        this.tickets = [created, ...this.tickets];
        this.draft = this.emptyDraft();
        form.resetForm(this.draft);
        this.submitting = false;
        this.message = `Your support request #${created.id} was sent.`;
      },
      error: error => {
        this.submitting = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not send your support request.');
      },
    });
  }

  updateTicket(ticket: SupportTicket): void {
    if (!this.isSupportStaff || this.updatingId !== null) return;
    this.updatingId = ticket.id;
    this.hasError = false;
    this.message = '';
    this.api.updateSupportTicket(ticket.id, {
      status: ticket.status,
      response: ticket.response?.trim() || undefined,
    }).subscribe({
      next: updated => {
        this.tickets = this.tickets.map(item => item.id === updated.id ? updated : item);
        this.updatingId = null;
        this.message = `Request #${updated.id} was updated.`;
      },
      error: error => {
        this.updatingId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not update this support request.');
      },
    });
  }

  customerName(ticket: SupportTicket): string {
    const customer = ticket.customer;
    if (!customer) return 'Customer';
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email || 'Customer';
  }

  statusClass(status: SupportTicketStatus): string {
    switch (status) {
      case 'In Progress': return 'status-progress';
      case 'Resolved': return 'status-resolved';
      case 'Closed': return 'status-closed';
      default: return 'status-open';
    }
  }

  availableStatuses(ticket: SupportTicket): SupportTicketStatus[] {
    const transitions: Record<SupportTicketStatus, SupportTicketStatus[]> = {
      'Open': ['Open', 'In Progress', 'Resolved', 'Closed'],
      'In Progress': ['In Progress', 'Open', 'Resolved', 'Closed'],
      'Resolved': ['Resolved', 'Open', 'Closed'],
      'Closed': ['Closed', 'Open'],
    };
    return transitions[ticket.status];
  }

  categoryLabel(category?: string): string {
    const labels: Record<string, string> = {
      general: 'General',
      order: 'Order or delivery',
      product: 'Product or stock',
      account: 'Account access',
      technical: 'Technical issue',
    };
    return labels[category ?? 'general'] ?? 'General';
  }

  private emptyDraft(): { subject: string; category: string; message: string } {
    return { subject: '', category: 'general', message: '' };
  }
}
