# Generated manually so the project remains upgrade-safe for its local SQLite
# database while adding portable indexes for deployed PostgreSQL databases.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_operational_security_features'),
    ]

    operations = [
        migrations.AddField(
            model_name='payment',
            name='card_brand',
            field=models.CharField(
                blank=True,
                choices=[
                    ('visa', 'Visa'),
                    ('mastercard', 'Mastercard'),
                    ('amex', 'American Express'),
                    ('other', 'Other'),
                ],
                default='',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='payment',
            name='card_last4',
            field=models.CharField(blank=True, default='', max_length=4),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['category', 'is_active', 'name'],
                name='core_prod_cat_act_name_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['is_active', 'name'],
                name='core_prod_act_name_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['is_active', 'price'],
                name='core_prod_act_price_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['is_active', 'stock_qty'],
                name='core_prod_act_stock_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='product',
            index=models.Index(
                fields=['owner', 'is_active'],
                name='core_prod_owner_active_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(
                fields=['user', '-order_date'],
                name='core_order_user_date_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='order',
            index=models.Index(
                fields=['status', '-order_date'],
                name='core_order_status_date_idx',
            ),
        ),
    ]
