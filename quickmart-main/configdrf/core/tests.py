from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    Category,
    Order,
    Payment,
    Product,
    ProductStockAdjustment,
    SecurityAuditLog,
)


User = get_user_model()


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class StoreTransactionTests(TestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(
            email='buyer@example.com',
            password='test-password',
            role='buyer',
            address='1 Main Street',
        )
        self.manager = User.objects.create_user(
            email='manager@example.com',
            password='test-password',
            role='manager',
            address='2 Main Street',
        )
        self.warehouse = User.objects.create_user(
            email='warehouse@example.com',
            password='test-password',
            role='warehouse',
            address='3 Main Street',
        )
        self.category = Category.objects.create(name='Audio', description='Sound equipment')
        self.product = Product.objects.create(
            name='Headphones',
            price='120.50',
            description='Wireless headphones',
            stock_qty=5,
            category=self.category,
        )
        self.client = APIClient()

    def order_payload(self, quantity=2):
        return {
            'delivery_address': '10 Shop Street, Astana',
            'payment_method': 'card',
            'items': [{'product': self.product.id, 'quantity': quantity}],
        }

    def test_order_decrements_stock_and_saves_payment_snapshot(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/orders/', self.order_payload(), format='json')

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 3)
        self.assertEqual(response.data['total_amount'], '241.00')
        self.assertEqual(response.data['items'][0]['unit_price'], '120.50')
        self.assertEqual(response.data['payment']['status'], 'Pending')
        self.assertEqual(response.data['payment']['amount'], '241.00')
        self.product.price = '999.00'
        self.product.save(update_fields=('price',))
        order = Order.objects.get(pk=response.data['id'])
        self.assertEqual(order.total_amount, Decimal('241.00'))
        self.assertEqual(order.items.get().unit_price, Decimal('120.50'))

    def test_insufficient_stock_rolls_back_order_and_inventory(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/orders/', self.order_payload(quantity=6), format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(Payment.objects.count(), 0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 5)

    def test_customer_cancellation_restores_reserved_stock(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/orders/', self.order_payload(quantity=2), format='json')
        order_id = response.data['id']

        cancel_response = self.client.delete(f'/api/orders/{order_id}/')

        self.assertEqual(cancel_response.status_code, 204)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 5)
        order = Order.objects.get(pk=order_id)
        self.assertEqual(order.status, 'Cancelled')
        self.assertEqual(order.payment.status, 'Failed')
        repeated_cancel = self.client.delete(f'/api/orders/{order_id}/')
        self.assertEqual(repeated_cancel.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 5)

    def test_manager_can_mark_order_paid_and_get_sales_report(self):
        self.client.force_authenticate(self.buyer)
        create_response = self.client.post('/api/orders/', self.order_payload(), format='json')
        order_id = create_response.data['id']

        self.client.force_authenticate(self.manager)
        status_response = self.client.patch(
            f'/api/orders/{order_id}/',
            {'status': 'Paid'},
            format='json',
        )
        report_response = self.client.get('/api/reports/sales/')

        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.data['payment']['status'], 'Paid')
        self.assertEqual(len(report_response.data), 1)
        self.assertEqual(report_response.data[0]['units_sold'], 2)
        self.assertEqual(report_response.data[0]['revenue'], Decimal('241.00'))
        self.assertEqual(report_response.data[0]['stock_qty'], 3)

    def test_cash_on_delivery_is_marked_paid_when_delivered(self):
        self.client.force_authenticate(self.buyer)
        payload = self.order_payload(quantity=1)
        payload['payment_method'] = 'cash_on_delivery'
        create_response = self.client.post('/api/orders/', payload, format='json')
        order_id = create_response.data['id']

        self.client.force_authenticate(self.manager)
        shipped = self.client.patch(
            f'/api/orders/{order_id}/',
            {'status': 'Shipped'},
            format='json',
        )
        self.assertEqual(shipped.status_code, 200)
        self.assertEqual(shipped.data['payment']['status'], 'Pending')

        delivered = self.client.patch(
            f'/api/orders/{order_id}/',
            {'status': 'Delivered'},
            format='json',
        )
        self.assertEqual(delivered.status_code, 200)
        self.assertEqual(delivered.data['payment']['status'], 'Paid')
        self.assertIsNotNone(delivered.data['payment']['paid_at'])

    def test_only_warehouse_can_update_stock(self):
        self.client.force_authenticate(self.buyer)
        forbidden_response = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'stock_qty': 8, 'reason': 'Weekly stock count'},
            format='json',
        )
        self.assertEqual(forbidden_response.status_code, 403)

        self.client.force_authenticate(self.warehouse)
        update_response = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'stock_qty': 8, 'reason': 'Weekly stock count'},
            format='json',
        )
        self.assertEqual(update_response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 8)
        adjustment = ProductStockAdjustment.objects.get(product=self.product)
        self.assertEqual(adjustment.previous_quantity, 5)
        self.assertEqual(adjustment.delta, 3)

    def test_non_customer_cannot_place_orders(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/orders/', self.order_payload(), format='json')
        self.assertEqual(response.status_code, 403)

    def test_seller_can_place_customer_order(self):
        seller = User.objects.create_user(
            email='seller@example.com',
            password='test-password',
            role='seller',
        )
        self.client.force_authenticate(seller)
        response = self.client.post('/api/orders/', self.order_payload(), format='json')

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 3)

    def test_warehouse_order_view_does_not_expose_payment_records(self):
        self.client.force_authenticate(self.buyer)
        self.client.post('/api/orders/', self.order_payload(), format='json')
        self.client.force_authenticate(self.warehouse)

        response = self.client.get('/api/orders/')

        self.assertEqual(response.status_code, 200)
        self.assertNotIn('payment', response.data[0])
        self.assertNotIn('customer_id', response.data[0])
        self.assertEqual(response.data[0]['delivery_address'], '10 Shop Street, Astana')

    def test_registration_cannot_grant_staff_roles(self):
        response = self.client.post('/api/registration/', {
            'email': 'new-manager@example.com',
            'password': 'test-password',
            'first_name': 'New',
            'last_name': 'Manager',
            'role': 'manager',
            'address': '4 Main Street',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='new-manager@example.com').exists())

    def test_customer_cannot_read_another_customers_order(self):
        self.client.force_authenticate(self.buyer)
        create_response = self.client.post('/api/orders/', self.order_payload(), format='json')
        other_buyer = User.objects.create_user(
            email='other@example.com',
            password='test-password',
            role='buyer',
            address='5 Main Street',
        )
        self.client.force_authenticate(other_buyer)

        response = self.client.get(f"/api/orders/{create_response.data['id']}/")

        self.assertEqual(response.status_code, 404)

    def test_customer_can_edit_own_profile_but_not_role(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.patch('/api/me/', {
            'first_name': 'Updated',
            'address': '22 Updated Street',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.first_name, 'Updated')
        self.assertEqual(self.buyer.address, '22 Updated Street')

        forbidden_response = self.client.patch('/api/me/', {'role': 'manager'}, format='json')
        self.assertEqual(forbidden_response.status_code, 400)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, 'buyer')


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RoleOperationsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            email='buyer-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_BUYER,
            first_name='Buyer',
            last_name='One',
            address='1 Main Street',
        )
        self.seller = User.objects.create_user(
            email='seller-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_SELLER,
            first_name='Seller',
            last_name='One',
        )
        self.other_seller = User.objects.create_user(
            email='other-seller@example.com',
            password='M0onlight!54321',
            role=User.ROLE_SELLER,
        )
        self.manager = User.objects.create_user(
            email='manager-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_MANAGER,
        )
        self.warehouse = User.objects.create_user(
            email='warehouse-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_WAREHOUSE,
        )
        self.head_manager = User.objects.create_user(
            email='head-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_HEAD_MANAGER,
        )
        self.security_manager = User.objects.create_user(
            email='security-role@example.com',
            password='M0onlight!54321',
            role=User.ROLE_SECURITY_MANAGER,
        )
        self.category = Category.objects.create(name='Role test category')
        self.product = Product.objects.create(
            name='Role test headphones',
            price='200.00',
            description='A product for role test coverage.',
            stock_qty=10,
            category=self.category,
            owner=self.seller,
        )

    def order_payload(self, payment_method='card'):
        return {
            'delivery_address': '10 Shop Street, Astana',
            'payment_method': payment_method,
            'items': [{'product': self.product.id, 'quantity': 1}],
        }

    def test_head_manager_creates_and_assigns_only_operational_roles(self):
        self.client.force_authenticate(self.head_manager)
        created = self.client.post('/api/users/', {
            'email': 'new-warehouse@example.com',
            'password': 'T3stSecure!456',
            'first_name': 'New',
            'last_name': 'Warehouse',
            'role': User.ROLE_WAREHOUSE,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        new_user = User.objects.get(email='new-warehouse@example.com')
        self.assertEqual(new_user.role, User.ROLE_WAREHOUSE)

        reassigned = self.client.patch(
            f'/api/users/{self.buyer.id}/role/',
            {'role': User.ROLE_SELLER},
            format='json',
        )
        self.assertEqual(reassigned.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, User.ROLE_SELLER)

        privileged_role = self.client.patch(
            f'/api/users/{self.buyer.id}/role/',
            {'role': User.ROLE_SECURITY_MANAGER},
            format='json',
        )
        self.assertEqual(privileged_role.status_code, 400)
        protected_target = self.client.patch(
            f'/api/users/{self.security_manager.id}/role/',
            {'role': User.ROLE_BUYER},
            format='json',
        )
        self.assertEqual(protected_target.status_code, 403)

    def test_security_manager_controls_operational_account_and_reads_audit(self):
        self.client.force_authenticate(self.security_manager)
        status_response = self.client.patch(
            f'/api/users/{self.buyer.id}/status/',
            {'is_active': False, 'reason': 'Repeated failed verification checks'},
            format='json',
        )
        self.assertEqual(status_response.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertFalse(self.buyer.is_active)
        self.assertTrue(SecurityAuditLog.objects.filter(
            event_type='account_locked',
            target_user=self.buyer,
        ).exists())

        account_directory = self.client.get('/api/users/')
        self.assertEqual(account_directory.status_code, 200)
        self.assertNotIn('address', account_directory.data[0])
        audit_response = self.client.get('/api/audit-logs/')
        self.assertEqual(audit_response.status_code, 200)
        self.assertTrue(any(event['event_type'] == 'account_locked' for event in audit_response.data))
        protected = self.client.patch(
            f'/api/users/{self.head_manager.id}/status/',
            {'is_active': False, 'reason': 'This must be denied'},
            format='json',
        )
        self.assertEqual(protected.status_code, 403)

    def test_seller_can_manage_only_owned_product_and_deactivation_hides_catalog_item(self):
        self.client.force_authenticate(self.seller)
        updated = self.client.patch(
            f'/api/products/{self.product.id}/',
            {'price': '210.00'},
            format='json',
        )
        self.assertEqual(updated.status_code, 200)
        stock_attempt = self.client.patch(
            f'/api/products/{self.product.id}/',
            {'stock_qty': 20},
            format='json',
        )
        self.assertEqual(stock_attempt.status_code, 400)
        self.client.force_authenticate(self.other_seller)
        other_seller_attempt = self.client.patch(
            f'/api/products/{self.product.id}/',
            {'name': 'Not allowed'},
            format='json',
        )
        self.assertEqual(other_seller_attempt.status_code, 403)

        self.client.force_authenticate(self.seller)
        deactivated = self.client.delete(f'/api/products/{self.product.id}/')
        self.assertEqual(deactivated.status_code, 204)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.client.force_authenticate(user=None)
        catalog = self.client.get('/api/products/')
        self.assertEqual(catalog.status_code, 200)
        self.assertNotIn(self.product.id, [product['id'] for product in catalog.data['results']])

    def test_stock_adjustment_reason_history_and_negative_guard(self):
        self.client.force_authenticate(self.warehouse)
        missing_reason = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'stock_qty': 14},
            format='json',
        )
        self.assertEqual(missing_reason.status_code, 400)
        update = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'adjustment': 4, 'reason': 'Supplier delivery received'},
            format='json',
        )
        self.assertEqual(update.status_code, 200)
        history = self.client.get(f'/api/products/{self.product.id}/stock-history/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data[0]['delta'], 4)
        negative = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'adjustment': -99, 'reason': 'Incorrect count correction'},
            format='json',
        )
        self.assertEqual(negative.status_code, 400)

    def test_warehouse_can_prepare_paid_order_and_not_unpaid_card_order(self):
        self.client.force_authenticate(self.buyer)
        create_response = self.client.post('/api/orders/', self.order_payload(), format='json')
        order_id = create_response.data['id']
        self.client.force_authenticate(self.warehouse)
        unpaid_prepare = self.client.post(f'/api/orders/{order_id}/prepare/', format='json')
        self.assertEqual(unpaid_prepare.status_code, 400)

        self.client.force_authenticate(self.manager)
        paid = self.client.patch(
            f'/api/orders/{order_id}/',
            {'status': 'Paid'},
            format='json',
        )
        self.assertEqual(paid.status_code, 200)
        self.client.force_authenticate(self.warehouse)
        prepared = self.client.post(f'/api/orders/{order_id}/prepare/', format='json')
        self.assertEqual(prepared.status_code, 200)
        self.assertEqual(prepared.data['status'], 'Preparing')

    def test_head_dashboard_password_change_and_inactive_products(self):
        self.client.force_authenticate(self.head_manager)
        overview = self.client.get('/api/dashboard/overview/')
        self.assertEqual(overview.status_code, 200)
        self.assertIn('orders_by_status', overview.data)
        self.client.force_authenticate(self.manager)
        manager_overview = self.client.get('/api/dashboard/overview/')
        self.assertEqual(manager_overview.status_code, 403)

        self.client.force_authenticate(self.buyer)
        password_change = self.client.post('/api/me/password/', {
            'old_password': 'M0onlight!54321',
            'new_password': 'ChangedPassword!765',
        }, format='json')
        self.assertEqual(password_change.status_code, 204)
        self.buyer.refresh_from_db()
        self.assertTrue(self.buyer.check_password('ChangedPassword!765'))

        self.product.is_active = False
        self.product.save(update_fields=('is_active',))
        unavailable_order = self.client.post('/api/orders/', self.order_payload(), format='json')
        self.assertEqual(unavailable_order.status_code, 400)

    def test_superuser_is_created_with_database_administrator_role(self):
        superuser = User.objects.create_superuser(
            email='root@example.com',
            password='M0onlight!54321',
        )
        self.assertEqual(superuser.role, User.ROLE_ADMIN)
        self.assertTrue(superuser.is_staff)
        self.assertTrue(superuser.is_superuser)

    def test_user_can_revoke_only_own_refresh_session(self):
        self.client.force_authenticate(self.buyer)
        own_refresh = RefreshToken.for_user(self.buyer)
        logout = self.client.post('/api/logout/', {'refresh': str(own_refresh)}, format='json')
        self.assertEqual(logout.status_code, 204)

        another_refresh = RefreshToken.for_user(self.seller)
        forbidden = self.client.post('/api/logout/', {'refresh': str(another_refresh)}, format='json')
        self.assertEqual(forbidden.status_code, 403)
