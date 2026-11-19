import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Product, SavedProductItem } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-saved-lists',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Saved for you</p>
          <h1>Wishlist and waiting list</h1>
          <p>Save products to return to later. We notify you when a waiting-list product is restocked.</p>
        </div>
        <a routerLink="/notifications" class="btn btn-secondary"><i class="fas fa-bell" aria-hidden="true"></i> Notifications</a>
      </header>

      <p *ngIf="message" class="message" [class.error]="hasError" role="status">{{ message }}</p>
      <section *ngIf="loading" class="state" aria-live="polite">Loading your saved products…</section>
      <section *ngIf="!loading && hasError" class="state error" role="alert">
        <p>{{ message }}</p>
        <button type="button" class="btn btn-primary" (click)="load()">Try again</button>
      </section>

      <ng-container *ngIf="!loading && !hasError">
        <section class="list-section" aria-labelledby="wishlist-heading">
          <div class="section-heading">
            <div><h2 id="wishlist-heading">Wishlist</h2><p>Products you have saved to compare, buy, or monitor.</p></div>
            <span class="count">{{ wishlist.length }}</span>
          </div>
          <div *ngIf="!wishlist.length" class="empty-card">
            <h3>Your wishlist is empty</h3>
            <p>Open a product and choose “Add to wishlist” to save it here.</p>
            <a routerLink="/products" class="btn btn-primary">Browse products</a>
          </div>
          <div *ngIf="wishlist.length" class="saved-grid">
            <article *ngFor="let item of wishlist" class="saved-card">
              <a *ngIf="productFor(item) as product" [routerLink]="['/products', product.id]" class="image-link" [attr.aria-label]="'View ' + product.name">
                <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback(product)">
              </a>
              <div class="body">
                <p class="category">{{ productFor(item)?.category_name || 'Saved product' }}</p>
                <h3><a [routerLink]="['/products', item.product]">{{ productFor(item)?.name || 'Product #' + item.product }}</a></h3>
                <p *ngIf="productFor(item) as product" class="price">{{ product.price | number:'1.0-2' }} KZT</p>
                <p *ngIf="item.waitlisted" class="note"><i class="fas fa-clock" aria-hidden="true"></i> Also on your waiting list</p>
                <p *ngIf="productFor(item)?.stock_qty === 0 && !item.waitlisted" class="note unavailable"><i class="fas fa-box-open" aria-hidden="true"></i> Currently out of stock</p>
                <div class="actions">
                  <button *ngIf="(productFor(item)?.stock_qty ?? 0) > 0" type="button" class="btn btn-primary" [disabled]="busyProductId === item.product" (click)="addToCart(item)">Add to cart</button>
                  <button *ngIf="productFor(item)?.stock_qty === 0 && !item.waitlisted" type="button" class="btn btn-primary" [disabled]="busyProductId === item.product" (click)="joinWaitlist(item)">Notify me</button>
                  <button type="button" class="text-button" [disabled]="busyProductId === item.product" (click)="removeWishlist(item)">Remove</button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="list-section" aria-labelledby="waitlist-heading">
          <div class="section-heading">
            <div><h2 id="waitlist-heading">Waiting list</h2><p>We create an in-app notification when one of these products becomes available.</p></div>
            <span class="count">{{ waitlist.length }}</span>
          </div>
          <div *ngIf="!waitlist.length" class="empty-card">
            <h3>No waiting-list products</h3>
            <p>When a saved product is out of stock, you can ask to be notified here.</p>
          </div>
          <div *ngIf="waitlist.length" class="saved-grid">
            <article *ngFor="let item of waitlist" class="saved-card waiting">
              <a *ngIf="productFor(item) as product" [routerLink]="['/products', product.id]" class="image-link" [attr.aria-label]="'View ' + product.name">
                <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback(product)">
              </a>
              <div class="body">
                <p class="category">Waiting for stock</p>
                <h3><a [routerLink]="['/products', item.product]">{{ productFor(item)?.name || 'Product #' + item.product }}</a></h3>
                <p *ngIf="productFor(item) as product" class="price">{{ product.price | number:'1.0-2' }} KZT</p>
                <p *ngIf="item.notified_at; else monitoring" class="note available"><i class="fas fa-check-circle" aria-hidden="true"></i> Restock notification sent {{ item.notified_at | date:'mediumDate' }}</p>
                <ng-template #monitoring><p class="note"><i class="fas fa-bell" aria-hidden="true"></i> Monitoring availability</p></ng-template>
                <div class="actions">
                  <a *ngIf="(productFor(item)?.stock_qty ?? 0) > 0" [routerLink]="['/products', item.product]" class="btn btn-primary">Available now</a>
                  <button *ngIf="item.is_active !== false" type="button" class="text-button" [disabled]="busyProductId === item.product" (click)="removeWaitlist(item)">Stop notifications</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </ng-container>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 26px; }.eyebrow, .category { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }.page-header p:not(.eyebrow), .section-heading p, .empty-card p { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.message { margin: 0 0 18px; color: #166534; font-weight: 700; }.message.error, .state.error { color: #b91c1c; }.state { display: grid; justify-items: center; gap: 12px; padding: 76px 20px; color: var(--text-light); text-align: center; }.list-section { margin-top: 32px; }.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin-bottom: 14px; }.section-heading h2 { color: var(--secondary); font-size: 1.35rem; }.count { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 8px; border-radius: 999px; background: #f3f4f6; color: var(--secondary); font-weight: 800; }.empty-card { display: grid; justify-items: start; gap: 8px; padding: 24px; border: 1px dashed var(--border); border-radius: 13px; background: #fff; }.empty-card h3 { color: var(--secondary); }.saved-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 18px; }.saved-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 13px; background: #fff; box-shadow: var(--shadow); }.saved-card.waiting { border-color: #cbd5e1; }.image-link { height: 170px; background: #f5f1eb; }.image-link img { width: 100%; height: 100%; object-fit: cover; }.body { display: flex; flex: 1; flex-direction: column; gap: 8px; padding: 15px; }.body h3 { color: var(--secondary); font-size: 1.05rem; line-height: 1.35; }.body h3 a:hover { color: var(--primary-dark); }.price { color: var(--secondary); font-size: 1.05rem; font-weight: 800; }.note { display: flex; align-items: center; gap: 6px; color: #475569; font-size: .82rem; line-height: 1.4; }.note.unavailable { color: #b91c1c; }.note.available { color: #166534; }.actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: auto; padding-top: 5px; }.text-button { padding: 0; border: 0; background: transparent; color: #b91c1c; font: inherit; font-size: .84rem; font-weight: 700; cursor: pointer; }.text-button:disabled, .actions .btn:disabled { opacity: .6; cursor: wait; }@media (max-width: 600px) { .page { padding-inline: 14px; }.page-header { align-items: start; flex-direction: column; }.page-header .btn { width: 100%; text-align: center; } }
  `]
})
export class SavedListsComponent implements OnInit {
  wishlist: SavedProductItem[] = [];
  waitlist: SavedProductItem[] = [];
  loading = true;
  hasError = false;
  message = '';
  busyProductId: number | null = null;
  readonly fallbackImage = 'assets/images/products/headphones.png';

  constructor(
    private readonly api: ApiService,
    private readonly cart: CartService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.hasError = false;
    this.message = '';
    forkJoin({ wishlist: this.api.getWishlist(), waitlist: this.api.getWaitlist() }).subscribe({
      next: result => {
        this.wishlist = collectionItems(result.wishlist);
        this.waitlist = collectionItems(result.waitlist);
        this.loading = false;
      },
      error: error => {
        this.wishlist = [];
        this.waitlist = [];
        this.loading = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not load your saved products.');
      },
    });
  }

  productFor(item: SavedProductItem): Product | null {
    return item.product_detail ?? null;
  }

  addToCart(item: SavedProductItem): void {
    const product = this.productFor(item);
    if (!product) return;
    this.hasError = false;
    this.message = this.cart.addToCart(product)
      ? `${product.name} was added to your cart.`
      : `No more ${product.name} units are currently available.`;
  }

  joinWaitlist(item: SavedProductItem): void {
    this.busyProductId = item.product;
    this.hasError = false;
    this.message = '';
    this.api.addToWaitlist(item.product).subscribe({
      next: saved => {
        this.waitlist = this.waitlist.some(entry => entry.product === item.product)
          ? this.waitlist.map(entry => entry.product === item.product ? saved : entry)
          : [saved, ...this.waitlist];
        this.wishlist = this.wishlist.map(entry => entry.product === item.product ? { ...entry, waitlisted: true } : entry);
        this.busyProductId = null;
        this.message = 'You will be notified when this product is available again.';
      },
      error: error => {
        this.busyProductId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not add this product to the waiting list.');
      },
    });
  }

  removeWishlist(item: SavedProductItem): void {
    this.busyProductId = item.product;
    this.hasError = false;
    this.message = '';
    this.api.removeFromWishlist(item.product).subscribe({
      next: () => {
        this.wishlist = this.wishlist.filter(entry => entry.product !== item.product);
        this.busyProductId = null;
        this.message = 'Product removed from your wishlist.';
      },
      error: error => {
        this.busyProductId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not remove this wishlist item.');
      },
    });
  }

  removeWaitlist(item: SavedProductItem): void {
    this.busyProductId = item.product;
    this.hasError = false;
    this.message = '';
    this.api.removeFromWaitlist(item.product).subscribe({
      next: () => {
        this.waitlist = this.waitlist.filter(entry => entry.product !== item.product);
        this.wishlist = this.wishlist.map(entry => entry.product === item.product ? { ...entry, waitlisted: false } : entry);
        this.busyProductId = null;
        this.message = 'Waiting-list notifications were stopped.';
      },
      error: error => {
        this.busyProductId = null;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not remove this waiting-list item.');
      },
    });
  }

  useFallback(product: Product): void {
    product.image_url = this.fallbackImage;
  }
}
