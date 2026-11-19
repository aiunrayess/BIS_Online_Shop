import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="orders-page container">
      <h1>My Orders</h1>
      <p *ngIf="message" class="status-feedback" [class.success]="messageType === 'success'" [class.error]="messageType === 'error'" role="status">{{message}}</p>
      <p *ngIf="loading" class="loading"><span class="loading-indicator" aria-hidden="true"></span>Loading orders…</p>
      <p class="demo-note">Payments are simulated for this demo. Full card details stay in the browser and are never stored or sent. If you cancel a new order, its products are kept in your wishlist so you can easily buy them later.</p>
      <article class="order-card" *ngFor="let order of orders">
        <div class="order-heading">
          <h2>Order #{{order.id}}</h2>
          <span>{{order.status}}</span>
        </div>
        <p>{{order.order_date | date:'medium'}} · {{order.delivery_address}}</p>
        <div class="order-line" *ngFor="let item of order.items">
          <span>{{item.product_name}} × {{item.quantity}}</span>
          <span>{{item.unit_price * item.quantity | number:'1.2-2'}} KZT</span>
        </div>
        <div class="order-footer">
          <span>{{paymentLabel(order.payment?.method)}}<ng-container *ngIf="order.payment?.card_brand && order.payment?.card_last4"> · {{cardBrandLabel(order.payment.card_brand)}} ending {{order.payment.card_last4}}</ng-container> · {{order.payment?.status}}</span>
          <strong>{{order.total_amount | number:'1.2-2'}} KZT</strong>
        </div>
        <button *ngIf="order.status === 'New'" class="btn btn-outline" (click)="cancel(order)">
          Cancel order and save items
        </button>
      </article>
      <p *ngIf="!loading && orders.length === 0">You have not placed any orders yet.</p>
    </main>
  `,
  styles: [`
    .orders-page { padding: 48px 0; }
    .demo-note { color: var(--text-light); margin-bottom: 24px; }
    .order-card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 22px; margin: 18px 0; }
    .order-heading, .order-line, .order-footer { display: flex; justify-content: space-between; gap: 16px; }
    .order-heading { align-items: center; }
    .order-heading h2 { font-size: 1.2rem; }
    .order-line { padding: 10px 0; border-top: 1px solid var(--border); }
    .order-footer { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 14px; }
    .order-card button { margin-top: 16px; }
    .loading { color: var(--text-light); margin: 16px 0; }
  `]
})
export class OrdersComponent implements OnInit {
  orders: any[] = [];
  loading = true;
  message = '';
  messageType: 'success' | 'error' = 'success';

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('placed') === '1') {
      this.message = 'Your order was placed successfully.';
      this.messageType = 'success';
    }
    if (!this.auth.isLoggedIn()) {
      this.loading = false;
      this.message = 'Please sign in to view your orders.';
      this.messageType = 'error';
      return;
    }
    this.loadOrders();
  }

  cancel(order: any) {
    this.api.cancelOrder(order.id).subscribe({
      next: () => {
        this.message = `Order #${order.id} cancelled, stock returned, and its products were saved to your wishlist.`;
        this.messageType = 'success';
        this.loadOrders();
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = err.error?.detail || 'Could not cancel this order.';
        this.messageType = 'error';
        this.cdr.detectChanges();
      }
    });
  }

  paymentLabel(method?: string): string {
    const labels: Record<string, string> = {
      card: 'Card',
      bank_transfer: 'Bank transfer',
      cash_on_delivery: 'Cash on delivery'
    };
    return method ? labels[method] || method : 'Payment';
  }

  cardBrandLabel(brand?: string | null): string {
    const labels: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      other: 'Card',
    };
    return labels[brand ?? ''] ?? 'Card';
  }

  private loadOrders() {
    this.api.getUserOrders().subscribe({
      next: rows => {
        this.orders = Array.isArray(rows) ? rows : rows.results || [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.message = err.error?.detail || 'Could not load your orders.';
        this.messageType = 'error';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
