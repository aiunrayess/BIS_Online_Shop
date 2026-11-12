import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CartItem, PaymentMethod } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="cart-page container">
      <header><p class="eyebrow">Online Shop</p><h1>Your cart</h1></header>
      <section *ngIf="items.length; else emptyCart" class="cart-layout">
        <div class="items" aria-label="Cart items">
          <article *ngFor="let item of items" class="cart-item">
            <a [routerLink]="['/products', item.id]" class="image-link"><img [src]="item.image_url || fallbackImage" [alt]="item.name" (error)="useFallback(item)"></a>
            <div class="item-info">
              <h2><a [routerLink]="['/products', item.id]">{{ item.name }}</a></h2>
              <p>{{ item.price | number:'1.0-2' }} KZT each</p>
              <p class="availability">{{ item.stock_qty }} available</p>
            </div>
            <div class="item-actions">
              <div class="quantity" [attr.aria-label]="'Quantity for ' + item.name">
                <button type="button" (click)="changeQuantity(item, -1)" aria-label="Decrease quantity">−</button>
                <span>{{ item.quantity }}</span>
                <button type="button" (click)="changeQuantity(item, 1)" [disabled]="item.quantity >= item.stock_qty" aria-label="Increase quantity">+</button>
              </div>
              <strong>{{ lineTotal(item) | number:'1.0-2' }} KZT</strong>
              <button type="button" class="remove" (click)="remove(item)">Remove</button>
            </div>
          </article>
        </div>

        <aside class="summary" aria-label="Checkout">
          <h2>Order summary</h2>
          <div class="row"><span>Items</span><span>{{ total | number:'1.0-2' }} KZT</span></div>
          <div class="row"><span>Delivery</span><span>Free</span></div>
          <div class="row total"><span>Total</span><strong>{{ total | number:'1.0-2' }} KZT</strong></div>
          <label for="delivery-address">Delivery address</label>
          <textarea id="delivery-address" name="delivery-address" [(ngModel)]="deliveryAddress" required maxlength="200" placeholder="Street, building, apartment, city" [attr.aria-invalid]="checkoutAttempted && !deliveryAddress.trim() ? 'true' : null" [class.invalid]="checkoutAttempted && !deliveryAddress.trim()"></textarea>
          <label for="payment-method">Payment method</label>
          <select id="payment-method" name="payment-method" [(ngModel)]="paymentMethod" (ngModelChange)="onPaymentMethodChange($event)">
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer — demo only</option>
            <option value="cash_on_delivery">Cash on delivery</option>
          </select>
          <fieldset *ngIf="paymentMethod === 'card'" class="card-details">
            <legend>Card details</legend>
            <label for="cardholder-name">Cardholder name</label>
            <input id="cardholder-name" name="cardholder-name" type="text" autocomplete="cc-name" maxlength="80" [(ngModel)]="cardholderName" (ngModelChange)="clearCardError()" [attr.aria-invalid]="checkoutAttempted && cardValidationMessage ? 'true' : null" [class.invalid]="checkoutAttempted && cardValidationMessage" placeholder="Name on card">
            <label for="card-number">Card number</label>
            <input id="card-number" name="card-number" type="text" inputmode="numeric" autocomplete="cc-number" maxlength="23" [(ngModel)]="cardNumber" (ngModelChange)="formatCardNumber()" [attr.aria-invalid]="checkoutAttempted && cardValidationMessage ? 'true' : null" [class.invalid]="checkoutAttempted && cardValidationMessage" placeholder="1234 5678 9012 3456">
            <div class="card-row">
              <div>
                <label for="card-expiry">Expiry</label>
                <input id="card-expiry" name="card-expiry" type="text" inputmode="numeric" autocomplete="cc-exp" maxlength="5" [(ngModel)]="cardExpiry" (ngModelChange)="formatCardExpiry()" [attr.aria-invalid]="checkoutAttempted && cardValidationMessage ? 'true' : null" [class.invalid]="checkoutAttempted && cardValidationMessage" placeholder="MM/YY">
              </div>
              <div>
                <label for="card-cvv">CVV</label>
                <input id="card-cvv" name="card-cvv" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4" [(ngModel)]="cardCvv" (ngModelChange)="clearCardError()" [attr.aria-invalid]="checkoutAttempted && cardValidationMessage ? 'true' : null" [class.invalid]="checkoutAttempted && cardValidationMessage" placeholder="•••">
              </div>
            </div>
            <p class="note">This is a demo payment: no charge is made. Card details are validated only in this browser; the order sends only the card brand and last four digits, never the full number, expiry, name, or CVV.</p>
            <p *ngIf="checkoutAttempted && cardValidationMessage" class="field-error" role="alert">{{ cardValidationMessage }}</p>
          </fieldset>
          <p *ngIf="paymentMethod !== 'card'" class="note">This demo records your payment method but does not charge a payment.</p>
          <p *ngIf="checkoutError" class="status-feedback error" role="alert">{{ checkoutError }}</p>
          <button type="button" class="btn btn-primary checkout" (click)="checkout()" [disabled]="submitting">
            <span *ngIf="submitting" class="button-spinner" aria-hidden="true"></span>{{ submitting ? 'Placing order…' : 'Place order' }}
          </button>
        </aside>
      </section>
      <ng-template #emptyCart>
        <section class="empty"><i class="fas fa-shopping-basket" aria-hidden="true"></i><h2>Your cart is empty</h2><p>Explore the catalogue to find something useful.</p><a routerLink="/products" class="btn btn-primary">Browse products</a></section>
      </ng-template>
    </main>
  `,
  styles: [`
    .cart-page { padding: 44px 20px 72px; }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin-top: 3px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }
    .cart-layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(290px, .8fr); gap: 28px; margin-top: 28px; }.items { display: grid; gap: 14px; }.cart-item { display: grid; grid-template-columns: 110px 1fr auto; gap: 17px; align-items: center; padding: 14px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.image-link, .image-link img { width: 110px; height: 95px; border-radius: 9px; object-fit: cover; background: #f5f1eb; }.item-info h2 { font-size: 1.05rem; }.item-info h2 a:hover { color: var(--primary-dark); }.item-info p { color: var(--text-light); font-size: .88rem; }.availability { margin-top: 5px; }.item-actions { display: grid; justify-items: end; gap: 9px; }.quantity { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }.quantity button { width: 30px; height: 30px; border: 0; background: #fff; cursor: pointer; font-size: 1.1rem; }.quantity button:disabled { color: #aaa; cursor: not-allowed; }.quantity span { display: grid; place-items: center; width: 31px; height: 30px; border-inline: 1px solid var(--border); }.remove { border: 0; padding: 0; background: transparent; color: #b91c1c; cursor: pointer; font: inherit; font-size: .82rem; }
    .summary { position: sticky; top: 95px; padding: 22px; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow); }.summary h2 { margin-bottom: 19px; }.row { display: flex; justify-content: space-between; padding: 11px 0; color: var(--text-light); border-bottom: 1px solid var(--border); }.row.total { margin-bottom: 15px; color: var(--secondary); font-size: 1.05rem; }.summary label { display: block; margin: 14px 0 6px; color: var(--secondary); font-weight: 700; font-size: .88rem; }.summary textarea, .summary select, .card-details input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }.summary textarea { min-height: 76px; resize: vertical; }.summary textarea.invalid, .card-details input.invalid { border-color: #b91c1c; box-shadow: 0 0 0 3px rgba(185, 28, 28, .12); }.card-details { margin-top: 15px; padding: 0 14px 14px; border: 1px solid var(--border); border-radius: 9px; }.card-details legend { padding: 0 5px; color: var(--secondary); font-size: .88rem; font-weight: 800; }.card-details label { margin-top: 10px; }.card-row { display: grid; grid-template-columns: 1fr 100px; gap: 12px; }.note { margin-top: 11px; color: var(--text-light); font-size: .78rem; line-height: 1.45; }.field-error, .error { margin-top: 12px; color: #b91c1c; font-size: .88rem; }.checkout { width: 100%; margin-top: 16px; }.checkout:disabled { opacity: .6; cursor: not-allowed; }
    .empty { display: grid; justify-items: center; gap: 12px; padding: 94px 20px; text-align: center; color: var(--text-light); }.empty i { color: var(--primary); font-size: 3rem; }.empty h2 { color: var(--secondary); }
    @media (max-width: 800px) { .cart-layout { grid-template-columns: 1fr; }.summary { position: static; }.cart-item { grid-template-columns: 80px 1fr; }.image-link, .image-link img { width: 80px; height: 80px; }.item-actions { grid-column: 1 / -1; grid-template-columns: auto 1fr auto; justify-items: start; align-items: center; }.item-actions strong { justify-self: end; } }
  `]
})
export class CartComponent implements OnInit, OnDestroy {
  items: CartItem[] = [];
  total = 0;
  deliveryAddress = '';
  paymentMethod: PaymentMethod = 'card';
  checkoutError = '';
  cardValidationMessage = '';
  checkoutAttempted = false;
  submitting = false;
  cardholderName = '';
  cardNumber = '';
  cardExpiry = '';
  cardCvv = '';
  readonly fallbackImage = 'assets/images/products/headphones.png';

  constructor(
    private readonly cart: CartService,
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.cart.items$.subscribe(items => {
      this.items = [...items];
      this.total = this.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    });
  }

  ngOnDestroy(): void {
    this.clearCardFields();
  }

  lineTotal(item: CartItem): number {
    return Number(item.price) * item.quantity;
  }

  changeQuantity(item: CartItem, difference: number): void {
    if (!this.cart.updateQuantity(item.id, item.quantity + difference)) {
      this.checkoutError = `Only ${item.stock_qty} ${item.name} units are currently available.`;
    }
  }

  remove(item: CartItem): void {
    this.cart.removeFromCart(item.id);
  }

  useFallback(item: CartItem): void {
    item.image_url = this.fallbackImage;
  }

  onPaymentMethodChange(method: PaymentMethod): void {
    this.paymentMethod = method;
    this.checkoutError = '';
    this.cardValidationMessage = '';
    if (method !== 'card') this.clearCardFields();
  }

  formatCardNumber(): void {
    const digits = this.cardNumber.replace(/\D/g, '').slice(0, 19);
    this.cardNumber = digits.replace(/(.{4})/g, '$1 ').trim();
    this.clearCardError();
  }

  formatCardExpiry(): void {
    const digits = this.cardExpiry.replace(/\D/g, '').slice(0, 4);
    this.cardExpiry = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    this.clearCardError();
  }

  clearCardError(): void {
    this.cardValidationMessage = '';
    if (this.checkoutError === 'Review the card details before placing your order.') {
      this.checkoutError = '';
    }
  }

  checkout(): void {
    if (this.submitting) return;
    this.checkoutAttempted = true;
    this.checkoutError = '';
    if (!this.validateCheckout()) return;
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/cart' } });
      return;
    }
    const role = this.auth.currentUser?.role;
    if (role && !['buyer', 'seller'].includes(role)) {
      this.checkoutError = 'This staff account cannot place customer orders.';
      return;
    }

    this.submitting = true;
    const cardDetails = this.paymentMethod === 'card'
      ? this.safeCardMetadata()
      : {};
    this.api.createOrder({
      delivery_address: this.deliveryAddress.trim(),
      payment_method: this.paymentMethod,
      ...cardDetails,
      items: this.items.map(item => ({ product: item.id, quantity: item.quantity })),
    }).subscribe({
      next: () => {
        this.clearCardFields();
        this.cart.clearCart();
        this.router.navigate(['/orders'], { queryParams: { placed: '1' } });
      },
      error: error => {
        this.submitting = false;
        this.checkoutError = apiErrorMessage(error, 'We could not place your order. Check stock and try again.');
      }
    });
  }

  private validateCheckout(): boolean {
    if (!this.items.length) {
      this.checkoutError = 'Your cart is empty.';
      return false;
    }
    if (!this.deliveryAddress.trim()) {
      this.checkoutError = 'Enter a delivery address before placing your order.';
      return false;
    }
    if (this.paymentMethod !== 'card') return true;

    this.cardValidationMessage = this.validateCardDetails();
    if (this.cardValidationMessage) {
      this.checkoutError = 'Review the card details before placing your order.';
      return false;
    }
    return true;
  }

  private validateCardDetails(): string {
    if (this.cardholderName.trim().length < 2) {
      return 'Enter the cardholder name.';
    }

    const digits = this.cardDigits();
    if (!/^\d{12,19}$/.test(digits) || !this.isLuhnValid(digits)) {
      return 'Enter a valid card number.';
    }

    const expiry = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(this.cardExpiry);
    if (!expiry) return 'Enter the expiry date as MM/YY.';

    const expiryMonth = Number(expiry[1]);
    const expiryYear = 2000 + Number(expiry[2]);
    const now = new Date();
    if (expiryYear < now.getFullYear() || (expiryYear === now.getFullYear() && expiryMonth < now.getMonth() + 1)) {
      return 'Use a card that has not expired.';
    }

    if (!/^\d{3,4}$/.test(this.cardCvv)) {
      return 'Enter a valid 3- or 4-digit CVV.';
    }
    return '';
  }

  private safeCardMetadata(): { card_brand: string; card_last4: string } {
    const digits = this.cardDigits();
    return {
      card_brand: this.cardBrand(digits),
      card_last4: digits.slice(-4),
    };
  }

  private cardDigits(): string {
    return this.cardNumber.replace(/\D/g, '');
  }

  private cardBrand(digits: string): string {
    // Keep these stable API values aligned with Payment.CARD_BRANDS. The
    // orders screen turns them into human-friendly labels for display.
    if (/^4/.test(digits)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
    if (/^3[47]/.test(digits)) return 'amex';
    return 'other';
  }

  private isLuhnValid(digits: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let value = Number(digits[index]);
      if (shouldDouble) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  private clearCardFields(): void {
    this.cardholderName = '';
    this.cardNumber = '';
    this.cardExpiry = '';
    this.cardCvv = '';
    this.cardValidationMessage = '';
  }
}
