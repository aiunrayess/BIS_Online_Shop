"""Add PostgreSQL expression indexes that match Django ``icontains`` queries."""

from django.db import migrations
from django.db.migrations.operations.base import Operation


class CreatePostgreSQLCaseInsensitiveTrigramIndexes(Operation):
    """Create concurrent expression indexes only on PostgreSQL deployments.

    Django compiles the catalogue's ``__icontains`` predicates as
    ``UPPER(column) LIKE UPPER(...)`` on PostgreSQL.  The raw-column trigram
    indexes from migration 0015 remain useful for other queries, while these
    expression indexes allow the deployed catalogue search to use an index.
    """

    reversible = True
    reduces_to_sql = True

    def state_forwards(self, app_label, state):
        # Deployment-specific optimization; no portable Django model state.
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != 'postgresql':
            return

        product = to_state.apps.get_model('core', 'Product')
        product_table = schema_editor.quote_name(product._meta.db_table)
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS core_prod_name_upper_trgm_idx '
                f'ON {product_table} USING gin (UPPER(name) gin_trgm_ops)'
            )
            cursor.execute(
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS core_prod_desc_upper_trgm_idx '
                f'ON {product_table} USING gin (UPPER(description) gin_trgm_ops)'
            )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != 'postgresql':
            return

        with schema_editor.connection.cursor() as cursor:
            cursor.execute('DROP INDEX CONCURRENTLY IF EXISTS core_prod_name_upper_trgm_idx')
            cursor.execute('DROP INDEX CONCURRENTLY IF EXISTS core_prod_desc_upper_trgm_idx')

    def describe(self):
        return 'Create PostgreSQL case-insensitive catalogue search indexes'


class Migration(migrations.Migration):
    # PostgreSQL forbids CREATE/DROP INDEX CONCURRENTLY inside a transaction.
    atomic = False

    dependencies = [
        ('core', '0016_customer_engagement_and_support'),
    ]

    operations = [
        CreatePostgreSQLCaseInsensitiveTrigramIndexes(),
    ]
