import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppNotification,
  AuditLogEntry,
  Category,
  DashboardOverview,
  Order,
  PagedResponse,
  Product,
  ProductReview,
  SalesReportRow,
  SavedProductItem,
  SupportTicket,
  SupportTicketStatus,
  User,
  UserRole,
} from '../models/api.models';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;
export type Collection<T> = T[] | PagedResponse<T>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';

  constructor(private readonly http: HttpClient) {}

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.baseUrl}/categories/`);
  }

  createCategory(category: Pick<Category, 'name' | 'description'>): Observable<Category> {
    return this.http.post<Category>(`${this.baseUrl}/categories/`, category);
  }

  updateCategory(id: number, category: Partial<Pick<Category, 'name' | 'description' | 'is_active'>>): Observable<Category> {
    return this.http.put<Category>(`${this.baseUrl}/categories/${id}/`, category);
  }

  deactivateCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/categories/${id}/`);
  }

  getProducts(params?: QueryParams): Observable<Collection<Product>> {
    return this.http.get<Collection<Product>>(`${this.baseUrl}/products/`, { params: this.toParams(params) });
  }

  getProduct(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.baseUrl}/products/${id}/`);
  }

  getTopProducts(limit = 10): Observable<Collection<Product>> {
    return this.http.get<Collection<Product>>(`${this.baseUrl}/products/top/`, {
      params: this.toParams({ limit: Math.max(1, Math.min(50, Math.floor(limit) || 10)) }),
    });
  }

  getProductReviews(productId: number): Observable<Collection<ProductReview>> {
    return this.http.get<Collection<ProductReview>>(`${this.baseUrl}/products/${productId}/reviews/`);
  }

  createProductReview(productId: number, review: { rating: number; comment?: string }): Observable<ProductReview> {
    return this.http.post<ProductReview>(`${this.baseUrl}/products/${productId}/reviews/`, review);
  }

  updateProductReview(productId: number, reviewId: number, review: { rating: number; comment?: string }): Observable<ProductReview> {
    return this.http.patch<ProductReview>(`${this.baseUrl}/products/${productId}/reviews/${reviewId}/`, review);
  }

  deleteProductReview(productId: number, reviewId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${productId}/reviews/${reviewId}/`);
  }

  getCategoryProducts(categoryId: number): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.baseUrl}/categories/${categoryId}/products/`);
  }

  createProduct(product: Omit<Product, 'id' | 'owner' | 'category_name' | 'product_name'>): Observable<Product> {
    return this.http.post<Product>(`${this.baseUrl}/products/`, product);
  }

  updateProduct(id: number, product: Partial<Omit<Product, 'id' | 'owner' | 'category_name' | 'product_name'>>): Observable<Product> {
    return this.http.patch<Product>(`${this.baseUrl}/products/${id}/`, product);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}/`);
  }

  updateStock(productId: number, stockQty: number, reason: string): Observable<Product> {
    return this.http.patch<Product>(`${this.baseUrl}/products/${productId}/stock/`, {
      stock_qty: stockQty,
      reason: reason.trim(),
    });
  }

  adjustStock(productId: number, adjustment: number, reason: string): Observable<Product> {
    return this.http.patch<Product>(`${this.baseUrl}/products/${productId}/stock/`, { adjustment, reason: reason.trim() });
  }

  getStockHistory(productId: number): Observable<Collection<Record<string, unknown>>> {
    return this.http.get<Collection<Record<string, unknown>>>(`${this.baseUrl}/products/${productId}/stock-history/`);
  }

  createOrder(order: {
    delivery_address: string;
    payment_method: 'card' | 'bank_transfer' | 'cash_on_delivery';
    card_brand?: string;
    card_last4?: string;
    items: Array<{ product: number; quantity: number }>;
  }): Observable<Order> {
    return this.http.post<Order>(`${this.baseUrl}/orders/`, order);
  }

  getUserOrders(): Observable<Collection<Order>> {
    return this.http.get<Collection<Order>>(`${this.baseUrl}/orders/`);
  }

  getWishlist(): Observable<Collection<SavedProductItem>> {
    return this.http.get<Collection<SavedProductItem>>(`${this.baseUrl}/wishlist/`);
  }

  addToWishlist(productId: number): Observable<SavedProductItem> {
    return this.http.post<SavedProductItem>(`${this.baseUrl}/wishlist/`, { product: productId });
  }

  removeFromWishlist(productId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/wishlist/${productId}/`);
  }

  getWaitlist(): Observable<Collection<SavedProductItem>> {
    return this.http.get<Collection<SavedProductItem>>(`${this.baseUrl}/waitlist/`);
  }

  addToWaitlist(productId: number): Observable<SavedProductItem> {
    return this.http.post<SavedProductItem>(`${this.baseUrl}/waitlist/`, { product: productId });
  }

  removeFromWaitlist(productId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/waitlist/${productId}/`);
  }

  getNotifications(): Observable<Collection<AppNotification>> {
    return this.http.get<Collection<AppNotification>>(`${this.baseUrl}/notifications/`);
  }

  markNotificationRead(notificationId: number): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`${this.baseUrl}/notifications/${notificationId}/read/`, {});
  }

  getSupportTickets(): Observable<Collection<SupportTicket>> {
    return this.http.get<Collection<SupportTicket>>(`${this.baseUrl}/support-tickets/`);
  }

  createSupportTicket(ticket: { subject: string; message: string; category?: string }): Observable<SupportTicket> {
    return this.http.post<SupportTicket>(`${this.baseUrl}/support-tickets/`, ticket);
  }

  updateSupportTicket(ticketId: number, update: { status: SupportTicketStatus; response?: string }): Observable<SupportTicket> {
    return this.http.patch<SupportTicket>(`${this.baseUrl}/support-tickets/${ticketId}/`, update);
  }

  getOrder(id: number): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/orders/${id}/`);
  }

  updateOrderStatus(orderId: number, status: string): Observable<Order> {
    return this.http.patch<Order>(`${this.baseUrl}/orders/${orderId}/`, { status });
  }

  cancelOrder(orderId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/orders/${orderId}/`);
  }

  prepareOrder(orderId: number): Observable<Order> {
    return this.http.post<Order>(`${this.baseUrl}/orders/${orderId}/prepare/`, {});
  }

  updateProfile(profile: Partial<Pick<User, 'first_name' | 'last_name' | 'email' | 'phone' | 'address'>>): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/me/`, profile);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/me/password/`, {
      old_password: currentPassword,
      new_password: newPassword,
    });
  }

  getSalesReport(): Observable<SalesReportRow[]> {
    return this.http.get<SalesReportRow[]>(`${this.baseUrl}/reports/sales/`);
  }

  getDashboardOverview(): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(`${this.baseUrl}/dashboard/overview/`);
  }

  getUsers(): Observable<Collection<User>> {
    return this.http.get<Collection<User>>(`${this.baseUrl}/users/`);
  }

  createUser(user: Record<string, unknown>): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users/`, user);
  }

  updateUserRole(userId: number, role: UserRole, reason?: string): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${userId}/role/`, {
      role,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    });
  }

  updateUserStatus(userId: number, isActive: boolean, reason: string): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${userId}/status/`, { is_active: isActive, reason: reason.trim() });
  }

  getAuditLogs(params?: QueryParams): Observable<Collection<AuditLogEntry>> {
    return this.http.get<Collection<AuditLogEntry>>(`${this.baseUrl}/audit-logs/`, { params: this.toParams(params) });
  }

  private toParams(params?: QueryParams): HttpParams {
    return Object.entries(params ?? {}).reduce((httpParams, [key, value]) => {
      return value === undefined || value === null || value === ''
        ? httpParams
        : httpParams.set(key, String(value));
    }, new HttpParams());
  }
}
