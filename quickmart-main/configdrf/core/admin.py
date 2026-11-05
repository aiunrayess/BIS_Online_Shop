from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    Category,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductStockAdjustment,
    SecurityAuditLog,
    User,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    model = User
    list_display = ('email', 'role', 'is_active', 'is_staff', 'is_superuser')
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser')
    search_fields = ('email', 'first_name', 'last_name')
    ordering = ('email',)
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal information', {
            'fields': (
                'first_name', 'last_name', 'phone', 'address', 'shop_name',
                'shop_address', 'latitude', 'longitude',
            )
        }),
        ('Role and permissions', {
            'fields': ('role', 'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'role', 'is_active', 'is_staff', 'is_superuser'),
        }),
    )


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'order_date', 'status', 'total_amount')
    list_filter = ('status',)
    search_fields = ('id', 'user__email')


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ('order', 'product', 'quantity', 'unit_price')
    search_fields = ('product__name',)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'price', 'stock_qty', 'is_active', 'owner')
    list_filter = ('is_active', 'category')
    search_fields = ('name', 'sku')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('order', 'amount', 'method', 'status', 'paid_at')
    list_filter = ('method', 'status')


class ReadOnlyAuditAdmin(admin.ModelAdmin):
    readonly_fields = tuple()

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ProductStockAdjustment)
class ProductStockAdjustmentAdmin(ReadOnlyAuditAdmin):
    list_display = ('product', 'previous_quantity', 'new_quantity', 'delta', 'performed_by', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('product__name', 'performed_by__email', 'reason')
    readonly_fields = (
        'product', 'performed_by', 'previous_quantity', 'new_quantity',
        'delta', 'reason', 'created_at',
    )


@admin.register(SecurityAuditLog)
class SecurityAuditLogAdmin(ReadOnlyAuditAdmin):
    list_display = ('event_type', 'actor', 'target_user', 'product', 'order', 'created_at')
    list_filter = ('event_type', 'created_at')
    search_fields = ('actor__email', 'target_user__email', 'event_type')
    readonly_fields = (
        'event_type', 'actor', 'target_user', 'product', 'order', 'metadata', 'created_at',
    )
