"""Create PostgreSQL-only trigram indexes without affecting SQLite users."""

from django.db import migrations
from django.db.migrations.operations.base import Operation


class CreatePostgreSQLTrigramIndexes(Operation):
    """Add concurrent GIN indexes only when the selected database is PostgreSQL."""

    reversible = True
    reduces_to_sql = True

    def state_forwards(self, app_label, state):
        # The indexes are deployment optimizations rather than portable model
        # state, so SQLite and PostgreSQL share the same Django model state.
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != 'postgresql':
            return

        product = to_state.apps.get_model('core', 'Product')
        product_table = schema_editor.quote_name(product._meta.db_table)
        with schema_editor.connection.cursor() as cursor:
            cursor.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
            cursor.execute(
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS core_prod_name_trgm_idx '
                f'ON {product_table} USING gin (name gin_trgm_ops)'
            )
            cursor.execute(
                'CREATE INDEX CONCURRENTLY IF NOT EXISTS core_prod_desc_trgm_idx '
                f'ON {product_table} USING gin (description gin_trgm_ops)'
            )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        if schema_editor.connection.vendor != 'postgresql':
            return

        with schema_editor.connection.cursor() as cursor:
            cursor.execute('DROP INDEX CONCURRENTLY IF EXISTS core_prod_name_trgm_idx')
            cursor.execute('DROP INDEX CONCURRENTLY IF EXISTS core_prod_desc_trgm_idx')

    def describe(self):
        return 'Create PostgreSQL GIN/trigram catalogue search indexes'


class Migration(migrations.Migration):
    # PostgreSQL forbids CREATE/DROP INDEX CONCURRENTLY inside a transaction.
    atomic = False

    dependencies = [
        ('core', '0014_payment_card_metadata_and_query_indexes'),
    ]

    operations = [
        CreatePostgreSQLTrigramIndexes(),
    ]
