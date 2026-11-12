import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Category, Product, User } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

interface ProductDraft {
  name: string;
  sku: string;
  price: number;
  category: number;
  description: string;
  image_url: string;
}

@Component({
  selector: 'app-seller-listings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="page container">
      <header><div><p class="eyebrow">Seller workspace</p><h1>My listings</h1><p>Review and maintain products owned by your shop.</p></div><a routerLink="/sell" class="btn btn-primary"><i class="fas fa-plus" aria-hidden="true"></i> New listing</a></header>
      <p *ngIf="message" [class.error]="hasError" class="message" role="status">{{ message }}</p>
      <section *ngIf="loading" class="state">Loading your listings…</section>
      <section *ngIf="!loading && !hasError && !products.length" class="state"><h2>No listings yet</h2><p>Start by publishing your first product.</p><a routerLink="/sell" class="btn btn-primary">Create a listing</a></section>
      <section *ngIf="!loading && products.length" class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody><tr *ngFor="let product of products"><td><strong>{{ product.name }}</strong><small>{{ product.sku }}</small></td><td>{{ product.category_name || categoryName(product.category) }}</td><td>{{ product.price | number:'1.0-2' }} KZT</td><td>{{ product.stock_qty }}</td><td class="actions"><button type="button" class="text-button" (click)="beginEdit(product)">Edit</button><button type="button" class="text-button danger" (click)="remove(product)">Delete</button></td></tr></tbody></table></section>
      <section *ngIf="editing" class="editor" aria-label="Edit listing"><div class="editor-heading"><h2>Edit {{ editing.name }}</h2><button type="button" class="text-button" (click)="cancelEdit()">Close</button></div><form #editForm="ngForm" (ngSubmit)="saveEdit()"><label>Name<input name="name" [(ngModel)]="draft.name" required maxlength="100"></label><label>SKU<input name="sku" [(ngModel)]="draft.sku" maxlength="30"></label><div class="two"><label>Price (KZT)<input name="price" type="number" [(ngModel)]="draft.price" min="0.01" step="0.01" required></label><p class="stock-note"><strong>Current stock:</strong> {{ editing.stock_qty }}<br><span>Warehouse staff update inventory with an audit reason.</span></p></div><label>Category<select name="category" [(ngModel)]="draft.category" required><option *ngFor="let category of categories" [ngValue]="category.id">{{ category.name }}</option></select></label><label>Description<textarea name="description" [(ngModel)]="draft.description" required maxlength="500"></textarea></label><label>Image URL <span>(optional)</span><input name="image" type="url" [(ngModel)]="draft.image_url"></label><button class="btn btn-primary" type="submit" [disabled]="saving || editForm.invalid">{{ saving ? 'Saving…' : 'Save changes' }}</button></form></section>
    </main>
  `,
  styles: [`
    .page { padding: 46px 20px 72px; }.page > header { display: flex; justify-content: space-between; align-items: end; gap: 20px; margin-bottom: 24px; }.page header p:not(.eyebrow) { color: var(--text-light); }.eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 4px 0 7px; color: var(--secondary); }h2 { color: var(--secondary); }.message { margin-bottom: 18px; color: #166534; font-weight: 700; }.message.error { color: #b91c1c; }.state { display: grid; justify-items: center; gap: 12px; padding: 80px 20px; text-align: center; color: var(--text-light); }.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 13px; background: #fff; }table { width: 100%; border-collapse: collapse; }th, td { padding: 14px; border-bottom: 1px solid var(--border); text-align: left; }th { color: var(--text-light); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }tbody tr:last-child td { border-bottom: 0; }small { display: block; margin-top: 3px; color: var(--text-light); }.actions { display: flex; gap: 12px; }.text-button { border: 0; padding: 0; background: transparent; color: var(--primary-dark); font: inherit; font-weight: 700; cursor: pointer; }.danger { color: #b91c1c; }.editor { width: min(100%, 760px); margin-top: 28px; padding: 24px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.editor-heading { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 16px; }.editor form { display: grid; gap: 14px; }.editor label { display: grid; gap: 6px; color: var(--secondary); font-size: .88rem; font-weight: 700; }.editor label span, .stock-note span { color: var(--text-light); font-weight: 400; }.editor input, .editor select, .editor textarea { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }.editor textarea { min-height: 90px; resize: vertical; }.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }.stock-note { margin: 0; padding: 10px; border: 1px solid var(--border); border-radius: 8px; color: var(--secondary); line-height: 1.45; }.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    @media (max-width: 600px) { .page > header { align-items: start; flex-direction: column; }.two { grid-template-columns: 1fr; } }
  `]
})
export class SellerListingsComponent implements OnInit {
  user: User | null = null;
  categories: Category[] = [];
  products: Product[] = [];
  editing: Product | null = null;
  draft: ProductDraft = this.emptyDraft();
  loading = true;
  saving = false;
  message = '';
  hasError = false;

  constructor(private readonly api: ApiService, private readonly auth: AuthService) {}

  ngOnInit(): void {
    this.api.getCategories().subscribe({ next: categories => this.categories = categories });
    this.auth.restoreSession().subscribe(user => {
      this.user = user;
      if (user) this.loadProducts();
    });
  }

  categoryName(id: number): string {
    return this.categories.find(category => category.id === id)?.name ?? 'Uncategorized';
  }

  beginEdit(product: Product): void {
    this.editing = product;
    this.draft = {
      name: product.name,
      sku: product.sku,
      price: Number(product.price),
      category: product.category,
      description: product.description,
      image_url: product.image_url ?? '',
    };
    this.message = '';
    this.hasError = false;
  }

  cancelEdit(): void {
    this.editing = null;
    this.draft = this.emptyDraft();
  }

  saveEdit(): void {
    if (!this.editing || this.saving) return;
    this.saving = true;
    this.api.updateProduct(this.editing.id, {
      ...this.draft,
      image_url: this.draft.image_url.trim() || null,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Listing updated.';
        this.cancelEdit();
        this.loadProducts();
      },
      error: error => {
        this.saving = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not update this listing.');
      }
    });
  }

  remove(product: Product): void {
    if (!window.confirm(`Delete “${product.name}”? This cannot be undone.`)) return;
    this.api.deleteProduct(product.id).subscribe({
      next: () => {
        this.message = 'Listing deleted.';
        this.loadProducts();
      },
      error: error => {
        this.hasError = true;
        this.message = apiErrorMessage(error, 'This listing could not be deleted.');
      }
    });
  }

  private loadProducts(): void {
    this.loading = true;
    this.hasError = false;
    this.api.getProducts({ mine: true }).subscribe({
      next: response => {
        const allProducts = collectionItems(response);
        // The client-side owner filter keeps this page safe with older API versions that ignore ?owner=.
        this.products = this.user ? allProducts.filter(product => product.owner === this.user?.id) : [];
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.hasError = true;
        this.message = apiErrorMessage(error, 'We could not load your listings.');
      }
    });
  }

  private emptyDraft(): ProductDraft {
    return { name: '', sku: '', price: 0, category: 0, description: '', image_url: '' };
  }
}
