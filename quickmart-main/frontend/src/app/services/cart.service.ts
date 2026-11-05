import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { CartItem, Product } from '../models/api.models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storagePrefix = 'Online Shop_cart_';
  private activeUserId: number | null;
  private items: CartItem[] = [];
  private readonly itemsSubject = new BehaviorSubject<readonly CartItem[]>([]);
  private readonly countSubject = new BehaviorSubject<number>(0);

  readonly items$ = this.itemsSubject.asObservable();
  readonly cartCount$ = this.countSubject.asObservable();

  constructor(private readonly auth: AuthService) {
    this.activeUserId = auth.currentUser?.id ?? null;
    this.items = this.readItems(this.storageKey(this.activeUserId));
    this.publish();

    this.auth.user$.subscribe(user => {
      const nextUserId = user?.id ?? null;
      if (nextUserId === this.activeUserId) return;

      const guestItems = this.activeUserId === null && nextUserId !== null ? this.items : [];
      this.activeUserId = nextUserId;
      this.items = this.mergeItems(this.readItems(this.storageKey(nextUserId)), guestItems);
      if (guestItems.length) this.removeStorage(this.storageKey(null));
      this.persist();
    });
  }

  getCartItems(): CartItem[] {
    return this.items.map(item => ({ ...item }));
  }

  addToCart(product: Product): boolean {
    const stock = Number(product.stock_qty);
    if (!Number.isFinite(stock) || stock <= 0) return false;

    const existing = this.items.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= stock) return false;
      existing.quantity += 1;
    } else {
      this.items.push({ ...product, quantity: 1 });
    }
    this.persist();
    return true;
  }

  updateQuantity(productId: number, quantity: number): boolean {
    const item = this.items.find(entry => entry.id === productId);
    if (!item || !Number.isInteger(quantity)) return false;
    if (quantity <= 0) {
      this.removeFromCart(productId);
      return true;
    }
    if (quantity > Number(item.stock_qty)) return false;
    item.quantity = quantity;
    this.persist();
    return true;
  }

  removeFromCart(productId: number): void {
    this.items = this.items.filter(item => item.id !== productId);
    this.persist();
  }

  clearCart(): void {
    this.items = [];
    this.persist();
  }

  private mergeItems(saved: CartItem[], guest: CartItem[]): CartItem[] {
    const result = saved.map(item => ({ ...item }));
    for (const item of guest) {
      const existing = result.find(entry => entry.id === item.id);
      if (!existing) {
        result.push({ ...item });
        continue;
      }
      existing.quantity = Math.min(Number(existing.stock_qty), existing.quantity + item.quantity);
    }
    return result.filter(item => item.quantity > 0 && item.quantity <= Number(item.stock_qty));
  }

  private persist(): void {
    this.writeStorage(this.storageKey(this.activeUserId), JSON.stringify(this.items));
    this.publish();
  }

  private publish(): void {
    const snapshot = this.getCartItems();
    this.itemsSubject.next(snapshot);
    this.countSubject.next(snapshot.reduce((total, item) => total + item.quantity, 0));
  }

  private storageKey(userId: number | null): string {
    return `${this.storagePrefix}${userId ?? 'guest'}`;
  }

  private readItems(key: string): CartItem[] {
    const raw = this.readStorage(key);
    if (!raw) return [];
    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) return [];
      return value.filter(this.isCartItem).map(item => ({ ...item }));
    } catch {
      this.removeStorage(key);
      return [];
    }
  }

  private isCartItem(value: unknown): value is CartItem {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<CartItem>;
    return typeof candidate.id === 'number'
      && typeof candidate.name === 'string'
      && typeof candidate.quantity === 'number'
      && Number.isInteger(candidate.quantity)
      && candidate.quantity > 0
      && typeof candidate.stock_qty === 'number';
  }

  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // A blocked local-storage context should not prevent shopping.
    }
  }

  private removeStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage is optional for the in-memory cart.
    }
  }
}
