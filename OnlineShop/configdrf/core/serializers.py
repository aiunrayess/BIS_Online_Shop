from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Avg, F
from rest_framework import serializers

from .audit import record_audit_event
from .models import (
    Category,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductReview,
    ProductStockAdjustment,
    SecurityAuditLog,
    CustomerNotification,
    SupportTicket,
    User,
    WaitlistItem,
    WishlistItem,
)


def validate_user_password(value, user=None):
    try:
        validate_password(value, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    is_superuser = serializers.BooleanField(read_only=True)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    address = serializers.CharField(max_length=200, required=True)
    created_at = serializers.DateTimeField(source='date_joined', read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'email', 'password', 'first_name', 'last_name', 'phone',
            'address', 'role', 'shop_name', 'shop_address', 'latitude', 'longitude',
            'is_superuser', 'created_at',
        )

    def validate_role(self, value):
        if value not in (User.ROLE_BUYER, User.ROLE_SELLER):
            raise serializers.ValidationError('Only buyer and seller accounts can register.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('User with this email already exists')
        return value

    def validate_password(self, value):
        return validate_user_password(value)

    def validate(self, attrs):
        candidate = User(
            email=attrs.get('email', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        attrs['password'] = validate_user_password(attrs['password'], user=candidate)
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        record_audit_event(
            'account_registered',
            actor=user,
            target_user=user,
            metadata={'role': user.role},
        )
        return user


class ProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    address = serializers.CharField(max_length=200, required=True)
    created_at = serializers.DateTimeField(source='date_joined', read_only=True)

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'phone', 'address', 'role', 'created_at')
        read_only_fields = ('id', 'role', 'created_at')

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.exclude(pk=self.instance.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError('User with this email already exists.')
        return value


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('The current password is incorrect.')
        return value

    def validate_new_password(self, value):
        return validate_user_password(value, user=self.context['request'].user)

    def validate(self, attrs):
        if attrs['old_password'] == attrs['new_password']:
            raise serializers.ValidationError({
                'new_password': 'Choose a new password that differs from the current password.'
            })
        return attrs


class ManagedUserSerializer(serializers.ModelSerializer):
    created_at = serializers.DateTimeField(source='date_joined', read_only=True)

    class Meta:
        model = User
        fields = (
            'id', 'email', 'first_name', 'last_name', 'phone', 'address', 'role',
            'is_active', 'last_login', 'created_at',
        )
        read_only_fields = fields


class AccountDirectorySerializer(serializers.ModelSerializer):
    """Minimum account data a security manager needs for account protection."""

    created_at = serializers.DateTimeField(source='date_joined', read_only=True)

    class Meta:
        model = User
        fields = ('id', 'email', 'role', 'is_active', 'last_login', 'created_at')
        read_only_fields = fields


class ManagedAccountCreateSerializer(serializers.ModelSerializer):
    """Creation path used by a head manager for operational accounts only."""

    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    role = serializers.ChoiceField(
        choices=(
            User.ROLE_BUYER,
            User.ROLE_SELLER,
            User.ROLE_MANAGER,
            User.ROLE_WAREHOUSE,
        )
    )

    class Meta:
        model = User
        fields = (
            'id', 'email', 'password', 'first_name', 'last_name', 'phone', 'address', 'role',
        )
        read_only_fields = ('id',)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('User with this email already exists.')
        return value

    def validate_password(self, value):
        return validate_user_password(value)

    def validate(self, attrs):
        candidate = User(
            email=attrs.get('email', ''),
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        attrs['password'] = validate_user_password(attrs['password'], user=candidate)
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class RoleAssignmentSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=(
            User.ROLE_BUYER,
            User.ROLE_SELLER,
            User.ROLE_MANAGER,
            User.ROLE_WAREHOUSE,
        )
    )
    reason = serializers.CharField(
        max_length=250,
        trim_whitespace=True,
        required=False,
        allow_blank=False,
    )

    def validate_reason(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError('Provide a meaningful reason of at least 3 characters.')
        return value.strip()


class AccountStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()
    reason = serializers.CharField(max_length=250, trim_whitespace=True)

    def validate_reason(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError('Provide a meaningful reason of at least 3 characters.')
        return value.strip()


class CategorySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='name', read_only=True)

    class Meta:
        model = Category
        fields = ('id', 'name', 'category_name', 'description', 'is_active')


class ProductSerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    product_name = serializers.CharField(source='name', read_only=True)
    average_rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    units_sold = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'product_name', 'sku', 'price', 'description',
            'stock_qty', 'image_url', 'category', 'category_name', 'owner', 'is_active',
            'average_rating', 'rating_count', 'units_sold',
        )

    def get_average_rating(self, obj):
        average = getattr(obj, 'average_rating', None)
        if average is None:
            average = obj.reviews.aggregate(average=Avg('rating'))['average']
        return round(float(average or 0), 2)

    def get_rating_count(self, obj):
        count = getattr(obj, 'rating_count', None)
        return int(count if count is not None else obj.reviews.count())

    def get_units_sold(self, obj):
        return int(getattr(obj, 'units_sold', 0) or 0)

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('Price must be greater than zero.')
        return value

    def validate_stock_qty(self, value):
        if value < 0:
            raise serializers.ValidationError('Stock cannot be negative.')
        return value

    def validate_category(self, value):
        if not value.is_active:
            raise serializers.ValidationError('Products cannot be assigned to an inactive category.')
        return value

    def validate_sku(self, value):
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError('SKU cannot be blank.')
        return value


class PublicUserSerializer(serializers.ModelSerializer):
    """Public, non-contact identity data used in reviews and support responses."""

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name')
        read_only_fields = fields


class ProductReviewSerializer(serializers.ModelSerializer):
    user = PublicUserSerializer(read_only=True)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = ProductReview
        fields = (
            'id', 'product', 'user', 'rating', 'comment', 'created_at', 'updated_at',
            'is_owner',
        )
        read_only_fields = ('id', 'product', 'user', 'created_at', 'updated_at', 'is_owner')

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return bool(
            request
            and getattr(request.user, 'is_authenticated', False)
            and obj.user_id == request.user.id
        )

    def validate_comment(self, value):
        return value.strip()


class WishlistItemSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)
    waitlisted = serializers.SerializerMethodField()

    class Meta:
        model = WishlistItem
        fields = ('id', 'product', 'product_detail', 'created_at', 'waitlisted')
        read_only_fields = ('id', 'product_detail', 'created_at', 'waitlisted')

    def get_waitlisted(self, obj):
        return WaitlistItem.objects.filter(
            user_id=obj.user_id,
            product_id=obj.product_id,
            is_active=True,
        ).exists()


class WaitlistItemSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)

    class Meta:
        model = WaitlistItem
        fields = (
            'id', 'product', 'product_detail', 'is_active', 'created_at', 'notified_at',
        )
        read_only_fields = ('id', 'product_detail', 'is_active', 'created_at', 'notified_at')


class CustomerNotificationSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='notification_type', read_only=True)
    product_detail = ProductSerializer(source='product', read_only=True)

    class Meta:
        model = CustomerNotification
        fields = (
            'id', 'type', 'title', 'message', 'product', 'product_detail',
            'is_read', 'created_at', 'read_at',
        )
        read_only_fields = fields


class SupportTicketCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ('subject', 'message', 'category')

    def validate_subject(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError('Subject must contain at least 3 characters.')
        return value

    def validate_message(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError('Message must contain at least 5 characters.')
        return value


class SupportTicketUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ('status', 'response')
        extra_kwargs = {
            'status': {'required': False},
            'response': {'required': False, 'allow_blank': False},
        }

    def validate_response(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError('Response must contain at least 2 characters.')
        return value

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('Provide a status or response to update this ticket.')
        return attrs


class SupportTicketSerializer(serializers.ModelSerializer):
    customer = PublicUserSerializer(read_only=True)
    handled_by = PublicUserSerializer(read_only=True)

    class Meta:
        model = SupportTicket
        fields = (
            'id', 'customer', 'handled_by', 'subject', 'message', 'category', 'status',
            'response', 'created_at', 'updated_at', 'resolved_at',
        )
        read_only_fields = fields


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ('product', 'product_name', 'quantity', 'unit_price')
        read_only_fields = ('unit_price',)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        return value


class ProductStockUpdateSerializer(serializers.Serializer):
    """Accept either a reconciled quantity or a signed stock movement."""

    stock_qty = serializers.IntegerField(min_value=0, required=False)
    adjustment = serializers.IntegerField(required=False)
    reason = serializers.CharField(max_length=250, trim_whitespace=True)

    def validate(self, attrs):
        has_stock_qty = 'stock_qty' in attrs
        has_adjustment = 'adjustment' in attrs
        if has_stock_qty == has_adjustment:
            raise serializers.ValidationError(
                'Provide exactly one of stock_qty or adjustment.'
            )
        if has_adjustment and attrs['adjustment'] == 0:
            raise serializers.ValidationError({'adjustment': 'Adjustment cannot be zero.'})
        if len(attrs['reason'].strip()) < 3:
            raise serializers.ValidationError({'reason': 'Provide a meaningful reason of at least 3 characters.'})
        attrs['reason'] = attrs['reason'].strip()
        return attrs


class ProductStockAdjustmentSerializer(serializers.ModelSerializer):
    performed_by_email = serializers.EmailField(source='performed_by.email', read_only=True)

    class Meta:
        model = ProductStockAdjustment
        fields = (
            'id', 'product', 'performed_by', 'performed_by_email', 'previous_quantity',
            'new_quantity', 'delta', 'reason', 'created_at',
        )
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ('amount', 'method', 'status', 'paid_at', 'card_brand', 'card_last4')
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    customer_id = serializers.IntegerField(source='user_id', read_only=True)
    payment_method = serializers.ChoiceField(choices=Payment.METHODS, write_only=True)
    card_brand = serializers.ChoiceField(
        choices=Payment.CARD_BRANDS,
        write_only=True,
        required=False,
    )
    card_last4 = serializers.RegexField(
        regex=r'^\d{4}$',
        max_length=4,
        min_length=4,
        write_only=True,
        required=False,
    )
    payment = PaymentSerializer(read_only=True)

    class Meta:
        model = Order
        fields = (
            'id', 'customer_id', 'order_date', 'status', 'delivery_address', 'total_amount',
            'items', 'payment_method', 'card_brand', 'card_last4', 'payment',
        )
        read_only_fields = ('id', 'order_date', 'status', 'total_amount')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request and getattr(request.user, 'role', None) == 'warehouse':
            data.pop('payment', None)
            data.pop('customer_id', None)
        return data

    def validate(self, attrs):
        sensitive_card_fields = {
            'card_number', 'cardNumber', 'card_pan', 'pan', 'number',
            'cvv', 'cvc', 'security_code', 'expiry', 'expiry_date',
            'expiry_month', 'expiry_year', 'cardholder_name', 'card',
            'payment_card', 'payment_details', 'card_details',
        }
        supplied_sensitive_fields = sensitive_card_fields.intersection(self.initial_data.keys())
        if supplied_sensitive_fields:
            raise serializers.ValidationError({
                'payment': (
                    'Do not send card numbers, CVV values, expiry dates, or cardholder names. '
                    'Only card_brand and card_last4 are accepted for the demo checkout.'
                )
            })

        accepted_checkout_fields = {
            'delivery_address', 'payment_method', 'card_brand', 'card_last4', 'items',
        }
        unexpected_fields = sorted(set(self.initial_data.keys()) - accepted_checkout_fields)
        if unexpected_fields:
            raise serializers.ValidationError({
                'detail': f"Unsupported checkout fields: {', '.join(unexpected_fields)}."
            })

        payment_method = attrs.get('payment_method')
        card_brand = attrs.get('card_brand')
        card_last4 = attrs.get('card_last4')
        if payment_method == 'card':
            missing_card_metadata = [
                field
                for field, value in (('card_brand', card_brand), ('card_last4', card_last4))
                if not value
            ]
            if missing_card_metadata:
                raise serializers.ValidationError({
                    field: 'This field is required for card checkout.'
                    for field in missing_card_metadata
                })
        elif card_brand or card_last4:
            raise serializers.ValidationError({
                'payment': 'Card metadata is only permitted when payment_method is card.'
            })

        items = attrs.get('items', [])
        if not items:
            raise serializers.ValidationError({'items': 'An order must contain at least one product.'})
        product_ids = [item['product'].id for item in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError({'items': 'Each product may appear only once in an order.'})
        address = attrs.get('delivery_address', '').strip()
        if not address:
            raise serializers.ValidationError({'delivery_address': 'Delivery address is required.'})
        attrs['delivery_address'] = address
        for item in items:
            product = item['product']
            if not product.is_active or not product.category.is_active:
                raise serializers.ValidationError({
                    'items': f'{product.name} is not currently available for purchase.'
                })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        payment_method = validated_data.pop('payment_method')
        card_brand = validated_data.pop('card_brand', '')
        card_last4 = validated_data.pop('card_last4', '')
        request = self.context['request']
        order = Order.objects.create(user=request.user, **validated_data)
        total = 0
        maximum_total = Decimal('99999999.99')

        for item_data in items_data:
            product = item_data['product']
            quantity = item_data['quantity']
            updated = Product.objects.filter(
                pk=product.pk,
                stock_qty__gte=quantity,
            ).update(stock_qty=F('stock_qty') - quantity)
            if updated != 1:
                available = Product.objects.get(pk=product.pk).stock_qty
                raise serializers.ValidationError({
                    'items': f'Not enough stock for {product.name}. Available: {available}.'
                })

            product.refresh_from_db(fields=('price',))
            line_total = product.price * quantity
            total += line_total
            if total > maximum_total:
                raise serializers.ValidationError({
                    'items': 'The order total exceeds the allowed amount.'
                })
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                unit_price=product.price,
            )

        order.total_amount = total
        order.save(update_fields=('total_amount',))
        Payment.objects.create(
            order=order,
            amount=total,
            method=payment_method,
            card_brand=card_brand,
            card_last4=card_last4,
        )
        record_audit_event(
            'order_created',
            actor=request.user,
            target_user=request.user,
            order=order,
            metadata={'item_count': len(items_data), 'total_amount': str(total)},
        )
        return order


class SecurityAuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source='actor.email', read_only=True)
    target_user_email = serializers.EmailField(source='target_user.email', read_only=True)

    class Meta:
        model = SecurityAuditLog
        fields = (
            'id', 'event_type', 'actor', 'actor_email', 'target_user', 'target_user_email',
            'product', 'order', 'metadata', 'created_at',
        )
        read_only_fields = fields
