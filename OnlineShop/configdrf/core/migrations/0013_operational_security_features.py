# Generated manually to keep the deployed SQLite database upgrade-safe.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_remove_user_user_role_valid_alter_user_role_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='user',
            name='user_role_valid',
        ),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('buyer', 'Buyer'),
                    ('seller', 'Seller'),
                    ('manager', 'Sales manager'),
                    ('warehouse', 'Warehouse staff'),
                    ('head_manager', 'Head manager'),
                    ('security_manager', 'Security manager'),
                    ('admin', 'Database administrator'),
                ],
                default='buyer',
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ('role__in', (
                        'buyer',
                        'seller',
                        'manager',
                        'warehouse',
                        'head_manager',
                        'security_manager',
                        'admin',
                    ))
                ),
                name='user_role_valid',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.RemoveConstraint(
            model_name='order',
            name='order_status_valid',
        ),
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(
                choices=[
                    ('New', 'New'),
                    ('Paid', 'Paid'),
                    ('Preparing', 'Preparing'),
                    ('Shipped', 'Shipped'),
                    ('Delivered', 'Delivered'),
                    ('Cancelled', 'Cancelled'),
                ],
                default='New',
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name='order',
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ('status__in', ('New', 'Paid', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'))
                ),
                name='order_status_valid',
            ),
        ),
        migrations.CreateModel(
            name='ProductStockAdjustment',
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
                ('previous_quantity', models.PositiveIntegerField()),
                ('new_quantity', models.PositiveIntegerField()),
                ('delta', models.IntegerField()),
                ('reason', models.CharField(max_length=250)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'performed_by',
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='stock_adjustments',
                        to='core.user',
                    ),
                ),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='stock_adjustments',
                        to='core.product',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [models.Index(fields=['product', '-created_at'], name='core_produ_product_9d3e7f_idx')],
                'constraints': [
                    models.CheckConstraint(
                        condition=models.Q(('new_quantity__gte', 0)),
                        name='stock_adjustment_new_quantity_nonnegative',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='SecurityAuditLog',
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
                ('event_type', models.CharField(max_length=80)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'actor',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='security_audit_events',
                        to='core.user',
                    ),
                ),
                (
                    'order',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='security_audit_events',
                        to='core.order',
                    ),
                ),
                (
                    'product',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='security_audit_events',
                        to='core.product',
                    ),
                ),
                (
                    'target_user',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='security_events_targeting_user',
                        to='core.user',
                    ),
                ),
            ],
            options={
                'ordering': ('-created_at', '-id'),
                'indexes': [
                    models.Index(fields=['event_type', '-created_at'], name='core_secur_event_t_6b3261_idx'),
                    models.Index(fields=['target_user', '-created_at'], name='core_secur_target__045896_idx'),
                ],
            },
        ),
    ]
