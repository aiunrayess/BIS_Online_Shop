import uuid

from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager

# Create your models here.


def generate_sku():
    return uuid.uuid4().hex[:20].upper()


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email.strip()).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.ROLE_ADMIN)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    ROLE_BUYER = 'buyer'
    ROLE_SELLER = 'seller'
    ROLE_MANAGER = 'manager'
    ROLE_WAREHOUSE = 'warehouse'
    ROLE_HEAD_MANAGER = 'head_manager'
    ROLE_SECURITY_MANAGER = 'security_manager'
    ROLE_ADMIN = 'admin'

    ROLE_CHOICES = (
        (ROLE_BUYER, 'Buyer'),
        (ROLE_SELLER, 'Seller'),
        (ROLE_MANAGER, 'Sales manager'),
        (ROLE_WAREHOUSE, 'Warehouse staff'),
        (ROLE_HEAD_MANAGER, 'Head manager'),
        (ROLE_SECURITY_MANAGER, 'Security manager'),
        (ROLE_ADMIN, 'Database administrator'),
    )
    
    username = None # We use email as login
    email = models.EmailField(unique=True, verbose_name="Email")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_BUYER)
    phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=200, blank=True)
    shop_name = models.CharField(max_length=255, null=True, blank=True)
    shop_address = models.CharField(max_length=500, null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
    
    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(role__in=(
                    'buyer',
                    'seller',
                    'manager',
                    'warehouse',
                    'head_manager',
                    'security_manager',
                    'admin',
                )),
                name="user_role_valid",
            ),
        ]

class Category(models.Model):
    name = models.CharField(max_length=50, unique=True, verbose_name="Name")
    description = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Category"
        verbose_name_plural = "Categories"

class Product(models.Model):
    name = models.CharField(max_length=100, verbose_name="Name")
    sku = models.CharField(max_length=30, unique=True, default=generate_sku)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(max_length=500, null=False, blank=False, verbose_name="Description")
    stock_qty = models.PositiveIntegerField(default=0, verbose_name="Stock quantity")
    image_url = models.URLField(max_length=500, null=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    owner = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='products_owned')
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"
        indexes = [
            models.Index(fields=('category', 'is_active', 'name'), name='core_prod_cat_act_name_idx'),
            models.Index(fields=('is_active', 'name'), name='core_prod_act_name_idx'),
            models.Index(fields=('is_active', 'price'), name='core_prod_act_price_idx'),
            models.Index(fields=('is_active', 'stock_qty'), name='core_prod_act_stock_idx'),
            models.Index(fields=('owner', 'is_active'), name='core_prod_owner_active_idx'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(price__gt=0), name="product_price_positive"),
            models.CheckConstraint(condition=models.Q(stock_qty__gte=0), name="product_stock_nonnegative"),
            models.CheckConstraint(condition=~models.Q(sku=''), name="product_sku_nonempty"),
        ]

class Order(models.Model):
    STATUS_CHOICES = (
        ('New', 'New'),
        ('Paid', 'Paid'),
        ('Preparing', 'Preparing'),
        ('Shipped', 'Shipped'),
        ('Delivered', 'Delivered'),
        ('Cancelled', 'Cancelled'),
    )

    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name='orders')
    order_date = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='New')
    delivery_address = models.CharField(max_length=200, default='')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"Order #{self.id}"
    
    class Meta:
        verbose_name = "Order"
        verbose_name_plural = "Orders"
        indexes = [
            models.Index(fields=('user', '-order_date'), name='core_order_user_date_idx'),
            models.Index(fields=('status', '-order_date'), name='core_order_status_date_idx'),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(total_amount__gte=0), name="order_total_nonnegative"),
            models.CheckConstraint(
                condition=models.Q(status__in=('New', 'Paid', 'Preparing', 'Shipped', 'Delivered', 'Cancelled')),
                name="order_status_valid",
            ),
        ]
    
class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"
    
    class Meta:
        verbose_name = "Order item"
        verbose_name_plural = "Order items"
        constraints = [
            models.UniqueConstraint(fields=('order', 'product'), name='unique_product_per_order'),
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="order_item_quantity_positive"),
            models.CheckConstraint(condition=models.Q(unit_price__gt=0), name="order_item_price_positive"),
        ]


class Payment(models.Model):
    METHODS = (
        ('card', 'Card'),
        ('bank_transfer', 'Bank transfer'),
        ('cash_on_delivery', 'Cash on delivery'),
    )
    STATUSES = (
        ('Pending', 'Pending'),
        ('Paid', 'Paid'),
        ('Failed', 'Failed'),
        ('Refunded', 'Refunded'),
    )
    CARD_BRANDS = (
        ('visa', 'Visa'),
        ('mastercard', 'Mastercard'),
        ('amex', 'American Express'),
        ('other', 'Other'),
    )

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='payment')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=METHODS)
    status = models.CharField(max_length=10, choices=STATUSES, default='Pending')
    paid_at = models.DateTimeField(null=True, blank=True)
    # Safe checkout metadata only. Never store a card number, CVV, or expiry.
    card_brand = models.CharField(max_length=20, choices=CARD_BRANDS, blank=True, default='')
    card_last4 = models.CharField(max_length=4, blank=True, default='')

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_amount_positive"),
            models.CheckConstraint(
                condition=models.Q(method__in=('card', 'bank_transfer', 'cash_on_delivery')),
                name="payment_method_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=('Pending', 'Paid', 'Failed', 'Refunded')),
                name="payment_status_valid",
            ),
        ]

    def __str__(self):
        return f"Payment for order #{self.order_id}"


class ProductStockAdjustment(models.Model):
    """An immutable record of each manual warehouse stock change."""

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='stock_adjustments')
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='stock_adjustments',
    )
    previous_quantity = models.PositiveIntegerField()
    new_quantity = models.PositiveIntegerField()
    delta = models.IntegerField()
    reason = models.CharField(max_length=250)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [
            models.Index(fields=('product', '-created_at'), name='core_produ_product_9d3e7f_idx')
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(new_quantity__gte=0),
                name='stock_adjustment_new_quantity_nonnegative',
            ),
        ]

    def __str__(self):
        return f"Stock adjustment for {self.product_id}: {self.delta:+d}"


class SecurityAuditLog(models.Model):
    """Security-relevant events without passwords, tokens, or payment data."""

    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_audit_events',
    )
    target_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_events_targeting_user',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_audit_events',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_audit_events',
    )
    event_type = models.CharField(max_length=80)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [
            models.Index(fields=('event_type', '-created_at'), name='core_secur_event_t_6b3261_idx'),
            models.Index(fields=('target_user', '-created_at'), name='core_secur_target__045896_idx'),
        ]

    def __str__(self):
        return f"{self.event_type} at {self.created_at:%Y-%m-%d %H:%M:%S}"
