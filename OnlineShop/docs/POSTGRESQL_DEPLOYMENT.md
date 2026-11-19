# PostgreSQL and indexed search deployment

OnlineShop uses SQLite when `DATABASE_URL` is unset so the project remains simple to run locally. For a shared, larger, or production deployment, set `DATABASE_URL` to PostgreSQL before applying migrations. The repository includes a local PostgreSQL 16 Compose service so the switch is repeatable rather than just a configuration suggestion.

## Local PostgreSQL service

Docker Desktop (or a compatible Docker Compose installation) is required for these commands. From the repository root in PowerShell:

```powershell
Copy-Item configdrf/.env.postgres.example configdrf/.env.postgres
# Edit configdrf/.env.postgres: choose a strong local password and use the
# same, URL-encoded password in DATABASE_URL.
docker compose --env-file configdrf/.env.postgres -f compose.postgres.yml up -d
docker compose --env-file configdrf/.env.postgres -f compose.postgres.yml ps
```

The database port is deliberately bound to `127.0.0.1`, not exposed on every network interface. The Compose configuration owns only PostgreSQL; start Django separately as usual.

`manage.py` intentionally does **not** load arbitrary `.env` files. Before running Django, export the values for the current PowerShell process. This small loader accepts simple `NAME=value` lines in the supplied local file:

```powershell
Get-Content configdrf/.env.postgres | ForEach-Object {
  if ($_ -match '^\s*([^#=\s]+)\s*=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}

python -m pip install -r requirements.txt
python configdrf/manage.py migrate
python configdrf/manage.py check --deploy
python configdrf/manage.py test core
python configdrf/manage.py shell -c "from django.db import connection; print(connection.vendor)"
```

The last command must print `postgresql`. The container itself can be checked with:

```powershell
docker compose --env-file configdrf/.env.postgres -f compose.postgres.yml exec postgres psql -U onlineshop -d onlineshop -c "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';"
```

`sslmode=disable` in the example file is for the loopback-only local container. A hosted database must use TLS, for example:

```text
DATABASE_URL=postgresql://onlineshop:replace-with-a-secret@db.example.com:5432/onlineshop?sslmode=require
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=replace-with-a-long-random-secret
DJANGO_ALLOWED_HOSTS=app.example.com
DJANGO_CORS_ALLOWED_ORIGINS=https://app.example.com
```

URL-encode any reserved characters in a password before putting it in `DATABASE_URL`. Keep all real connection strings and secrets outside version control.

## Search and operational indexes

The PostgreSQL migrations enable `pg_trgm` and add GIN trigram indexes for case-insensitive catalogue name and description search. They also add ordinary composite indexes for active/category/name, active/price, product ownership, order history/status, waitlist lookups, reviews, notifications, and support-ticket workflows.

The functional search indexes match Django's case-insensitive lookup form (`UPPER(column) LIKE UPPER(...)`). On a production-like dataset, verify the actual query plan for a search term with three or more characters before claiming an index is used:

```powershell
docker compose --env-file configdrf/.env.postgres -f compose.postgres.yml exec postgres psql -U onlineshop -d onlineshop -c "EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM core_product WHERE is_active AND UPPER(name) LIKE UPPER('%phone%');"
```

A tiny demonstration catalogue can correctly use a sequential scan; this is not evidence that the index is missing. Search performance should be evaluated after loading a representative dataset.

The migration needs a PostgreSQL role that can run `CREATE EXTENSION pg_trgm`. If a managed database restricts that command, ask its database administrator to enable the extension once before the application migrations run.

## Production checklist

- Keep the database password and Django secret only in environment variables or a secret manager.
- Require TLS (`sslmode=require`) and keep `DJANGO_DEBUG=False`.
- Run migrations in a controlled release, then verify the health endpoint/application logs and database migration state.
- Take automated encrypted backups and perform a restore drill before relying on the deployment.
- Review slow queries and database capacity; `CONN_MAX_AGE` reuses connections but is not a full connection pool. Use managed pooling or PgBouncer at production scale.
- Run representative load tests, monitor errors/latency, and use a managed PostgreSQL service and proper HTTPS domain for public use.

This repository's configuration was prepared where Docker was not available, so a live PostgreSQL container/query-plan run must be performed on the deployment machine before it is described as runtime-verified.
