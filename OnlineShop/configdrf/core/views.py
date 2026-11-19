from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import (
    Avg,
    Count,
    DecimalField,
    F,
    FloatField,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .audit import record_audit_event
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
    User,
    WaitlistItem,
    WishlistItem,
)
from .serializers import (
    AccountDirectorySerializer,
    AccountStatusSerializer,
    CategorySerializer,
    CustomerNotificationSerializer,
    ManagedAccountCreateSerializer,
    ManagedUserSerializer,
    OrderSerializer,
    PasswordChangeSerializer,
    ProductSerializer,
    ProductReviewSerializer,
    ProductStockAdjustmentSerializer,
    ProductStockUpdateSerializer,
    ProfileSerializer,
    RoleAssignmentSerializer,
    SecurityAuditLogSerializer,
    SupportTicketCreateSerializer,
    SupportTicketSerializer,
    SupportTicketUpdateSerializer,
    UserSerializer,
    WaitlistItemSerializer,
    WishlistItemSerializer,
)


OPERATIONAL_ROLES = (
    User.ROLE_BUYER,
    User.ROLE_SELLER,
    User.ROLE_MANAGER,
    User.ROLE_WAREHOUSE,
)
PROTECTED_ACCOUNT_ROLES = (
    User.ROLE_ADMIN,
    User.ROLE_HEAD_MANAGER,
    User.ROLE_SECURITY_MANAGER,
)


def is_protected_account(user):
    """Keep leadership and Django-administration accounts outside Security Manager control."""
    return bool(
        user.role in PROTECTED_ACCOUNT_ROLES
        or getattr(user, 'is_superuser', False)
        or getattr(user, 'is_staff', False)
    )


def is_system_administrator(user):
    """Return true for Django administrators and the explicit DB-admin role."""
    return bool(
        getattr(user, 'is_authenticated', False)
        and (user.is_superuser or user.role == User.ROLE_ADMIN)
    )


def has_role(user, *roles):
    """Check an explicit role while retaining break-glass administrator access."""
    return bool(
        getattr(user, 'is_authenticated', False)
        and (is_system_administrator(user) or user.role in roles)
    )


def can_manage_catalog(user):
    return has_role(user, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER)


def is_customer_account(user):
    """Only customer-facing account types can create orders, reviews, and tickets."""
    return bool(
        getattr(user, 'is_authenticated', False)
        and user.role in (User.ROLE_BUYER, User.ROLE_SELLER)
    )


def can_manage_support(user):
    return has_role(
        user,
        User.ROLE_MANAGER,
        User.ROLE_HEAD_MANAGER,
        User.ROLE_SECURITY_MANAGER,
    )


def with_product_rating_metrics(queryset):
    """Attach portable rating aggregates so list pages do not issue N+1 queries."""
    return queryset.annotate(
        average_rating=Coalesce(
            Avg('reviews__rating'),
            Value(0),
            output_field=FloatField(),
        ),
        rating_count=Count('reviews', distinct=True),
    )


def notify_waitlisted_users_after_restock(product, previous_quantity):
    """Create one in-app alert per active waitlist entry on a 0 -> positive restock.

    This helper is called only from atomic, product-locked inventory paths.  It locks
    matching waitlist rows before creating notifications and deactivating them, so a
    retry or concurrent adjustment cannot send duplicate alerts.
    """
    if previous_quantity != 0 or product.stock_qty <= 0:
        return 0

    waiting_entries = list(
        WaitlistItem.objects.select_for_update()
        .select_related('user')
        .filter(
            product=product,
            is_active=True,
            notified_at__isnull=True,
            user__is_active=True,
        )
    )
    if not waiting_entries:
        return 0

    now = timezone.now()
    CustomerNotification.objects.bulk_create([
        CustomerNotification(
            user=entry.user,
            product=product,
            notification_type=CustomerNotification.TYPE_WAITLIST_PRODUCT_AVAILABLE,
            title='Product back in stock',
            message=f'{product.name} is available again. Add it to your cart while stock lasts.',
        )
        for entry in waiting_entries
    ])
    WaitlistItem.objects.filter(pk__in=[entry.pk for entry in waiting_entries]).update(
        is_active=False,
        notified_at=now,
    )
    record_audit_event(
        'waitlist_restock_notifications_sent',
        product=product,
        metadata={'recipient_count': len(waiting_entries)},
    )
    return len(waiting_entries)


def restore_order_stock(order, *, save_to_wishlist=False):
    """Restore a cancelled order's inventory and notify waitlisted customers safely."""
    wishlisted_count = 0
    notification_count = 0
    for item in order.items.select_related('product').all():
        product = Product.objects.select_for_update().get(pk=item.product_id)
        previous_quantity = product.stock_qty
        product.stock_qty = previous_quantity + item.quantity
        product.save(update_fields=('stock_qty',))
        notification_count += notify_waitlisted_users_after_restock(product, previous_quantity)
        if save_to_wishlist:
            _, created = WishlistItem.objects.get_or_create(user=order.user, product=product)
            wishlisted_count += int(created)
    return {
        'wishlisted_count': wishlisted_count,
        'notification_count': notification_count,
    }


