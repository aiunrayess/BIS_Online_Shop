import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage } from '../../utils/http';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="detail-page container">
      <a routerLink="/products" class="back"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to catalog</a>
      <section *ngIf="loading" class="state">Loading product…</section>
      <section *ngIf="!loading && error" class="state error" role="alert">
        <p>{{ error }}</p><a routerLink="/products" class="btn btn-primary">Browse catalog</a>
      </section>
      <article *ngIf="!loading && product" class="product-detail">
        <div class="image-panel">
          <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback()">
        </div>
        <div class="content">
          <p class="category">{{ product.category_name || 'Online Shop product' }}</p>
          <h1>{{ product.name }}</h1>
          <p class="sku">SKU: {{ product.sku }}</p>
          <p class="description">{{ product.description }}</p>
          <p class="price">{{ product.price | number:'1.0-2' }} KZT</p>
          <p class="stock" [class.unavailable]="product.stock_qty === 0">
            {{ product.stock_qty > 0 ? product.stock_qty + ' available' : 'Currently unavailable' }}
          </p>
          <div *ngIf="product.stock_qty > 0" class="purchase">
            <label for="quantity">Quantity</label>
            <div class="quantity-control">
              <button type="button" (click)="changeQuantity(-1)" [disabled]="quantity <= 1" aria-label="Decrease quantity">−</button>
              <input id="quantity" name="quantity" type="number" min="1" [max]="product.stock_qty" [(ngModel)]="quantity" (change)="normalizeQuantity()">
              <button type="button" (click)="changeQuantity(1)" [disabled]="quantity >= product.stock_qty" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" class="btn btn-primary add" (click)="addToCart()">Add to cart</button>
          </div>
          <p *ngIf="message" class="message" role="status">{{ message }}</p>
        </div>
      </article>
    </main>
  `,
  styles: [`
    .detail-page { padding: 38px 20px 72px; }.back { display: inline-flex; gap: 8px; color: var(--primary-dark); font-weight: 700; margin-bottom: 24px; }
    .state { display: grid; justify-items: center; gap: 14px; padding: 80px 20px; color: var(--text-light); }.state.error { color: #b91c1c; }
    .product-detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .9fr); gap: clamp(28px, 6vw, 72px); align-items: start; }
    .image-panel { min-height: 390px; border-radius: 18px; overflow: hidden; background: #f5f1eb; }.image-panel img { width: 100%; height: 100%; min-height: 390px; object-fit: cover; }
    .content { padding: 12px 0; }.category { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 8px 0; color: var(--secondary); font-size: clamp(2rem, 4vw, 3.25rem); line-height: 1.1; }.sku { color: var(--text-light); font-size: .85rem; }
    .description { margin: 28px 0; color: var(--text-light); line-height: 1.7; }.price { color: var(--secondary); font-size: 1.8rem; font-weight: 800; }
    .stock { margin: 8px 0 22px; color: #166534; font-weight: 700; }.stock.unavailable { color: #b91c1c; }.purchase { display: flex; align-items: end; gap: 13px; flex-wrap: wrap; }.purchase > label { width: 100%; color: var(--text-light); font-size: .85rem; font-weight: 700; }
    .quantity-control { display: flex; height: 44px; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }.quantity-control button { width: 40px; border: 0; background: #fff; cursor: pointer; font-size: 1.2rem; }.quantity-control button:disabled { color: #aaa; cursor: not-allowed; }.quantity-control input { width: 50px; border: 0; border-inline: 1px solid var(--border); text-align: center; font: inherit; }.add { min-height: 44px; }.message { margin-top: 16px; color: #166534; font-weight: 600; }
    @media (max-width: 760px) { .product-detail { grid-template-columns: 1fr; }.image-panel, .image-panel img { min-height: 280px; } }
  `]
})
export class ProductDetailComponent implements OnInit {
  product: Product | null = null;
  loading = true;
  error = '';
  quantity = 1;
  message = '';
  readonly fallbackImage = 'assets/images/products/headphones.png';

  constructor(
    private readonly api: ApiService,
    private readonly cart: CartService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        this.loading = false;
        this.error = 'That product could not be found.';
        return;
      }
      this.loadProduct(id);
    });
  }

  changeQuantity(delta: number): void {
    this.quantity += delta;
    this.normalizeQuantity();
  }

  normalizeQuantity(): void {
    const maximum = this.product?.stock_qty ?? 1;
    this.quantity = Math.min(maximum, Math.max(1, Math.floor(Number(this.quantity) || 1)));
  }

  addToCart(): void {
    if (!this.product) return;
    this.normalizeQuantity();
    let added = 0;
    for (let index = 0; index < this.quantity; index += 1) {
      if (!this.cart.addToCart(this.product)) break;
      added += 1;
    }
    this.message = added === this.quantity
      ? `${added} ${added === 1 ? 'item was' : 'items were'} added to your cart.`
      : `Only ${added} additional ${added === 1 ? 'item was' : 'items were'} available to add.`;
  }

  useFallback(): void {
    if (this.product) this.product.image_url = this.fallbackImage;
  }

  private loadProduct(id: number): void {
    this.loading = true;
    this.error = '';
    this.api.getProduct(id).subscribe({
      next: product => {
        this.product = product;
        this.quantity = product.stock_qty > 0 ? 1 : 0;
        this.loading = false;
      },
      error: error => {
        this.product = null;
        this.loading = false;
        this.error = apiErrorMessage(error, 'We could not load that product.');
      }
    });
  }
}
