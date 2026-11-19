# Generated manually to keep the feature schema portable across SQLite and PostgreSQL.

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_postgresql_catalogue_search_indexes'),
    ]

    operations = [
        migrations.CreateModel(
            name='CustomerNotification',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'notification_type',
                    models.CharField(
                        choices=[
                            ('waitlist_product_available', 'Waitlisted product available'),
                            ('support_ticket_updated', 'Support ticket updated'),
                        ],
                        max_length=64,
                    ),
                ),
                ('title', models.CharField(max_length=160)),
                ('message', models.CharField(max_length=500)),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                (
                    'product',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name='customer_notifications',
                        to='core.product',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='notifications',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [
                    models.Index(
                        fields=['user', 'is_read', '-created_at'],
                        name='core_notice_user_read_idx',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='ProductReview',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                (
                    'rating',
                    models.PositiveSmallIntegerField(
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(5),
                        ],
                    ),
                ),
                ('comment', models.TextField(blank=True, max_length=1000)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='reviews',
                        to='core.product',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='product_reviews',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [
                    models.Index(fields=['product', '-created_at'], name='core_review_product_date_idx'),
                    models.Index(fields=['user', '-created_at'], name='core_review_user_date_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('user', 'product'),
                        name='unique_review_per_user_product',
                    ),
                    models.CheckConstraint(
                        condition=models.Q(('rating__gte', 1), ('rating__lte', 5)),
                        name='product_review_rating_range',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='SupportTicket',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('subject', models.CharField(max_length=160)),
                ('message', models.TextField(max_length=4000)),
                (
                    'category',
                    models.CharField(
                        choices=[
                            ('general', 'General'),
                            ('order', 'Order'),
                            ('product', 'Product'),
                            ('account', 'Account'),
                            ('technical', 'Technical'),
                        ],
                        default='general',
                        max_length=20,
                    ),
                ),
                (
                    'status',
                    models.CharField(
                        choices=[
                            ('Open', 'Open'),
                            ('In Progress', 'In Progress'),
                            ('Resolved', 'Resolved'),
                            ('Closed', 'Closed'),
                        ],
                        default='Open',
                        max_length=20,
                    ),
                ),
                ('response', models.TextField(blank=True, max_length=4000)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                (
                    'customer',
                    models.ForeignKey(
                        on_delete=models.PROTECT,
                        related_name='support_tickets',
                        to='core.user',
                    ),
                ),
                (
                    'handled_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name='handled_support_tickets',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-updated_at', '-id'),
                'indexes': [
                    models.Index(
                        fields=['customer', 'status', '-created_at'],
                        name='core_ticket_customer_idx',
                    ),
                    models.Index(
                        fields=['status', '-updated_at'],
                        name='core_ticket_status_date_idx',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='WaitlistItem',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('notified_at', models.DateTimeField(blank=True, null=True)),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='waitlist_items',
                        to='core.product',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='waitlist_items',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [
                    models.Index(fields=['product', 'is_active'], name='core_wait_product_active_idx'),
                    models.Index(fields=['user', '-created_at'], name='core_wait_user_date_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('user', 'product'),
                        name='unique_waitlist_item_per_user_product',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='WishlistItem',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='wishlist_items',
                        to='core.product',
                    ),
                ),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name='wishlist_items',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [
                    models.Index(fields=['user', '-created_at'], name='core_wish_user_date_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('user', 'product'),
                        name='unique_wishlist_item_per_user_product',
                    ),
                ],
            },
        ),
    ]
