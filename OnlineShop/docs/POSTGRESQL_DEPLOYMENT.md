# PostgreSQL and indexed search deployment

OnlineShop runs on SQLite by default for a simple local demonstration. For a shared or higher-volume deployment, set `DATABASE_URL` to a PostgreSQL connection string before running Django migrations.

```text
DATABASE_URL=postgresql://onlineshop:replace-with-a-secret@db.example.com:5432/onlineshop?sslmode=require
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_ALLOWED_HOSTS=app.example.com
DJANGO_CORS_ALLOWED_ORIGINS=https://app.example.com
```

Install the deployment dependencies, then apply migrations:

```bash
pip install -r requirements.txt
python configdrf/manage.py migrate
python configdrf/manage.py check --deploy
```

## Search and operational indexes

The PostgreSQL migration enables `pg_trgm` and creates GIN trigram indexes for `Product.name` and `Product.description`. These indexes speed up the case-insensitive catalogue search used by the API for large datasets. The migration also adds ordinary composite indexes for active/category/name, active/price, product ownership, and common order-history/status queries.

The migration needs a PostgreSQL role that can run `CREATE EXTENSION pg_trgm`. If a managed database restricts that command, ask the database administrator to enable the extension once before applying the migration. SQLite keeps working for local development; it uses the same safe search behavior without PostgreSQL-specific indexes.

## Production checklist

- Keep the database password and Django secret only in environment variables or a secret manager.
- Require TLS (`sslmode=require`) and keep `DJANGO_DEBUG=False`.
- Take automated encrypted database backups and test restoring them.
- Run `migrate` as part of a controlled release, then monitor error rates, database capacity, and slow queries.
- Use a managed PostgreSQL service, a proper HTTPS domain, and a real PCI-compliant payment provider for public use.