def activate_waitlist_entry(user, product):
    """Create or reactivate an explicit stock alert without duplicating its history."""
    try:
        entry = WaitlistItem.objects.select_for_update().get(user=user, product=product)
        created = False
    except WaitlistItem.DoesNotExist:
        entry, created = WaitlistItem.objects.get_or_create(user=user, product=product)
    if not created and not entry.is_active:
        entry.is_active = True
        entry.notified_at = None
        entry.save(update_fields=('is_active', 'notified_at'))
        return entry, True
    return entry, created


class IsSalesManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER)


class IsHeadManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, User.ROLE_HEAD_MANAGER)


class IsSecurityManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, User.ROLE_SECURITY_MANAGER)


class IsWarehouseStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return has_role(request.user, User.ROLE_WAREHOUSE)


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class CategoryList(APIView):
    def get(self, request):
        categories = Category.objects.filter(is_active=True).order_by('name')
        return Response(CategorySerializer(categories, many=True).data)

    def post(self, request):
        if not can_manage_catalog(request.user):
            raise PermissionDenied('Only management accounts can create categories.')
        serializer = CategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        record_audit_event(
            'category_created',
            actor=request.user,
            metadata={'category_id': category.id, 'category_name': category.name},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CategoryDetail(APIView):
    def get(self, request, id):
        category = get_object_or_404(Category, id=id, is_active=True)
        return Response(CategorySerializer(category).data)

    def put(self, request, id):
        return self._update(request, id)

    def patch(self, request, id):
        return self._update(request, id)

    def _update(self, request, id):
        if not can_manage_catalog(request.user):
            raise PermissionDenied('Only management accounts can update categories.')
        category = get_object_or_404(Category, id=id)
        serializer = CategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        record_audit_event(
            'category_updated',
            actor=request.user,
            metadata={'category_id': category.id, 'changed_fields': sorted(request.data.keys())},
        )
        return Response(serializer.data)

    def delete(self, request, id):
        if not can_manage_catalog(request.user):
            raise PermissionDenied('Only management accounts can deactivate categories.')
        category = get_object_or_404(Category, id=id)
        category.is_active = False
        category.save(update_fields=('is_active',))
        record_audit_event(
            'category_deactivated',
            actor=request.user,
            metadata={'category_id': category.id, 'category_name': category.name},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryProducts(APIView):
    def get(self, request, id):
        category = get_object_or_404(Category, id=id, is_active=True)
        products = with_product_rating_metrics(
            Product.objects.select_related('category', 'owner').filter(category=category, is_active=True)
        ).order_by('name', 'id')
        return Response(ProductSerializer(products, many=True).data)


class ProductsList(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    filter_backends = []
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        mine = self.request.query_params.get('mine', '').lower() in ('1', 'true', 'yes')
        if mine and user.is_authenticated:
            queryset = Product.objects.filter(owner=user)
        else:
            queryset = Product.objects.filter(category__is_active=True, is_active=True)

        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')
        ordering = self.request.query_params.get('ordering')
        if category:
            try:
                category_id = int(category)
            except (TypeError, ValueError) as exc:
                raise ValidationError({'category': 'Category must be a valid numeric ID.'}) from exc
            queryset = queryset.filter(category_id=category_id)
        if search:
            # Keep every term in one indexed queryset. PostgreSQL deployments add
            # trigram GIN indexes in migration 0015; SQLite retains this portable
            # fallback for local development.
            for term in search.split():
                queryset = queryset.filter(
                    Q(name__icontains=term) | Q(description__icontains=term)
                )
        queryset = with_product_rating_metrics(queryset.select_related('category', 'owner'))
        if ordering in ('price', '-price', 'name', '-name'):
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by('name', 'id')
        return queryset

    def create(self, request, *args, **kwargs):
        if not has_role(request.user, User.ROLE_SELLER, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER):
            raise PermissionDenied('Only sellers and management accounts can create products.')
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        product = serializer.save(owner=self.request.user)
        record_audit_event(
            'product_created',
            actor=self.request.user,
            product=product,
            metadata={'product_id': product.id, 'stock_qty': product.stock_qty},
        )


class TopProducts(APIView):
    """A public, deterministic top-products feed ranked by rating, review volume, then sales."""

    def get(self, request):
        try:
            limit = min(max(int(request.query_params.get('limit', 10)), 1), 50)
        except (TypeError, ValueError) as exc:
            raise ValidationError({'limit': 'Limit must be a whole number between 1 and 50.'}) from exc

        sales_units = (
            OrderItem.objects.filter(
                product_id=OuterRef('pk'),
                order__status__in=('Paid', 'Preparing', 'Shipped', 'Delivered'),
            )
            .order_by()
            .values('product_id')
            .annotate(total=Sum('quantity'))
            .values('total')[:1]
        )
        products = (
            with_product_rating_metrics(
                Product.objects.select_related('category', 'owner').filter(
                    category__is_active=True,
                    is_active=True,
                )
            )
            .annotate(
                units_sold=Coalesce(
                    Subquery(sales_units, output_field=IntegerField()),
                    Value(0),
                    output_field=IntegerField(),
                )
            )
            .order_by('-average_rating', '-rating_count', '-units_sold', 'name', 'id')[:limit]
        )
        return Response(ProductSerializer(products, many=True, context={'request': request}).data)


class ProductDetail(APIView):
    def _get_product_for_read(self, request, id):
        product = get_object_or_404(
            with_product_rating_metrics(Product.objects.select_related('category', 'owner')),
            id=id,
        )
        if product.is_active and product.category.is_active:
            return product
        if can_manage_catalog(request.user) or product.owner_id == getattr(request.user, 'id', None):
            return product
        raise PermissionDenied('This product is not available.')

    @staticmethod
    def _can_edit_product(user, product):
        return can_manage_catalog(user) or (
            user.is_authenticated
            and user.role == User.ROLE_SELLER
            and product.owner_id == user.id
        )

    def get(self, request, id):
        return Response(ProductSerializer(self._get_product_for_read(request, id)).data)

    def put(self, request, id):
        return self._update(request, id)

    def patch(self, request, id):
        return self._update(request, id)

    def _update(self, request, id):
        product = get_object_or_404(Product.objects.select_related('category', 'owner'), id=id)
        if not self._can_edit_product(request.user, product):
            raise PermissionDenied('You may only edit products that you own.')
        if 'stock_qty' in request.data:
            raise ValidationError({'stock_qty': 'Use the warehouse stock endpoint to change inventory.'})
        if not can_manage_catalog(request.user):
            allowed_fields = {'name', 'sku', 'price', 'description', 'image_url', 'category'}
            unexpected_fields = set(request.data) - allowed_fields
            if unexpected_fields:
                raise ValidationError({
                    'detail': 'Sellers may only update product details on products they own.'
                })
        serializer = ProductSerializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        record_audit_event(
            'product_updated',
            actor=request.user,
            product=product,
            metadata={'product_id': product.id, 'changed_fields': sorted(request.data.keys())},
        )
        return Response(serializer.data)

    def delete(self, request, id):
        product = get_object_or_404(Product.objects.select_related('owner'), id=id)
        if not self._can_edit_product(request.user, product):
            raise PermissionDenied('You may only deactivate products that you own.')
        if product.is_active:
            product.is_active = False
            product.save(update_fields=('is_active',))
            record_audit_event(
                'product_deactivated',
                actor=request.user,
                product=product,
                metadata={'product_id': product.id},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductReviewList(APIView):
    """Public product feedback, with one authenticated customer review per product."""

    @staticmethod
    def _get_reviewable_product(id):
        return get_object_or_404(
            Product.objects.select_related('category').filter(
                is_active=True,
                category__is_active=True,
            ),
            id=id,
        )

    def get(self, request, id):
        product = self._get_reviewable_product(id)
        reviews = ProductReview.objects.filter(product=product).select_related('user')
        return Response(ProductReviewSerializer(reviews, many=True, context={'request': request}).data)

    @transaction.atomic
    def post(self, request, id):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can submit product reviews.')
        product = self._get_reviewable_product(id)
        if ProductReview.objects.filter(product=product, user=request.user).exists():
            raise ValidationError({'detail': 'You have already reviewed this product. Edit your existing review instead.'})
        unexpected_fields = set(request.data) - {'rating', 'comment'}
        if unexpected_fields:
            raise ValidationError({'detail': 'Only rating and comment can be submitted for a review.'})
        serializer = ProductReviewSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        try:
            # Keep the unique database constraint as the final authority when two
            # browser requests arrive at the same time.
            with transaction.atomic():
                review = serializer.save(product=product, user=request.user)
        except IntegrityError as exc:
            raise ValidationError({
                'detail': 'You have already reviewed this product. Edit your existing review instead.'
            }) from exc
        record_audit_event(
            'product_review_created',
            actor=request.user,
            target_user=request.user,
            product=product,
            metadata={'review_id': review.id, 'rating': review.rating},
        )
        return Response(
            ProductReviewSerializer(review, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProductReviewDetail(APIView):
    @staticmethod
    def _get_review(request, id, review_id):
        return get_object_or_404(
            ProductReview.objects.select_related('product', 'user').filter(
                product_id=id,
                product__is_active=True,
                product__category__is_active=True,
            ),
            id=review_id,
        )

    @staticmethod
    def _ensure_owner(request, review):
        if not is_customer_account(request.user) or review.user_id != request.user.id:
            raise PermissionDenied('You may only change your own review.')

    def patch(self, request, id, review_id):
        review = self._get_review(request, id, review_id)
        self._ensure_owner(request, review)
        unexpected_fields = set(request.data) - {'rating', 'comment'}
        if unexpected_fields:
            raise ValidationError({'detail': 'Only rating and comment can be updated for a review.'})
        serializer = ProductReviewSerializer(
            review,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        updated_review = serializer.save()
        record_audit_event(
            'product_review_updated',
            actor=request.user,
            target_user=request.user,
            product=review.product,
            metadata={'review_id': review.id, 'rating': updated_review.rating},
        )
        return Response(ProductReviewSerializer(updated_review, context={'request': request}).data)

    def delete(self, request, id, review_id):
        review = self._get_review(request, id, review_id)
        self._ensure_owner(request, review)
        product = review.product
        review_id = review.id
        review.delete()
        record_audit_event(
            'product_review_deleted',
            actor=request.user,
            target_user=request.user,
            product=product,
            metadata={'review_id': review_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductStock(APIView):
    permission_classes = [IsWarehouseStaff]

    @transaction.atomic
    def patch(self, request, id):
        serializer = ProductStockUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = get_object_or_404(Product.objects.select_for_update(), id=id)
        previous_quantity = product.stock_qty
        if 'stock_qty' in serializer.validated_data:
            new_quantity = serializer.validated_data['stock_qty']
        else:
            new_quantity = previous_quantity + serializer.validated_data['adjustment']
        if new_quantity < 0:
            raise ValidationError({'adjustment': 'The adjustment would make stock negative.'})

        product.stock_qty = new_quantity
        product.save(update_fields=('stock_qty',))
        adjustment = ProductStockAdjustment.objects.create(
            product=product,
            performed_by=request.user,
            previous_quantity=previous_quantity,
            new_quantity=new_quantity,
            delta=new_quantity - previous_quantity,
            reason=serializer.validated_data['reason'],
        )
        notification_count = notify_waitlisted_users_after_restock(product, previous_quantity)
        record_audit_event(
            'stock_adjusted',
            actor=request.user,
            product=product,
            metadata={
                'previous_quantity': previous_quantity,
                'new_quantity': new_quantity,
                'reason': adjustment.reason,
                'waitlist_notification_count': notification_count,
            },
        )
        return Response(ProductSerializer(product).data)


class ProductStockHistory(APIView):
    permission_classes = [IsWarehouseStaff]

    def get(self, request, id):
        product = get_object_or_404(Product, id=id)
        history = ProductStockAdjustment.objects.filter(product=product).select_related('performed_by')
        try:
            limit = min(max(int(request.query_params.get('limit', 50)), 1), 100)
        except (TypeError, ValueError) as exc:
            raise ValidationError({'limit': 'Limit must be a whole number.'}) from exc
        return Response(ProductStockAdjustmentSerializer(history[:limit], many=True).data)


class WishlistList(APIView):
    """Customer saved products. Saving an out-of-stock item also starts a stock alert."""

    def _ensure_customer(self, request):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can use a wishlist.')

    def get(self, request):
        self._ensure_customer(request)
        items = (
            WishlistItem.objects.filter(user=request.user)
            .select_related('product__category', 'product__owner')
        )
        return Response(WishlistItemSerializer(items, many=True, context={'request': request}).data)

    @transaction.atomic
    def post(self, request):
        self._ensure_customer(request)
        serializer = WishlistItemSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # Lock the product before its stock is inspected so a concurrent restock
        # cannot leave a newly created waitlist entry without its alert.
        product = get_object_or_404(
            Product.objects.select_for_update().select_related('category'),
            pk=serializer.validated_data['product'].pk,
        )
        if not product.is_active or not product.category.is_active:
            raise ValidationError({'product': 'Only active catalogue products can be saved.'})
        item, created = WishlistItem.objects.get_or_create(user=request.user, product=product)
        automatically_waitlisted = False
        if product.stock_qty == 0:
            _, automatically_waitlisted = activate_waitlist_entry(request.user, product)
        if created:
            record_audit_event(
                'wishlist_item_saved',
                actor=request.user,
                target_user=request.user,
                product=product,
                metadata={'automatically_waitlisted': automatically_waitlisted},
            )
        if automatically_waitlisted:
            record_audit_event(
                'waitlist_enrolled',
                actor=request.user,
                target_user=request.user,
                product=product,
                metadata={'source': 'wishlist_zero_stock'},
            )
        return Response(
            WishlistItemSerializer(item, context={'request': request}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class WishlistDetail(APIView):
    @transaction.atomic
    def delete(self, request, product_id):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can use a wishlist.')
        item = get_object_or_404(WishlistItem, user=request.user, product_id=product_id)
        product = item.product
        item.delete()
        record_audit_event(
            'wishlist_item_removed',
            actor=request.user,
            target_user=request.user,
            product=product,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class WaitlistList(APIView):
    """Explicit out-of-stock alerts; re-enrollment is possible after a prior alert."""

    def _ensure_customer(self, request):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can use a waiting list.')

    def get(self, request):
        self._ensure_customer(request)
        entries = (
            WaitlistItem.objects.filter(user=request.user)
            .select_related('product__category', 'product__owner')
        )
        return Response(WaitlistItemSerializer(entries, many=True, context={'request': request}).data)

    @transaction.atomic
    def post(self, request):
        self._ensure_customer(request)
        serializer = WaitlistItemSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # This uses the same product row lock as warehouse/cancellation restocks.
        # The availability check and enrollment therefore form one atomic decision.
        product = get_object_or_404(
            Product.objects.select_for_update().select_related('category'),
            pk=serializer.validated_data['product'].pk,
        )
        if not product.is_active or not product.category.is_active:
            raise ValidationError({'product': 'Only active catalogue products can be waitlisted.'})
        if product.stock_qty > 0:
            raise ValidationError({'product': 'This product is currently in stock and does not need a waiting list alert.'})
        entry, activated = activate_waitlist_entry(request.user, product)
        if activated:
            record_audit_event(
                'waitlist_enrolled',
                actor=request.user,
                target_user=request.user,
                product=product,
                metadata={'source': 'waiting_list'},
            )
        return Response(
            WaitlistItemSerializer(entry, context={'request': request}).data,
            status=status.HTTP_201_CREATED if activated else status.HTTP_200_OK,
        )


class WaitlistDetail(APIView):
    @transaction.atomic
    def delete(self, request, product_id):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can use a waiting list.')
        entry = get_object_or_404(
            WaitlistItem,
            user=request.user,
            product_id=product_id,
            is_active=True,
        )
        entry.is_active = False
        entry.save(update_fields=('is_active',))
        record_audit_event(
            'waitlist_removed',
            actor=request.user,
            target_user=request.user,
            product=entry.product,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerNotificationList(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        notifications = CustomerNotification.objects.filter(user=request.user).select_related(
            'product__category',
            'product__owner',
        )
        unread = request.query_params.get('unread', '').lower()
        if unread in ('1', 'true', 'yes'):
            notifications = notifications.filter(is_read=False)
        return Response(CustomerNotificationSerializer(
            notifications[:100],
            many=True,
            context={'request': request},
        ).data)


class CustomerNotificationRead(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, id):
        notification = get_object_or_404(CustomerNotification, id=id, user=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=('is_read', 'read_at'))
        return Response(CustomerNotificationSerializer(notification, context={'request': request}).data)


class CurrentUser(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(ProfileSerializer(request.user).data)

    def patch(self, request):
        editable_fields = {'email', 'first_name', 'last_name', 'phone', 'address'}
        unexpected_fields = set(request.data) - editable_fields
        if unexpected_fields:
            raise ValidationError({
                'detail': 'Only email, name, phone, and address can be edited in a profile.'
            })
        serializer = ProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        record_audit_event(
            'profile_updated',
            actor=request.user,
            target_user=user,
            metadata={'changed_fields': sorted(request.data.keys())},
        )
        return Response(serializer.data)


class CurrentUserPassword(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=('password',))
        record_audit_event(
            'password_changed',
            actor=request.user,
            target_user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SupportTicketList(APIView):
    """Customer support inbox with customer ownership and a staff-only response path."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tickets = SupportTicket.objects.select_related('customer', 'handled_by')
        if not can_manage_support(request.user):
            tickets = tickets.filter(customer=request.user)
        return Response(SupportTicketSerializer(tickets, many=True, context={'request': request}).data)

    def post(self, request):
        if not is_customer_account(request.user):
            raise PermissionDenied('Only customer accounts can open a support ticket.')
        serializer = SupportTicketCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save(customer=request.user)
        record_audit_event(
            'support_ticket_created',
            actor=request.user,
            target_user=request.user,
            metadata={'ticket_id': ticket.id, 'category': ticket.category},
        )
        return Response(
            SupportTicketSerializer(ticket, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class SupportTicketDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    _ALLOWED_TRANSITIONS = {
        SupportTicket.STATUS_OPEN: {
            SupportTicket.STATUS_IN_PROGRESS,
            SupportTicket.STATUS_RESOLVED,
            SupportTicket.STATUS_CLOSED,
        },
        SupportTicket.STATUS_IN_PROGRESS: {
            SupportTicket.STATUS_OPEN,
            SupportTicket.STATUS_RESOLVED,
            SupportTicket.STATUS_CLOSED,
        },
        SupportTicket.STATUS_RESOLVED: {
            SupportTicket.STATUS_OPEN,
            SupportTicket.STATUS_CLOSED,
        },
        SupportTicket.STATUS_CLOSED: {SupportTicket.STATUS_OPEN},
    }

    @transaction.atomic
    def patch(self, request, id):
        if not can_manage_support(request.user):
            raise PermissionDenied('Only support management accounts can update support tickets.')
        ticket = get_object_or_404(
            SupportTicket.objects.select_for_update().select_related('customer', 'handled_by'),
            id=id,
        )
        serializer = SupportTicketUpdateSerializer(ticket, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updates = serializer.validated_data
        previous_status = ticket.status
        new_status = updates.get('status', previous_status)
        if new_status != previous_status and new_status not in self._ALLOWED_TRANSITIONS[previous_status]:
            raise ValidationError({
                'status': f'Cannot change {previous_status} support ticket to {new_status}.',
            })

        changed_fields = []
        if 'status' in updates:
            ticket.status = new_status
            changed_fields.append('status')
        if 'response' in updates:
            ticket.response = updates['response']
            changed_fields.append('response')
        ticket.handled_by = request.user
        changed_fields.append('handled_by')
        if new_status in (SupportTicket.STATUS_RESOLVED, SupportTicket.STATUS_CLOSED):
            if ticket.resolved_at is None:
                ticket.resolved_at = timezone.now()
                changed_fields.append('resolved_at')
        elif previous_status in (SupportTicket.STATUS_RESOLVED, SupportTicket.STATUS_CLOSED):
            ticket.resolved_at = None
            changed_fields.append('resolved_at')
        changed_fields.append('updated_at')
        ticket.save(update_fields=tuple(dict.fromkeys(changed_fields)))
        CustomerNotification.objects.create(
            user=ticket.customer,
            notification_type=CustomerNotification.TYPE_SUPPORT_TICKET_UPDATED,
            title='Support ticket updated',
            message=f'Your support ticket #{ticket.id} is now {ticket.status}.',
        )
        record_audit_event(
            'support_ticket_updated',
            actor=request.user,
            target_user=ticket.customer,
            metadata={
                'ticket_id': ticket.id,
                'previous_status': previous_status,
                'new_status': ticket.status,
                'changed_fields': changed_fields,
            },
        )
        return Response(SupportTicketSerializer(ticket, context={'request': request}).data)


class UserList(APIView):
    """Account directory and account creation for leadership/security workflows."""

    def get(self, request):
        if not (has_role(request.user, User.ROLE_HEAD_MANAGER) or has_role(request.user, User.ROLE_SECURITY_MANAGER)):
            raise PermissionDenied('Only Head Managers and Security Managers can view the account directory.')
        users = User.objects.all().order_by('email')
        serializer_class = (
            ManagedUserSerializer
            if has_role(request.user, User.ROLE_HEAD_MANAGER)
            else AccountDirectorySerializer
        )
        return Response(serializer_class(users, many=True).data)

    def post(self, request):
        if not has_role(request.user, User.ROLE_HEAD_MANAGER):
            raise PermissionDenied('Only a Head Manager can create operational accounts.')
        serializer = ManagedAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        record_audit_event(
            'managed_account_created',
            actor=request.user,
            target_user=user,
            metadata={'role': user.role},
        )
        return Response(ManagedUserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserRole(APIView):
    def patch(self, request, id):
        if not (
            has_role(request.user, User.ROLE_HEAD_MANAGER)
            or has_role(request.user, User.ROLE_SECURITY_MANAGER)
        ):
            raise PermissionDenied('Only Head Managers and Security Managers can reassign operational roles.')
        user = get_object_or_404(User, id=id)
        is_security_manager = (
            request.user.role == User.ROLE_SECURITY_MANAGER
            and not is_system_administrator(request.user)
        )
        if is_security_manager and (
            user.id == request.user.id or is_protected_account(user)
        ):
            raise PermissionDenied(
                'Security managers cannot reassign protected accounts or their own account.'
            )
        if is_protected_account(user) and not is_system_administrator(request.user):
            raise PermissionDenied('Protected leadership and security accounts cannot be reassigned here.')
        serializer = RoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if is_security_manager and not serializer.validated_data.get('reason'):
            raise ValidationError({'reason': 'Security managers must record a reason for a role change.'})
        previous_role = user.role
        user.role = serializer.validated_data['role']
        user.save(update_fields=('role',))
        record_audit_event(
            'account_role_changed',
            actor=request.user,
            target_user=user,
            metadata={
                'previous_role': previous_role,
                'new_role': user.role,
                'reason': serializer.validated_data.get('reason', ''),
                'performed_by_security_manager': is_security_manager,
            },
        )
        serializer_class = AccountDirectorySerializer if is_security_manager else ManagedUserSerializer
        return Response(serializer_class(user).data)


class UserStatus(APIView):
    permission_classes = [IsSecurityManager]

    def patch(self, request, id):
        user = get_object_or_404(User, id=id)
        if (
            not is_system_administrator(request.user)
            and (user.id == request.user.id or is_protected_account(user))
        ):
            raise PermissionDenied('Security managers cannot change protected accounts or their own account.')
        serializer = AccountStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        previous_status = user.is_active
        user.is_active = serializer.validated_data['is_active']
        user.save(update_fields=('is_active',))
        record_audit_event(
            'account_unlocked' if user.is_active else 'account_locked',
            actor=request.user,
            target_user=user,
            metadata={
                'previous_status': previous_status,
                'new_status': user.is_active,
                'reason': serializer.validated_data['reason'],
            },
        )
        return Response(AccountDirectorySerializer(user).data)


class UserRegister(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'registration'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserOrders(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if has_role(request.user, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER, User.ROLE_WAREHOUSE):
            orders = Order.objects.prefetch_related('items__product', 'payment').all()
        else:
            orders = request.user.orders.prefetch_related('items__product', 'payment').all()
        return Response(OrderSerializer(orders, many=True, context={'request': request}).data)

    def post(self, request):
        if request.user.role not in (User.ROLE_BUYER, User.ROLE_SELLER):
            raise PermissionDenied('This account is not permitted to place customer orders.')
        serializer = OrderSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(
            OrderSerializer(order, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrderDetail(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, id):
        orders = Order.objects.prefetch_related('items__product', 'payment')
        if has_role(request.user, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER, User.ROLE_WAREHOUSE):
            return get_object_or_404(orders, id=id)
        return get_object_or_404(orders, id=id, user_id=request.user.id)

    def get(self, request, id):
        return Response(OrderSerializer(
            self.get_object(request, id),
            context={'request': request},
        ).data)

    @transaction.atomic
    def patch(self, request, id):
        if not has_role(request.user, User.ROLE_MANAGER, User.ROLE_HEAD_MANAGER):
            raise PermissionDenied('Only management accounts can change order status.')
        order = get_object_or_404(
            Order.objects.select_for_update().select_related('payment'),
            id=id,
        )
        new_status = request.data.get('status')
        valid_statuses = dict(Order.STATUS_CHOICES)
        if new_status not in valid_statuses:
            raise ValidationError({'status': 'Choose a valid order status.'})

        allowed_transitions = {
            'New': {'Paid', 'Preparing', 'Shipped', 'Cancelled'},
            'Paid': {'Preparing', 'Shipped', 'Cancelled'},
            'Preparing': {'Shipped', 'Cancelled'},
            'Shipped': {'Delivered'},
            'Delivered': set(),
            'Cancelled': set(),
        }
        if new_status not in allowed_transitions[order.status]:
            raise ValidationError({'status': f'Cannot change {order.status} to {new_status}.'})

        payment = order.payment
        if (
            new_status in {'Preparing', 'Shipped'}
            and payment.method != 'cash_on_delivery'
            and payment.status != 'Paid'
        ):
            raise ValidationError({'status': 'Payment must be confirmed before preparation or shipment.'})
        previous_status = order.status
        restock_result = {'wishlisted_count': 0, 'notification_count': 0}
        if new_status == 'Cancelled':
            restock_result = restore_order_stock(order)
            payment.status = 'Refunded' if payment.status == 'Paid' else 'Failed'
        elif new_status == 'Paid' or (
            new_status == 'Delivered'
            and payment.method == 'cash_on_delivery'
            and payment.status == 'Pending'
        ):
            payment.status = 'Paid'
            payment.paid_at = payment.paid_at or timezone.now()
        payment.save(update_fields=('status', 'paid_at'))
        order.status = new_status
        order.save(update_fields=('status',))
        record_audit_event(
            'order_status_changed',
            actor=request.user,
            target_user=order.user,
            order=order,
            metadata={
                'previous_status': previous_status,
                'new_status': new_status,
                'waitlist_notification_count': restock_result['notification_count'],
            },
        )
        return Response(OrderSerializer(order, context={'request': request}).data)

    @transaction.atomic
    def delete(self, request, id):
        order = get_object_or_404(
            Order.objects.select_for_update().select_related('payment'),
            id=id,
            user_id=request.user.id,
        )
        if order.status != 'New':
            raise ValidationError('Only new orders can be cancelled by the customer.')
        restock_result = restore_order_stock(order, save_to_wishlist=True)
        order.payment.status = 'Failed'
        order.payment.save(update_fields=('status',))
        order.status = 'Cancelled'
        order.save(update_fields=('status',))
        record_audit_event(
            'order_cancelled_by_customer',
            actor=request.user,
            target_user=request.user,
            order=order,
            metadata={
                'wishlisted_item_count': restock_result['wishlisted_count'],
                'waitlist_notification_count': restock_result['notification_count'],
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderPrepare(APIView):
    """Warehouse marks a paid (or cash-on-delivery) order as being prepared."""

    permission_classes = [IsWarehouseStaff]

    @transaction.atomic
    def post(self, request, id):
        order = get_object_or_404(
            Order.objects.select_for_update().select_related('payment', 'user'),
            id=id,
        )
        if order.status not in {'New', 'Paid'}:
            raise ValidationError({'status': 'Only new or paid orders can be prepared.'})
        if order.payment.method != 'cash_on_delivery' and order.payment.status != 'Paid':
            raise ValidationError({'status': 'Payment must be confirmed before preparation.'})
        previous_status = order.status
        order.status = 'Preparing'
        order.save(update_fields=('status',))
        record_audit_event(
            'order_prepared',
            actor=request.user,
            target_user=order.user,
            order=order,
            metadata={'previous_status': previous_status},
        )
        return Response(OrderSerializer(order, context={'request': request}).data)


class SalesReport(APIView):
    permission_classes = [IsSalesManager]

    def get(self, request):
        since = timezone.now() - timedelta(days=30)
        rows = (
            OrderItem.objects
            .filter(
                order__order_date__gte=since,
                order__status__in=('Paid', 'Shipped', 'Delivered'),
            )
            .values('product_id', 'product__name', 'product__stock_qty')
            .annotate(
                units_sold=Sum('quantity'),
                revenue=Sum(
                    F('quantity') * F('unit_price'),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .order_by('-units_sold', 'product__name')[:5]
        )
        return Response([
            {
                'product_id': row['product_id'],
                'product_name': row['product__name'],
                'units_sold': row['units_sold'],
                'revenue': row['revenue'],
                'stock_qty': row['product__stock_qty'],
            }
            for row in rows
        ])


class DashboardOverview(APIView):
    """Non-PII business metrics for Head Managers and system administrators."""

    permission_classes = [IsHeadManager]

    def get(self, request):
        since = timezone.now() - timedelta(days=30)
        completed_orders = Order.objects.filter(
            order_date__gte=since,
            status__in=('Paid', 'Shipped', 'Delivered'),
        )
        revenue = completed_orders.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        status_counts = {
            row['status']: row['count']
            for row in Order.objects.values('status').annotate(count=Count('id'))
        }
        support_status_counts = {
            row['status']: row['count']
            for row in SupportTicket.objects.values('status').annotate(count=Count('id'))
        }
        products = Product.objects.all()
        return Response({
            'period_days': 30,
            'revenue_last_30_days': revenue,
            'completed_orders_last_30_days': completed_orders.count(),
            'orders_by_status': status_counts,
            'total_products': products.count(),
            'active_products': products.filter(is_active=True, category__is_active=True).count(),
            'low_stock_products': products.filter(is_active=True, stock_qty__lte=5).count(),
            'active_customers': User.objects.filter(
                role__in=(User.ROLE_BUYER, User.ROLE_SELLER),
                is_active=True,
            ).count(),
            'support_tickets_by_status': support_status_counts,
            'open_support_tickets': SupportTicket.objects.filter(
                status__in=(SupportTicket.STATUS_OPEN, SupportTicket.STATUS_IN_PROGRESS),
            ).count(),
        })


class SecurityAuditLogList(APIView):
    permission_classes = [IsSecurityManager]

    def get(self, request):
        events = SecurityAuditLog.objects.select_related(
            'actor', 'target_user', 'product', 'order'
        )
        event_type = request.query_params.get('event_type')
        target_user = request.query_params.get('target_user')
        if event_type:
            events = events.filter(event_type=event_type)
        if target_user:
            try:
                events = events.filter(target_user_id=int(target_user))
            except (TypeError, ValueError) as exc:
                raise ValidationError({'target_user': 'Target user must be a valid numeric ID.'}) from exc
        try:
            limit = min(max(int(request.query_params.get('limit', 100)), 1), 200)
        except (TypeError, ValueError) as exc:
            raise ValidationError({'limit': 'Limit must be a whole number.'}) from exc
        return Response(SecurityAuditLogSerializer(events[:limit], many=True).data)


class AuditedTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code < 400:
            email = str(request.data.get(User.USERNAME_FIELD, '')).strip()
            user = User.objects.filter(email__iexact=email).first()
            if user:
                record_audit_event(
                    'login_succeeded',
                    actor=user,
                    target_user=user,
                )
        return response


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            raise ValidationError({'refresh': 'A refresh token is required.'})
        try:
            token = RefreshToken(refresh_token)
            if str(token.get('user_id')) != str(request.user.id):
                raise PermissionDenied('A session can only revoke its own refresh token.')
            token.blacklist()
        except TokenError as exc:
            raise ValidationError({'refresh': 'The refresh token is invalid or already expired.'}) from exc
        record_audit_event(
            'logout',
            actor=request.user,
            target_user=request.user,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
