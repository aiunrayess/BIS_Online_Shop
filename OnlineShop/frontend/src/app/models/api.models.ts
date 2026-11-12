export type UserRole =
  | 'buyer'
  | 'seller'
  | 'manager'
  | 'warehouse'
  | 'admin'
  | 'head_manager'
  | 'security_manager';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  role: UserRole;
  shop_name?: string | null;
  shop_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  category_name?: string;
  description: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  name: string;
  product_name?: string;
  sku: string;
  price: string | number;
  description: string;
  stock_qty: number;
  image_url?: string | null;
  category: number;
  category_name?: string;
  owner?: number | null;
  is_active?: boolean;
}

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash_on_delivery';
export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'Refunded';
export type OrderStatus = 'New' | 'Paid' | 'Preparing' | 'Shipped' | 'Delivered' | 'Cancelled';

/**
 * A safe card reference for the demo payment record. Full card numbers,
 * expiry dates, cardholder names, and CVVs must never leave the browser.
 */
export interface Payment {
  amount: string | number;
  method: PaymentMethod;
  status: PaymentStatus;
  paid_at?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
}

export interface OrderItem {
  product: number;
  product_name: string;
  quantity: number;
  unit_price: string | number;
}

export interface Order {
  id: number;
  customer_id?: number;
  order_date: string;
  status: OrderStatus;
  delivery_address: string;
  total_amount: string | number;
  items: OrderItem[];
  payment?: Payment;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface PagedResponse<T> {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface SalesReportRow {
  product_id: number;
  product_name: string;
  units_sold: number;
  revenue: string | number;
  stock_qty: number;
}

export interface DashboardOverview {
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: number;
  event_type: string;
  actor?: number | null;
  actor_email?: string | null;
  target_user?: number | null;
  target_user_email?: string | null;
  product?: number | null;
  order?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TokenResponse {
  access: string;
  refresh?: string;
}
