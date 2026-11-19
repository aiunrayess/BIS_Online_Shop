from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    Category,
    CustomerNotification,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductReview,
    ProductStockAdjustment,
    SecurityAuditLog,
    SupportTicket,
    WaitlistItem,
    WishlistItem,
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

    def order_payload(self, quantity=2, payment_method='card'):
        payload = {
            'delivery_address': '10 Shop Street, Astana',
            'payment_method': payment_method,
            'items': [{'product': self.product.id, 'quantity': quantity}],
        }
        if payment_method == 'card':
            payload.update({'card_brand': 'visa', 'card_last4': '4242'})
        return payload

    def test_order_decrements_stock_and_saves_payment_snapshot(self):
        self.client.force_authenticate(self.buyer)
        unsafe_payload = self.order_payload()
        unsafe_payload.update({'card_number': '4111111111111111', 'cvv': '123'})
        unsafe_response = self.client.post('/api/orders/', unsafe_payload, format='json')
        self.assertEqual(unsafe_response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

        nested_card_payload = self.order_payload()
        nested_card_payload['card'] = {'number': '4111111111111111'}
        nested_card_response = self.client.post('/api/orders/', nested_card_payload, format='json')
        self.assertEqual(nested_card_response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

        missing_metadata_payload = self.order_payload()
        missing_metadata_payload.pop('card_last4')
        missing_metadata_response = self.client.post(
            '/api/orders/', missing_metadata_payload, format='json'
        )
        self.assertEqual(missing_metadata_response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

        response = self.client.post('/api/orders/', self.order_payload(), format='json')

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_qty, 3)
        self.assertEqual(response.data['total_amount'], '241.00')
        self.assertEqual(response.data['items'][0]['unit_price'], '120.50')
        self.assertEqual(response.data['payment']['status'], 'Pending')
        self.assertEqual(response.data['payment']['amount'], '241.00')
        self.assertEqual(response.data['payment']['card_brand'], 'visa')
        self.assertEqual(response.data['payment']['card_last4'], '4242')
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
        payload = self.order_payload(quantity=1, payment_method='cash_on_delivery')
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
        payload = {
            'delivery_address': '10 Shop Street, Astana',
            'payment_method': payment_method,
            'items': [{'product': self.product.id, 'quantity': 1}],
        }
        if payment_method == 'card':
            payload.update({'card_brand': 'visa', 'card_last4': '4242'})
        return payload

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


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class CustomerEngagementAndSupportTests(TestCase):
    """Regression coverage for reviews, saved items, alerts, support, and safe account control."""

    def setUp(self):
        self.client = APIClient()
        self.buyer = User.objects.create_user(
            email='engagement-buyer@example.com',
            password='M0onlight!54321',
            role=User.ROLE_BUYER,
            first_name='Buyer',
            last_name='One',
            address='1 Main Street',
        )
        self.other_buyer = User.objects.create_user(
            email='engagement-other@example.com',
            password='M0onlight!54321',
            role=User.ROLE_BUYER,
            first_name='Other',
            last_name='Buyer',
            address='2 Main Street',
        )
        self.seller = User.objects.create_user(
            email='engagement-seller@example.com',
            password='M0onlight!54321',
            role=User.ROLE_SELLER,
        )
        self.manager = User.objects.create_user(
            email='engagement-manager@example.com',
            password='M0onlight!54321',
            role=User.ROLE_MANAGER,
        )
        self.warehouse = User.objects.create_user(
            email='engagement-warehouse@example.com',
            password='M0onlight!54321',
            role=User.ROLE_WAREHOUSE,
        )
        self.head_manager = User.objects.create_user(
            email='engagement-head@example.com',
            password='M0onlight!54321',
            role=User.ROLE_HEAD_MANAGER,
        )
        self.security_manager = User.objects.create_user(
            email='engagement-security@example.com',
            password='M0onlight!54321',
            role=User.ROLE_SECURITY_MANAGER,
        )
        self.category = Category.objects.create(name='Engagement category')
        self.product = Product.objects.create(
            name='Engagement headphones',
            price='100.00',
            description='A product used for engagement feature tests.',
            stock_qty=5,
            category=self.category,
            owner=self.seller,
        )
        self.zero_stock_product = Product.objects.create(
            name='Unavailable engagement speaker',
            price='45.00',
            description='Out of stock product for waiting-list tests.',
            stock_qty=0,
            category=self.category,
            owner=self.seller,
        )
        self.alternate_product = Product.objects.create(
            name='Alternate engagement product',
            price='80.00',
            description='Second product used for ranking tests.',
            stock_qty=10,
            category=self.category,
            owner=self.seller,
        )

    def order_payload(self, product=None, quantity=1):
        product = product or self.product
        return {
            'delivery_address': '10 Shop Street, Astana',
            'payment_method': 'card',
            'card_brand': 'visa',
            'card_last4': '4242',
            'items': [{'product': product.id, 'quantity': quantity}],
        }

    def create_ticket(self, customer=None):
        customer = customer or self.buyer
        self.client.force_authenticate(customer)
        response = self.client.post('/api/support-tickets/', {
            'subject': 'Delivery question',
            'message': 'Please help me track this delivery.',
            'category': 'order',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        return response.data['id']

    # Security Manager account control -------------------------------------------------

    def test_security_manager_can_reassign_operational_role_with_reason_and_audit(self):
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.buyer.id}/role/',
            {'role': User.ROLE_SELLER, 'reason': 'Verified operational team reassignment'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, User.ROLE_SELLER)
        event = SecurityAuditLog.objects.get(event_type='account_role_changed', target_user=self.buyer)
        self.assertTrue(event.metadata['performed_by_security_manager'])
        self.assertEqual(event.metadata['reason'], 'Verified operational team reassignment')

    def test_security_manager_role_change_requires_reason(self):
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.buyer.id}/role/',
            {'role': User.ROLE_SELLER},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, User.ROLE_BUYER)

    def test_security_manager_cannot_reassign_own_account(self):
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.security_manager.id}/role/',
            {'role': User.ROLE_BUYER, 'reason': 'Attempted unsafe self change'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_security_manager_cannot_reassign_protected_account(self):
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.head_manager.id}/role/',
            {'role': User.ROLE_BUYER, 'reason': 'Attempted protected account change'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_security_manager_cannot_change_django_administrator_account(self):
        system_account = User.objects.create_user(
            email='engagement-system-account@example.com',
            password='M0onlight!54321',
            role=User.ROLE_BUYER,
            is_staff=True,
        )
        self.client.force_authenticate(self.security_manager)
        role_response = self.client.patch(
            f'/api/users/{system_account.id}/role/',
            {'role': User.ROLE_SELLER, 'reason': 'Attempted privileged account change'},
            format='json',
        )
        status_response = self.client.patch(
            f'/api/users/{system_account.id}/status/',
            {'is_active': False, 'reason': 'Attempted privileged account lock'},
            format='json',
        )

        self.assertEqual(role_response.status_code, 403)
        self.assertEqual(status_response.status_code, 403)

    def test_security_manager_cannot_assign_protected_role(self):
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.buyer.id}/role/',
            {'role': User.ROLE_HEAD_MANAGER, 'reason': 'Attempted privilege escalation'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_security_manager_can_reactivate_operational_account_with_audit(self):
        self.buyer.is_active = False
        self.buyer.save(update_fields=('is_active',))
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/users/{self.buyer.id}/status/',
            {'is_active': True, 'reason': 'Identity verification completed'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.buyer.refresh_from_db()
        self.assertTrue(self.buyer.is_active)
        self.assertTrue(SecurityAuditLog.objects.filter(
            event_type='account_unlocked', target_user=self.buyer,
        ).exists())

    # Ratings and feedback -------------------------------------------------------------

    def test_customer_can_create_review_and_product_exposes_aggregates(self):
        self.client.force_authenticate(self.buyer)
        created = self.client.post(
            f'/api/products/{self.product.id}/reviews/',
            {'rating': 5, 'comment': 'Excellent sound quality.'},
            format='json',
        )
        product_response = self.client.get(f'/api/products/{self.product.id}/')

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['rating'], 5)
        self.assertEqual(product_response.data['average_rating'], 5.0)
        self.assertEqual(product_response.data['rating_count'], 1)

    def test_review_rating_must_be_in_one_to_five_range(self):
        self.client.force_authenticate(self.buyer)
        too_low = self.client.post(
            f'/api/products/{self.product.id}/reviews/', {'rating': 0}, format='json',
        )
        too_high = self.client.post(
            f'/api/products/{self.product.id}/reviews/', {'rating': 6}, format='json',
        )

        self.assertEqual(too_low.status_code, 400)
        self.assertEqual(too_high.status_code, 400)
        self.assertEqual(ProductReview.objects.count(), 0)

    def test_duplicate_review_is_rejected(self):
        self.client.force_authenticate(self.buyer)
        first = self.client.post(
            f'/api/products/{self.product.id}/reviews/', {'rating': 4}, format='json',
        )
        duplicate = self.client.post(
            f'/api/products/{self.product.id}/reviews/', {'rating': 5}, format='json',
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(ProductReview.objects.filter(product=self.product, user=self.buyer).count(), 1)

    def test_review_owner_can_edit_review(self):
        review = ProductReview.objects.create(product=self.product, user=self.buyer, rating=3)
        self.client.force_authenticate(self.buyer)
        response = self.client.patch(
            f'/api/products/{self.product.id}/reviews/{review.id}/',
            {'rating': 4, 'comment': 'Improved after further use.'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        review.refresh_from_db()
        self.assertEqual(review.rating, 4)
        self.assertEqual(review.comment, 'Improved after further use.')

    def test_other_customer_cannot_edit_or_delete_review(self):
        review = ProductReview.objects.create(product=self.product, user=self.buyer, rating=3)
        self.client.force_authenticate(self.other_buyer)
        edited = self.client.patch(
            f'/api/products/{self.product.id}/reviews/{review.id}/', {'rating': 5}, format='json',
        )
        deleted = self.client.delete(f'/api/products/{self.product.id}/reviews/{review.id}/')

        self.assertEqual(edited.status_code, 403)
        self.assertEqual(deleted.status_code, 403)
        self.assertTrue(ProductReview.objects.filter(pk=review.id).exists())

    def test_staff_account_cannot_submit_customer_review(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(
            f'/api/products/{self.product.id}/reviews/', {'rating': 5}, format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_public_review_payload_hides_contact_information(self):
        ProductReview.objects.create(product=self.product, user=self.buyer, rating=5, comment='Great')
        self.client.force_authenticate(user=None)
        response = self.client.get(f'/api/products/{self.product.id}/reviews/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['user']['id'], self.buyer.id)
        self.assertNotIn('email', response.data[0]['user'])
        self.assertNotIn('address', response.data[0]['user'])
        self.assertFalse(response.data[0]['is_owner'])

    def test_deleting_review_updates_product_rating_metrics(self):
        review = ProductReview.objects.create(product=self.product, user=self.buyer, rating=5)
        self.client.force_authenticate(self.buyer)
        deleted = self.client.delete(f'/api/products/{self.product.id}/reviews/{review.id}/')
        product_response = self.client.get(f'/api/products/{self.product.id}/')

        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(product_response.data['rating_count'], 0)
        self.assertEqual(product_response.data['average_rating'], 0.0)

    def test_top_products_rank_higher_rating_first(self):
        ProductReview.objects.create(product=self.product, user=self.buyer, rating=5)
        ProductReview.objects.create(product=self.alternate_product, user=self.other_buyer, rating=4)

        response = self.client.get('/api/products/top/?limit=10')
        ids = [item['id'] for item in response.data]

        self.assertEqual(response.status_code, 200)
        self.assertLess(ids.index(self.product.id), ids.index(self.alternate_product.id))

    def test_top_products_use_review_count_as_second_ranking_factor(self):
        ProductReview.objects.create(product=self.product, user=self.buyer, rating=4)
        ProductReview.objects.create(product=self.product, user=self.other_buyer, rating=4)
        ProductReview.objects.create(product=self.alternate_product, user=self.seller, rating=4)

        response = self.client.get('/api/products/top/?limit=10')
        ids = [item['id'] for item in response.data]

        self.assertLess(ids.index(self.product.id), ids.index(self.alternate_product.id))

    def test_top_products_use_sales_as_final_ranking_factor(self):
        ProductReview.objects.create(product=self.product, user=self.buyer, rating=4)
        ProductReview.objects.create(product=self.alternate_product, user=self.other_buyer, rating=4)
        paid_order = Order.objects.create(
            user=self.buyer,
            status='Paid',
            delivery_address='11 Sales Street',
            total_amount='240.00',
        )
        OrderItem.objects.create(
            order=paid_order,
            product=self.alternate_product,
            quantity=3,
            unit_price='80.00',
        )

        response = self.client.get('/api/products/top/?limit=10')
        ids = [item['id'] for item in response.data]

        self.assertLess(ids.index(self.alternate_product.id), ids.index(self.product.id))

    # Wishlist, waitlist, and notifications -------------------------------------------

    def test_customer_can_save_product_to_wishlist(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/wishlist/', {'product': self.product.id}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertTrue(WishlistItem.objects.filter(user=self.buyer, product=self.product).exists())
        self.assertFalse(response.data['waitlisted'])

    def test_zero_stock_wishlist_save_automatically_enrolls_waitlist(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post(
            '/api/wishlist/', {'product': self.zero_stock_product.id}, format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['waitlisted'])
        self.assertTrue(WaitlistItem.objects.filter(
            user=self.buyer, product=self.zero_stock_product, is_active=True,
        ).exists())

    def test_wishlist_is_private_to_its_owner(self):
        WishlistItem.objects.create(user=self.other_buyer, product=self.product)
        self.client.force_authenticate(self.buyer)
        response = self.client.get('/api/wishlist/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_wishlist_rejects_inactive_product(self):
        self.product.is_active = False
        self.product.save(update_fields=('is_active',))
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/wishlist/', {'product': self.product.id}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_waitlist_rejects_product_that_is_already_in_stock(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/waitlist/', {'product': self.product.id}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_duplicate_waitlist_post_is_idempotent(self):
        self.client.force_authenticate(self.buyer)
        first = self.client.post('/api/waitlist/', {'product': self.zero_stock_product.id}, format='json')
        second = self.client.post('/api/waitlist/', {'product': self.zero_stock_product.id}, format='json')

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(WaitlistItem.objects.filter(
            user=self.buyer, product=self.zero_stock_product,
        ).count(), 1)

    def test_customer_can_remove_active_waitlist_entry(self):
        WaitlistItem.objects.create(user=self.buyer, product=self.zero_stock_product)
        self.client.force_authenticate(self.buyer)
        response = self.client.delete(f'/api/waitlist/{self.zero_stock_product.id}/')

        self.assertEqual(response.status_code, 204)
        entry = WaitlistItem.objects.get(user=self.buyer, product=self.zero_stock_product)
        self.assertFalse(entry.is_active)

    def test_zero_to_positive_restock_notifies_each_waitlisted_customer_once(self):
        WaitlistItem.objects.create(user=self.buyer, product=self.zero_stock_product)
        WaitlistItem.objects.create(user=self.other_buyer, product=self.zero_stock_product)
        self.client.force_authenticate(self.warehouse)
        restocked = self.client.patch(
            f'/api/products/{self.zero_stock_product.id}/stock/',
            {'stock_qty': 4, 'reason': 'Supplier delivery received'},
            format='json',
        )

        self.assertEqual(restocked.status_code, 200)
        self.assertEqual(CustomerNotification.objects.filter(
            product=self.zero_stock_product,
            notification_type=CustomerNotification.TYPE_WAITLIST_PRODUCT_AVAILABLE,
        ).count(), 2)
        self.assertFalse(WaitlistItem.objects.filter(
            product=self.zero_stock_product, is_active=True,
        ).exists())

    def test_positive_to_positive_stock_change_does_not_notify_waitlist(self):
        WaitlistItem.objects.create(user=self.buyer, product=self.product)
        self.client.force_authenticate(self.warehouse)
        response = self.client.patch(
            f'/api/products/{self.product.id}/stock/',
            {'stock_qty': 7, 'reason': 'Cycle count correction'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(CustomerNotification.objects.filter(product=self.product).exists())
        self.assertTrue(WaitlistItem.objects.get(user=self.buyer, product=self.product).is_active)

    def test_notification_is_private_and_can_be_marked_read(self):
        own = CustomerNotification.objects.create(
            user=self.buyer,
            notification_type=CustomerNotification.TYPE_WAITLIST_PRODUCT_AVAILABLE,
            title='Available',
            message='Your item is available.',
            product=self.product,
        )
        CustomerNotification.objects.create(
            user=self.other_buyer,
            notification_type=CustomerNotification.TYPE_WAITLIST_PRODUCT_AVAILABLE,
            title='Other notification',
            message='This belongs to another customer.',
        )
        self.client.force_authenticate(self.buyer)
        listed = self.client.get('/api/notifications/?unread=true')
        marked = self.client.patch(f'/api/notifications/{own.id}/read/', format='json')

        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item['id'] for item in listed.data], [own.id])
        self.assertEqual(marked.status_code, 200)
        own.refresh_from_db()
        self.assertTrue(own.is_read)
        self.assertIsNotNone(own.read_at)

    def test_customer_can_reenroll_after_a_prior_restock_notification(self):
        entry = WaitlistItem.objects.create(
            user=self.buyer,
            product=self.zero_stock_product,
            is_active=False,
        )
        entry.notified_at = timezone.now()
        entry.save(update_fields=('notified_at',))
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/waitlist/', {'product': self.zero_stock_product.id}, format='json')

        self.assertEqual(response.status_code, 201)
        entry.refresh_from_db()
        self.assertTrue(entry.is_active)
        self.assertIsNone(entry.notified_at)

    def test_customer_order_cancellation_saves_cancelled_items_to_wishlist(self):
        self.client.force_authenticate(self.buyer)
        created = self.client.post('/api/orders/', self.order_payload(), format='json')
        cancelled = self.client.delete(f"/api/orders/{created.data['id']}/")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(cancelled.status_code, 204)
        self.assertTrue(WishlistItem.objects.filter(user=self.buyer, product=self.product).exists())
        event = SecurityAuditLog.objects.get(event_type='order_cancelled_by_customer')
        self.assertEqual(event.metadata['wishlisted_item_count'], 1)

    def test_management_cancellation_restock_notifies_waitlisted_customer(self):
        self.product.stock_qty = 1
        self.product.save(update_fields=('stock_qty',))
        self.client.force_authenticate(self.buyer)
        created = self.client.post('/api/orders/', self.order_payload(self.product), format='json')
        self.client.force_authenticate(self.other_buyer)
        waitlisted = self.client.post('/api/waitlist/', {'product': self.product.id}, format='json')
        self.client.force_authenticate(self.manager)
        cancelled = self.client.patch(
            f"/api/orders/{created.data['id']}/", {'status': 'Cancelled'}, format='json',
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(waitlisted.status_code, 201)
        self.assertEqual(cancelled.status_code, 200)
        self.assertTrue(CustomerNotification.objects.filter(
            user=self.other_buyer,
            product=self.product,
            notification_type=CustomerNotification.TYPE_WAITLIST_PRODUCT_AVAILABLE,
        ).exists())

    # Support workflow and analytics ---------------------------------------------------

    def test_customer_can_create_and_list_own_support_ticket(self):
        ticket_id = self.create_ticket()
        self.client.force_authenticate(self.buyer)
        listed = self.client.get('/api/support-tickets/')

        self.assertEqual(listed.status_code, 200)
        self.assertEqual([ticket['id'] for ticket in listed.data], [ticket_id])
        self.assertEqual(listed.data[0]['status'], SupportTicket.STATUS_OPEN)

    def test_customer_cannot_see_another_customers_support_ticket(self):
        ticket_id = self.create_ticket(self.other_buyer)
        self.client.force_authenticate(self.buyer)
        listed = self.client.get('/api/support-tickets/')

        self.assertEqual(listed.status_code, 200)
        self.assertNotIn(ticket_id, [ticket['id'] for ticket in listed.data])

    def test_customer_cannot_update_support_ticket(self):
        ticket_id = self.create_ticket()
        self.client.force_authenticate(self.buyer)
        response = self.client.patch(
            f'/api/support-tickets/{ticket_id}/',
            {'status': SupportTicket.STATUS_RESOLVED, 'response': 'Self resolution'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_manager_can_reply_to_ticket_and_customer_gets_notification_and_audit(self):
        ticket_id = self.create_ticket()
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            f'/api/support-tickets/{ticket_id}/',
            {'status': SupportTicket.STATUS_IN_PROGRESS, 'response': 'We are checking the delivery details.'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], SupportTicket.STATUS_IN_PROGRESS)
        self.assertTrue(CustomerNotification.objects.filter(
            user=self.buyer,
            notification_type=CustomerNotification.TYPE_SUPPORT_TICKET_UPDATED,
        ).exists())
        self.assertTrue(SecurityAuditLog.objects.filter(
            event_type='support_ticket_updated', target_user=self.buyer,
        ).exists())

    def test_security_manager_can_update_support_ticket(self):
        ticket_id = self.create_ticket()
        self.client.force_authenticate(self.security_manager)
        response = self.client.patch(
            f'/api/support-tickets/{ticket_id}/',
            {'status': SupportTicket.STATUS_RESOLVED, 'response': 'Account issue resolved securely.'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        ticket = SupportTicket.objects.get(pk=ticket_id)
        self.assertEqual(ticket.handled_by, self.security_manager)
        self.assertIsNotNone(ticket.resolved_at)

    def test_invalid_support_status_transition_is_rejected(self):
        ticket = SupportTicket.objects.create(
            customer=self.buyer,
            subject='Closed case',
            message='This ticket was closed already.',
            status=SupportTicket.STATUS_CLOSED,
        )
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            f'/api/support-tickets/{ticket.id}/',
            {'status': SupportTicket.STATUS_IN_PROGRESS},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, SupportTicket.STATUS_CLOSED)

    def test_support_ticket_requires_meaningful_subject_and_message(self):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/support-tickets/', {
            'subject': 'Hi',
            'message': 'No',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(SupportTicket.objects.count(), 0)

    def test_dashboard_includes_support_kpis(self):
        SupportTicket.objects.create(
            customer=self.buyer,
            subject='Open ticket',
            message='A meaningful open support message.',
            status=SupportTicket.STATUS_OPEN,
        )
        SupportTicket.objects.create(
            customer=self.other_buyer,
            subject='Working ticket',
            message='A meaningful in-progress support message.',
            status=SupportTicket.STATUS_IN_PROGRESS,
        )
        SupportTicket.objects.create(
            customer=self.buyer,
            subject='Done ticket',
            message='A meaningful resolved support message.',
            status=SupportTicket.STATUS_RESOLVED,
        )
        self.client.force_authenticate(self.head_manager)
        response = self.client.get('/api/dashboard/overview/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['open_support_tickets'], 2)
        self.assertEqual(response.data['support_tickets_by_status'][SupportTicket.STATUS_RESOLVED], 1)
