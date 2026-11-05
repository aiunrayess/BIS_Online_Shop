import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Category, Product } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="products-page container">
      <header class="page-header">
        <div>
          <p class="eyebrow">Online Shop catalogue</p>
          <h1>Find the right product</h1>
          <p>Search, compare, and add available products to your cart.</p>
        </div>
      </header>

      <form class="filters" (ngSubmit)="applyFilters()" aria-label="Catalogue filters">
        <label>
          <span>Search</span>
          <input name="search" [(ngModel)]="search" maxlength="120" placeholder="Name or description">
        </label>
        <label>
          <span>Category</span>
          <select name="category" [(ngModel)]="selectedCategory">
            <option value="">All categories</option>
            <option *ngFor="let category of categories" [value]="category.id">{{ category.name }}</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select name="ordering" [(ngModel)]="ordering">
            <option value="name">Name A–Z</option>
            <option value="-name">Name Z–A</option>
            <option value="price">Price: low to high</option>
            <option value="-price">Price: high to low</option>
          </select>
        </label>
        <button class="btn btn-primary" type="submit">Apply</button>
        <button class="btn btn-secondary" type="button" (click)="clearFilters()">Clear</button>
      </form>

      <p *ngIf="cartMessage" class="notice" role="status">{{ cartMessage }}</p>
      <section *ngIf="loading" class="state" aria-live="polite">Loading products…</section>
      <section *ngIf="!loading && error" class="state error" role="alert">
        <p>{{ error }}</p>
        <button class="btn btn-primary" type="button" (click)="loadProducts()">Try again</button>
      </section>

      <section *ngIf="!loading && !error && products.length" class="product-grid" aria-label="Products">
        <article class="product-card" *ngFor="let product of products">
          <a [routerLink]="['/products', product.id]" class="image-link" [attr.aria-label]="'View ' + product.name">
            <img [src]="product.image_url || fallbackImage" [alt]="product.name" (error)="useFallback(product)">
            <span class="stock" [class.out]="product.stock_qty === 0" [class.low]="product.stock_qty > 0 && product.stock_qty <= 10">
              {{ stockLabel(product.stock_qty) }}
            </span>
          </a>
          <div class="card-body">
            <span class="category">{{ product.category_name || categoryName(product.category) }}</span>
            <h2><a [routerLink]="['/products', product.id]">{{ product.name }}</a></h2>
            <p class="description">{{ product.description || 'Product details are available on its page.' }}</p>
            <div class="card-footer">
              <strong>{{ product.price | number:'1.0-2' }} KZT</strong>
              <button class="btn btn-primary add" type="button" (click)="addToCart(product)" [disabled]="product.stock_qty === 0" [attr.aria-label]="'Add ' + product.name + ' to cart'">
                <i class="fas fa-cart-plus" aria-hidden="true"></i><span>Add</span>
              </button>
            </div>
          </div>
        </article>
      </section>

      <section *ngIf="!loading && !error && !products.length" class="state empty">
        <h2>No products matched those filters</h2>
        <p>Try a different search term or clear your filters.</p>
        <button class="btn btn-primary" type="button" (click)="clearFilters()">Show all products</button>
      </section>
    </main>
  `,
  styles: [`
    .products-page { padding: 44px 20px 72px; }
    .page-header { display: flex; justify-content: space-between; gap: 28px; margin-bottom: 28px; }
    h1 { margin: 3px 0 8px; color: var(--secondary); font-size: clamp(2rem, 4vw, 3rem); }
    .eyebrow, .category { color: var(--primary-dark); text-transform: uppercase; letter-spacing: .1em; font-size: .75rem; font-weight: 800; }
    .page-header p:not(.eyebrow) { color: var(--text-light); }
    .filters { display: grid; grid-template-columns: minmax(180px, 2fr) repeat(2, minmax(150px, 1fr)) auto auto; align-items: end; gap: 13px; padding: 18px; border: 1px solid var(--border); border-radius: 14px; background: #fff; }
    .filters label { display: grid; gap: 5px; color: var(--text-light); font-size: .82rem; font-weight: 700; }
    .filters input, .filters select { width: 100%; min-height: 42px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; font: inherit; }
    .btn-secondary { background: #fff; border: 1px solid var(--border); color: var(--secondary); }
    .notice { margin: 18px 0; color: #166534; font-weight: 600; }
    .state { display: grid; justify-items: center; gap: 12px; padding: 70px 20px; text-align: center; color: var(--text-light); }
    .state.error { color: #b91c1c; }
    .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 22px; margin-top: 28px; }
    .product-card { overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow); }
    .product-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); transition: var(--transition); }
    .image-link { height: 205px; position: relative; background: #f5f1eb; }
    .image-link img { width: 100%; height: 100%; object-fit: cover; }
    .stock { position: absolute; right: 10px; top: 10px; padding: 4px 8px; border-radius: 999px; background: #ecfdf5; color: #166534; font-size: .72rem; font-weight: 800; }
    .stock.low { background: #fffbeb; color: #92400e; }.stock.out { background: #fef2f2; color: #b91c1c; }
    .card-body { display: flex; flex: 1; flex-direction: column; gap: 10px; padding: 17px; }
    h2 { font-size: 1.05rem; line-height: 1.3; }.card-body h2 a:hover { color: var(--primary-dark); }
    .description { min-height: 43px; color: var(--text-light); font-size: .88rem; line-height: 1.45; }
    .card-footer { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .card-footer strong { color: var(--secondary); }.add { padding: 8px 11px; }.add:disabled { opacity: .55; cursor: not-allowed; }
    @media (max-width: 900px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .products-page { padding-inline: 14px; }.filters { grid-template-columns: 1fr; }.add span { display: none; } }
  `]
})
export class ProductsComponent implements OnInit {
  categories: Category[] = [];
  products: Product[] = [];
  search = '';
  selectedCategory = '';
  ordering = 'name';
  loading = true;
  error = '';
  cartMessage = '';
  readonly fallbackImage = 'assets/images/products/headphones.png';

  constructor(
    private readonly api: ApiService,
    private readonly cart: CartService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.loadCategories();
    this.route.queryParamMap.subscribe(params => {
      this.search = params.get('search') ?? '';
      this.selectedCategory = params.get('category') ?? '';
      this.ordering = params.get('ordering') ?? 'name';
      this.loadProducts();
    });
  }

  loadProducts(): void {
    this.loading = true;
    this.error = '';
    this.api.getProducts({
      search: this.search.trim() || undefined,
      category: this.selectedCategory || undefined,
      ordering: this.ordering || undefined,
    }).subscribe({
      next: response => {
        this.products = collectionItems(response);
        this.loading = false;
      },
      error: error => {
        this.products = [];
        this.loading = false;
        this.error = apiErrorMessage(error, 'We could not load the catalogue.');
      }
    });
  }

  applyFilters(): void {
    this.router.navigate(['/products'], {
      queryParams: {
        search: this.search.trim() || null,
        category: this.selectedCategory || null,
        ordering: this.ordering === 'name' ? null : this.ordering,
      }
    });
  }

  clearFilters(): void {
    this.search = '';
    this.selectedCategory = '';
    this.ordering = 'name';
    this.router.navigate(['/products']);
  }

  addToCart(product: Product): void {
    this.cartMessage = this.cart.addToCart(product)
      ? `${product.name} was added to your cart.`
      : `No more ${product.name} units are currently available.`;
  }

  useFallback(product: Product): void {
    product.image_url = this.fallbackImage;
  }

  categoryName(id: number): string {
    return this.categories.find(category => category.id === id)?.name ?? 'General';
  }

  stockLabel(stock: number): string {
    if (stock <= 0) return 'Sold out';
    if (stock <= 10) return `${stock} left`;
    return 'In stock';
  }

  private loadCategories(): void {
    this.api.getCategories().subscribe({
      next: categories => this.categories = categories,
      error: () => this.categories = [],
    });
  }
}
