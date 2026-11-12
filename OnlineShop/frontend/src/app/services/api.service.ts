import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuditLogEntry,
  Category,
  DashboardOverview,
  Order,
  PagedResponse,
  Product,
  SalesReportRow,
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

  updateUserRole(userId: number, role: UserRole): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${userId}/role/`, { role });
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
