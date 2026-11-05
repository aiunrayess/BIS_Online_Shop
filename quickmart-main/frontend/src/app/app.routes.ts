import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { CartComponent } from './pages/cart/cart';
import { CategoriesComponent } from './pages/categories/categories';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { HomeComponent } from './pages/home/home';
import { InfoComponent } from './pages/info/info';
import { LoginComponent } from './pages/login/login';
import { ManagementComponent } from './pages/management/management';
import { OrdersComponent } from './pages/orders/orders';
import { ProductDetailComponent } from './pages/product-detail/product-detail';
import { ProductsComponent } from './pages/products/products';
import { ProfileComponent } from './pages/profile/profile';
import { RegisterComponent } from './pages/register/register';
import { SecurityComponent } from './pages/security/security';
import { SellComponent } from './pages/sell/sell';
import { SellerListingsComponent } from './pages/seller-listings/seller-listings';
import { UserManagementComponent } from './pages/user-management/user-management';

export const routes: Routes = [
  { path: '', component: HomeComponent, title: 'Online Shop | Home' },
  { path: 'products', component: ProductsComponent, title: 'Online Shop | Catalogue' },
  { path: 'products/:id', component: ProductDetailComponent, title: 'Online Shop | Product' },
  { path: 'categories', component: CategoriesComponent, title: 'Online Shop | Categories' },
  { path: 'cart', component: CartComponent, title: 'Online Shop | Cart' },
  { path: 'orders', component: OrdersComponent, canActivate: [authGuard], title: 'Online Shop | My Orders' },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard], title: 'Online Shop | My Profile' },
  { path: 'sell', component: SellComponent, canActivate: [roleGuard('seller')], title: 'Online Shop | New Listing' },
  { path: 'seller/listings', component: SellerListingsComponent, canActivate: [roleGuard('seller')], title: 'Online Shop | My Listings' },
  { path: 'management', component: ManagementComponent, canActivate: [roleGuard('manager', 'warehouse', 'head_manager', 'admin')], title: 'Online Shop | Operations' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [roleGuard('head_manager', 'admin')], title: 'Online Shop | Dashboard' },
  { path: 'security', component: SecurityComponent, canActivate: [roleGuard('security_manager', 'admin')], title: 'Online Shop | Security Center' },
  { path: 'users', component: UserManagementComponent, canActivate: [roleGuard('head_manager', 'security_manager', 'admin')], title: 'Online Shop | People and Roles' },
  { path: 'login', component: LoginComponent, title: 'Online Shop | Sign in' },
  { path: 'register', component: RegisterComponent, title: 'Online Shop | Registration' },
  { path: 'info/:type', component: InfoComponent, title: 'Online Shop | Help Center' },
  { path: 'about', redirectTo: 'info/about-us', pathMatch: 'full' },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
