import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-top-products',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <main class="page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Community favourites</p>
          <h1>Top products</h1>
          <p>Products are ranked using customer ratings, review activity, and demand.</p>
        </div>
        <a class="btn btn-secondary" routerLink="/products">Browse all products</a>
      </header>

      <section *ngIf="loading" class="state" aria-live="polite">Loading top products…</section>
      <section *ngIf="!loading && error" class="state error" role="alert">
        <p>{{ error }}</p>
        <button type="button" class="btn btn-primary" (click)="load()">Try again</button>
      </section>
      <section *ngIf="!loading && !error && !products.length" class="state">
        <h2>No rankings yet</h2>
        <p>Products will appear here as customers leave ratings and feedback.</p>
      </section>

      <section *ngIf="!loading && !error && products.length" class="grid" aria-label="Top rated products">
        <article *ngFor="let product of products; index as index" class="card">
          <a [routerLink]="['/products', product.id]" class="image-link" [attr.aria-label]="'View ' + product.name">
            <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback(product)">
            <span class="rank" [attr.aria-label]="'Rank ' + (index + 1)">#{{ index + 1 }}</span>
          </a>
          <div class="body">
            <p class="category">{{ product.category_name || 'Featured product' }}</p>
            <h2><a [routerLink]="['/products', product.id]">{{ product.name }}</a></h2>
            <div class="rating" [attr.aria-label]="ratingLabel(product)">
              <span class="stars" aria-hidden="true">★</span>
              <strong>{{ product.average_rating ?? 0 | number:'1.1-1' }}</strong>
              <span>({{ product.rating_count ?? 0 }} {{ (product.rating_count ?? 0) === 1 ? 'review' : 'reviews' }})</span>
            </div>
            <p *ngIf="(product.units_sold ?? 0) > 0" class="sold"><i class="fas fa-chart-line" aria-hidden="true"></i> {{ product.units_sold }} sold</p>
            <div class="footer">
              <strong class="price">{{ product.price | number:'1.0-2' }} KZT</strong>
              <button type="button" class="btn btn-primary" (click)="addToCart(product)" [disabled]="product.stock_qty <= 0">
                {{ product.stock_qty > 0 ? 'Add to cart' : 'Sold out' }}
              </button>
            </div>
          </div>
        </article>
      </section>
      <p *ngIf="message" class="message" role="status">{{ message }}</p>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }.eyebrow, .category { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }.page-header p:not(.eyebrow) { color: var(--text-light); }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); white-space: nowrap; }.state { display: grid; justify-items: center; gap: 12px; padding: 76px 20px; color: var(--text-light); text-align: center; }.state.error { color: #b91c1c; }.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 22px; }.card { overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow); }.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-hover); transition: var(--transition); }.image-link { position: relative; height: 205px; background: #f5f1eb; }.image-link img { width: 100%; height: 100%; object-fit: cover; }.rank { position: absolute; top: 10px; left: 10px; padding: 5px 9px; border-radius: 999px; background: var(--secondary); color: #fff; font-size: .76rem; font-weight: 800; }.body { display: flex; flex: 1; flex-direction: column; gap: 9px; padding: 17px; }.body h2 { font-size: 1.08rem; line-height: 1.35; }.body h2 a:hover { color: var(--primary-dark); }.rating { display: flex; align-items: center; gap: 5px; color: var(--text-light); font-size: .84rem; }.rating strong { color: var(--secondary); }.stars { color: #eab308; font-size: 1.1rem; }.sold { color: #475569; font-size: .82rem; }.sold i { color: var(--primary-dark); }.footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; }.price { color: var(--secondary); }.footer .btn:disabled { opacity: .55; cursor: not-allowed; }.message { margin-top: 20px; color: #166534; font-weight: 700; }@media (max-width: 600px) { .page { padding-inline: 14px; }.page-header { align-items: start; flex-direction: column; }.page-header .btn { width: 100%; text-align: center; } }
  `]
})
export class TopProductsComponent implements OnInit {
  products: Product[] = [];
  loading = true;
  error = '';
  message = '';
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
    this.error = '';
    this.api.getTopProducts().subscribe({
      next: response => {
        this.products = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.products = [];
        this.loading = false;
        this.error = apiErrorMessage(error, 'We could not load the top products.');
      },
    });
  }

  addToCart(product: Product): void {
    this.message = this.cart.addToCart(product)
      ? `${product.name} was added to your cart.`
      : `No more ${product.name} units are currently available.`;
  }

  ratingLabel(product: Product): string {
    const rating = product.average_rating ?? 0;
    const count = product.rating_count ?? 0;
    return `${rating.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;
  }

  useFallback(product: Product): void {
    product.image_url = this.fallbackImage;
  }
}
