import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Product, ProductReview, User } from '../../models/api.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { apiErrorMessage, collectionItems } from '../../utils/http';

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
          <div class="summary-rating" [attr.aria-label]="ratingLabel(product)">
            <span class="stars" aria-hidden="true">★</span>
            <strong>{{ product.average_rating ?? 0 | number:'1.1-1' }}</strong>
            <span>{{ product.rating_count ?? 0 }} {{ (product.rating_count ?? 0) === 1 ? 'review' : 'reviews' }}</span>
          </div>
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
          <div *ngIf="canUseCustomerFeatures" class="saved-actions">
            <button type="button" class="btn btn-secondary" (click)="saveToWishlist()" [disabled]="savingWishlist || wishlistSaved">
              <i class="far fa-heart" aria-hidden="true"></i> {{ wishlistSaved ? 'Saved to wishlist' : savingWishlist ? 'Saving…' : 'Add to wishlist' }}
            </button>
            <button *ngIf="product.stock_qty === 0" type="button" class="btn btn-primary" (click)="joinWaitlist()" [disabled]="savingWaitlist || waitlistSaved">
              <i class="far fa-bell" aria-hidden="true"></i> {{ waitlistSaved ? 'Restock alert enabled' : savingWaitlist ? 'Saving…' : 'Notify me when available' }}
            </button>
          </div>
          <p *ngIf="!currentUser" class="signin-hint"><a routerLink="/login">Sign in</a> with a buyer or seller account to save products, request restock alerts, or leave a review.</p>
          <p *ngIf="currentUser && !canUseCustomerFeatures" class="signin-hint">Wishlist, restock alerts, and reviews are customer features available to Buyer and Seller accounts.</p>
          <p *ngIf="message" class="message" [class.error]="messageIsError" role="status">{{ message }}</p>
        </div>
      </article>

      <section *ngIf="!loading && product" class="reviews" aria-labelledby="reviews-title">
        <div class="reviews-heading">
          <div><p class="eyebrow">Customer feedback</p><h2 id="reviews-title">Ratings and reviews</h2></div>
          <div class="rating-total"><strong>{{ product.average_rating ?? 0 | number:'1.1-1' }}</strong><span>out of 5 · {{ product.rating_count ?? 0 }} {{ (product.rating_count ?? 0) === 1 ? 'review' : 'reviews' }}</span></div>
        </div>

        <form *ngIf="canUseCustomerFeatures" #reviewForm="ngForm" class="review-form" (ngSubmit)="submitReview(reviewForm)">
          <h3>{{ ownReview ? 'Update your review' : 'Share your feedback' }}</h3>
          <div class="rating-input">
            <span id="rating-label">Your rating</span>
            <div role="radiogroup" aria-labelledby="rating-label" class="rating-options">
              <label *ngFor="let star of starRange" [class.selected]="reviewRating === star"><input type="radio" name="rating" [value]="star" [(ngModel)]="reviewRating" required><span aria-hidden="true">★</span><span class="visually-hidden">{{ star }} star{{ star === 1 ? '' : 's' }}</span></label>
            </div>
          </div>
          <label for="review-comment">Feedback <span>(optional)</span><textarea id="review-comment" name="review-comment" [(ngModel)]="reviewComment" maxlength="1000" rows="4" placeholder="What did you like, and what could be improved?"></textarea><small>{{ reviewComment.length }}/1000</small></label>
          <div class="review-actions"><button type="submit" class="btn btn-primary" [disabled]="reviewSubmitting || reviewForm.invalid">{{ reviewSubmitting ? 'Saving…' : ownReview ? 'Update review' : 'Post review' }}</button><button *ngIf="ownReview" type="button" class="text-button" [disabled]="reviewDeleting" (click)="deleteReview()">{{ reviewDeleting ? 'Removing…' : 'Delete my review' }}</button></div>
        </form>
        <p *ngIf="!currentUser" class="signin-review"><a routerLink="/login">Sign in</a> with a buyer or seller account to share feedback and rate this product.</p>
        <p *ngIf="currentUser && !canUseCustomerFeatures" class="signin-review">Reviews are only available to Buyer and Seller accounts.</p>

        <section *ngIf="reviewsLoading" class="review-state" aria-live="polite">Loading reviews…</section>
        <section *ngIf="!reviewsLoading && reviewsError" class="review-state error" role="alert"><p>{{ reviewsError }}</p><button type="button" class="btn btn-secondary" (click)="loadReviews(product.id)">Try again</button></section>
        <section *ngIf="!reviewsLoading && !reviewsError && !reviews.length" class="review-state"><p>No feedback has been posted yet. Be the first to review this product.</p></section>
        <div *ngIf="!reviewsLoading && !reviewsError && reviews.length" class="review-list">
          <article *ngFor="let review of reviews" class="review">
            <header><div><strong>{{ reviewerName(review) }}</strong><p class="review-stars" [attr.aria-label]="review.rating + ' out of 5 stars'"><span *ngFor="let star of starRange" [class.filled]="star <= review.rating" aria-hidden="true">★</span></p></div><time [attr.datetime]="review.created_at">{{ review.created_at | date:'mediumDate' }}</time></header>
            <p *ngIf="review.comment" class="comment">{{ review.comment }}</p>
            <p *ngIf="review.updated_at && review.updated_at !== review.created_at" class="edited">Edited {{ review.updated_at | date:'mediumDate' }}</p>
          </article>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .detail-page { padding: 38px 20px 72px; }.back { display: inline-flex; gap: 8px; color: var(--primary-dark); font-weight: 700; margin-bottom: 24px; }.state { display: grid; justify-items: center; gap: 14px; padding: 80px 20px; color: var(--text-light); }.state.error, .review-state.error, .message.error { color: #b91c1c; }.product-detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .9fr); gap: clamp(28px, 6vw, 72px); align-items: start; }.image-panel { min-height: 390px; border-radius: 18px; overflow: hidden; background: #f5f1eb; }.image-panel img { width: 100%; height: 100%; min-height: 390px; object-fit: cover; }.content { padding: 12px 0; }.category, .eyebrow { color: var(--primary-dark); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }h1 { margin: 8px 0; color: var(--secondary); font-size: clamp(2rem, 4vw, 3.25rem); line-height: 1.1; }.sku { color: var(--text-light); font-size: .85rem; }.summary-rating { display: flex; align-items: center; gap: 6px; margin-top: 12px; color: var(--text-light); font-size: .88rem; }.summary-rating strong { color: var(--secondary); }.stars { color: #eab308; font-size: 1.1rem; }.description { margin: 28px 0; color: var(--text-light); line-height: 1.7; }.price { color: var(--secondary); font-size: 1.8rem; font-weight: 800; }.stock { margin: 8px 0 22px; color: #166534; font-weight: 700; }.stock.unavailable { color: #b91c1c; }.purchase { display: flex; align-items: end; gap: 13px; flex-wrap: wrap; }.purchase > label { width: 100%; color: var(--text-light); font-size: .85rem; font-weight: 700; }.quantity-control { display: flex; height: 44px; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }.quantity-control button { width: 40px; border: 0; background: #fff; cursor: pointer; font-size: 1.2rem; }.quantity-control button:disabled { color: #aaa; cursor: not-allowed; }.quantity-control input { width: 50px; border: 0; border-inline: 1px solid var(--border); text-align: center; font: inherit; }.add { min-height: 44px; }.saved-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }.btn-secondary { border: 1px solid var(--border); background: #fff; color: var(--secondary); }.saved-actions .btn:disabled { opacity: .62; cursor: wait; }.signin-hint { margin-top: 13px; color: var(--text-light); font-size: .86rem; }.signin-hint a, .signin-review a { color: var(--primary-dark); font-weight: 800; }.message { margin-top: 16px; color: #166534; font-weight: 600; }.reviews { margin-top: 58px; padding-top: 34px; border-top: 1px solid var(--border); }.reviews-heading { display: flex; justify-content: space-between; align-items: end; gap: 22px; }.reviews-heading h2 { margin-top: 5px; color: var(--secondary); font-size: 1.6rem; }.rating-total { display: grid; justify-items: end; color: var(--text-light); font-size: .86rem; }.rating-total strong { color: var(--secondary); font-size: 1.65rem; }.review-form { display: grid; gap: 14px; max-width: 760px; margin-top: 24px; padding: 20px; border: 1px solid var(--border); border-radius: 13px; background: #fff; }.review-form h3 { color: var(--secondary); font-size: 1.1rem; }.rating-input { display: grid; gap: 7px; color: var(--secondary); font-size: .84rem; font-weight: 700; }.rating-options { display: flex; gap: 5px; }.rating-options label { position: relative; cursor: pointer; color: #cbd5e1; font-size: 1.75rem; line-height: 1; }.rating-options label.selected, .rating-options label:hover { color: #eab308; }.rating-options input { position: absolute; opacity: 0; }.review-form > label { display: grid; gap: 7px; color: var(--secondary); font-size: .84rem; font-weight: 700; }.review-form label > span, .review-form small { color: var(--text-light); font-weight: 400; }.review-form textarea { width: 100%; resize: vertical; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; }.review-form small { text-align: right; }.review-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }.text-button { padding: 0; border: 0; background: transparent; color: #b91c1c; font: inherit; font-size: .86rem; font-weight: 700; cursor: pointer; }.text-button:disabled { opacity: .6; cursor: wait; }.signin-review { margin-top: 20px; color: var(--text-light); }.review-state { display: grid; justify-items: start; gap: 10px; padding: 32px 0; color: var(--text-light); }.review-list { display: grid; gap: 12px; margin-top: 24px; }.review { padding: 17px; border: 1px solid var(--border); border-radius: 12px; background: #fff; }.review header { display: flex; justify-content: space-between; gap: 16px; }.review header strong { color: var(--secondary); }.review header time, .edited { color: var(--text-light); font-size: .8rem; }.review-stars { margin-top: 4px; color: #cbd5e1; font-size: .95rem; }.review-stars .filled { color: #eab308; }.comment { margin-top: 10px; color: #374151; line-height: 1.55; white-space: pre-wrap; }.edited { margin-top: 10px; }.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }@media (max-width: 760px) { .product-detail { grid-template-columns: 1fr; }.image-panel, .image-panel img { min-height: 280px; }.reviews-heading { align-items: start; flex-direction: column; }.rating-total { justify-items: start; }.review header { flex-direction: column; gap: 8px; } }@media (max-width: 500px) { .detail-page { padding-inline: 14px; }.saved-actions .btn { width: 100%; }.review-form { padding: 16px; } }
  `]
})
export class ProductDetailComponent implements OnInit {
  product: Product | null = null;
  reviews: ProductReview[] = [];
  currentUser: User | null = null;
  loading = true;
  error = '';
  reviewsLoading = false;
  reviewsError = '';
  quantity = 1;
  message = '';
  messageIsError = false;
  reviewRating = 5;
  reviewComment = '';
  reviewSubmitting = false;
  reviewDeleting = false;
  savingWishlist = false;
  savingWaitlist = false;
  wishlistSaved = false;
  waitlistSaved = false;
  readonly starRange = [1, 2, 3, 4, 5];
  readonly fallbackImage = 'assets/images/products/headphones.png';

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly cart: CartService,
    private readonly route: ActivatedRoute,
  ) {}

  get ownReview(): ProductReview | undefined {
    return this.reviews.find(review => review.is_owner || review.user.id === this.currentUser?.id);
  }

  get canUseCustomerFeatures(): boolean {
    return this.currentUser?.role === 'buyer' || this.currentUser?.role === 'seller';
  }

  ngOnInit(): void {
    this.auth.restoreSession().subscribe(user => this.currentUser = user);
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
    this.setMessage(added === this.quantity
      ? `${added} ${added === 1 ? 'item was' : 'items were'} added to your cart.`
      : `Only ${added} additional ${added === 1 ? 'item was' : 'items were'} available to add.`);
  }

  saveToWishlist(): void {
    if (!this.product) return;
    if (!this.canUseCustomerFeatures) {
      this.setMessage('Please sign in with a buyer or seller account to save products to your wishlist.', true);
      return;
    }
    this.savingWishlist = true;
    this.setMessage('');
    this.api.addToWishlist(this.product.id).subscribe({
      next: saved => {
        this.savingWishlist = false;
        this.wishlistSaved = true;
        this.waitlistSaved = Boolean(saved.waitlisted) || this.waitlistSaved;
        this.setMessage(saved.waitlisted
          ? 'Saved to your wishlist and waiting list. We will notify you when it is back in stock.'
          : 'Saved to your wishlist.');
      },
      error: error => {
        this.savingWishlist = false;
        this.setMessage(apiErrorMessage(error, 'We could not save this product to your wishlist.'), true);
      },
    });
  }

  joinWaitlist(): void {
    if (!this.product) return;
    if (!this.canUseCustomerFeatures) {
      this.setMessage('Please sign in with a buyer or seller account to receive a restock notification.', true);
      return;
    }
    this.savingWaitlist = true;
    this.setMessage('');
    this.api.addToWaitlist(this.product.id).subscribe({
      next: () => {
        this.savingWaitlist = false;
        this.waitlistSaved = true;
        this.setMessage('Restock alert enabled. You can view it in your waiting list.');
      },
      error: error => {
        this.savingWaitlist = false;
        this.setMessage(apiErrorMessage(error, 'We could not add this product to your waiting list.'), true);
      },
    });
  }

  submitReview(form: NgForm): void {
    if (!this.product || !this.canUseCustomerFeatures || form.invalid || this.reviewSubmitting) return;
    const existing = this.ownReview;
    this.reviewSubmitting = true;
    this.setMessage('');
    const payload = { rating: Number(this.reviewRating), comment: this.reviewComment.trim() || undefined };
    const request = existing
      ? this.api.updateProductReview(this.product.id, existing.id, payload)
      : this.api.createProductReview(this.product.id, payload);
    request.subscribe({
      next: review => {
        this.reviews = existing
          ? this.reviews.map(item => item.id === review.id ? review : item)
          : [review, ...this.reviews];
        this.reviewRating = review.rating;
        this.reviewComment = review.comment ?? '';
        this.reviewSubmitting = false;
        this.setMessage(existing ? 'Your review was updated.' : 'Thank you for your feedback.');
        this.refreshProductSummary();
      },
      error: error => {
        this.reviewSubmitting = false;
        this.setMessage(apiErrorMessage(error, 'We could not save your review.'), true);
      },
    });
  }

  deleteReview(): void {
    const existing = this.ownReview;
    if (!this.product || !existing || this.reviewDeleting) return;
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    this.reviewDeleting = true;
    this.setMessage('');
    this.api.deleteProductReview(this.product.id, existing.id).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(review => review.id !== existing.id);
        this.reviewRating = 5;
        this.reviewComment = '';
        this.reviewDeleting = false;
        this.setMessage('Your review was deleted.');
        this.refreshProductSummary();
      },
      error: error => {
        this.reviewDeleting = false;
        this.setMessage(apiErrorMessage(error, 'We could not delete your review.'), true);
      },
    });
  }

  reviewerName(review: ProductReview): string {
    return [review.user.first_name, review.user.last_name].filter(Boolean).join(' ') || review.user.email || 'Customer';
  }

  ratingLabel(product: Product): string {
    const rating = product.average_rating ?? 0;
    const count = product.rating_count ?? 0;
    return `${rating.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;
  }

  useFallback(): void {
    if (this.product) this.product.image_url = this.fallbackImage;
  }

  loadReviews(productId: number): void {
    this.reviewsLoading = true;
    this.reviewsError = '';
    this.api.getProductReviews(productId).subscribe({
      next: response => {
        this.reviews = collectionItems(response);
        const own = this.ownReview;
        if (own) {
          this.reviewRating = own.rating;
          this.reviewComment = own.comment ?? '';
        }
        this.reviewsLoading = false;
      },
      error: error => {
        this.reviews = [];
        this.reviewsLoading = false;
        this.reviewsError = apiErrorMessage(error, 'We could not load customer reviews.');
      },
    });
  }

  private loadProduct(id: number): void {
    this.loading = true;
    this.error = '';
    this.reviews = [];
    this.wishlistSaved = false;
    this.waitlistSaved = false;
    this.api.getProduct(id).subscribe({
      next: product => {
        this.product = product;
        this.quantity = product.stock_qty > 0 ? 1 : 0;
        this.loading = false;
        this.loadReviews(product.id);
      },
      error: error => {
        this.product = null;
        this.loading = false;
        this.error = apiErrorMessage(error, 'We could not load that product.');
      }
    });
  }

  private refreshProductSummary(): void {
    if (!this.product) return;
    this.api.getProduct(this.product.id).subscribe({
      next: latest => this.product = { ...this.product, ...latest },
    });
  }

  private setMessage(message: string, isError = false): void {
    this.message = message;
    this.messageIsError = isError;
  }
}
