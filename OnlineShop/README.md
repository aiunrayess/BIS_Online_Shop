# OnlineShop | Full-stack e-commerce platform

OnlineShop is a Django REST + Angular e-commerce project with role-based operations, secure account control, customer feedback, saved-product workflows, client support, and PostgreSQL-ready deployment.

## Project team and work areas

| Team member | Student ID | Work area |
| --- | --- | --- |
| Ainur Yessenbek | 24B031758 | Architecture & Security |
| Zhaparov Arystanbek | 24B031779 | Systems Analysis & Requirements |
| Dastan Baigaliyev | 24B031670 | Data & Database |
| Orazbay Koibagar | 24B032151 | Testing, Analytics & Integration |
| Serikova Nazira | 24B032020 | Application & Development |

## Delivered features

- Role-aware customer, seller, management, warehouse, Head Manager, Security Manager, and administrator workflows.
- Security Manager account control: reasoned/audited activation and disable actions plus safe reassignment of ordinary operational roles; protected/self/Django administrator accounts cannot be changed.
- Catalogue search, filtering/sorting, owner-controlled listings, stock history, cart, atomic checkout, safe demo payment metadata, and order fulfilment.
- Customer feedback: one 1–5 review per customer/product, aggregate ratings, review ownership controls, and a public top-products ranking.
- Wishlist, waiting list, and private in-app restock notifications. A zero-stock wishlist save automatically starts a waiting-list alert; a zero-to-positive restock notifies each active waiter once.
- Customer cancellation restores stock and preserves cancelled products in the customer’s wishlist.
- Client Support tickets: customers create/view their own requests; authorised support staff triage, reply, resolve, audit, and notify customers.
- PostgreSQL configuration, `pg_trgm` GIN search indexes, operational indexes, and a local Compose service for reproducible deployment setup.
- A 59-case Django system test suite, Angular build/unit checks, and documented UAT/test evidence.

## Technology

- Backend: Django 6, Django REST Framework, SimpleJWT, PostgreSQL via `psycopg` (SQLite fallback for zero-setup local development).
- Frontend: Angular standalone components, TypeScript, Leaflet/OpenStreetMap, Font Awesome.

## Run locally with SQLite

From the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:DJANGO_SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(50))"
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py migrate
python configdrf/seed_data.py
python configdrf/manage.py runserver
```

Start Angular in a second terminal:

```powershell
Set-Location frontend
npm install
npm start
```

Open `http://localhost:4200`. The Angular development proxy sends `/api` requests to Django at `http://127.0.0.1:8000`.

## Restore local demo access

The six role-demo accounts below are active in the supplied local database and use the shared **local-demo-only** password `QuickMartDemo2026!`. Do not use this password outside a classroom/demo environment.

| Role | Email |
| --- | --- |
| Buyer | `buyer.demo@quickmart.test` |
| Seller | `seller.demo@quickmart.test` |
| Sales Manager | `sales.manager@quickmart.test` |
| Warehouse Staff | `warehouse.staff@quickmart.test` |
| Head Manager | `head.manager@quickmart.test` |
| Security Manager | `security.manager@quickmart.test` |

If these accounts are changed later, restore only these six accounts without deleting any users, orders, listings, tickets, or other data:

```powershell
$env:DJANGO_SECRET_KEY = 'your-local-development-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py bootstrap_demo_accounts --password 'QuickMartDemo2026!' --reset-existing
```

The recovery command intentionally leaves every other pre-existing account untouched. Passwords for older arbitrary accounts cannot be recovered from Django password hashes; reset only the specific account you own if access is required.

## Run with PostgreSQL

The local PostgreSQL service, environment-file template, migrations, validation commands, indexed-search notes, and production precautions are in [docs/POSTGRESQL_DEPLOYMENT.md](docs/POSTGRESQL_DEPLOYMENT.md). Use the supplied Compose configuration rather than exposing a database port publicly. The project was configured where Docker was unavailable, so perform the documented live migration, extension, vendor, and query-plan checks on the deployment machine.

## Roles and protection boundaries

| Role | Main capabilities | Deliberate boundary |
| --- | --- | --- |
| Buyer / Seller | Browse, order, save products, wait for restock, rate/review, open support tickets. Seller also owns listings. | Cannot operate stock, other accounts, or other customers’ private data. |
| Sales Manager | Process orders, sales report, customer support triage. | Cannot reconcile stock or administer protected accounts. |
| Warehouse Staff | Reasoned stock adjustments/history; prepare eligible orders. | Cannot change catalogue stock through normal listing edits or view payment data. |
| Head Manager | Create ordinary accounts, assign ordinary roles, dashboard KPIs, operational workflow. | Cannot bypass protected administrator security controls. |
| Security Manager | Audit log, ordinary account activation/disable and ordinary role reassignment with a required reason, secure support handling. | Cannot edit self, Head Manager, Security Manager, administrator, `is_staff`, or superuser accounts; cannot grant protected roles. |
| Database Administrator | Break-glass full operational access. | Protected from Security Manager account changes. |

Passwords are Django hashes and never returned by the API. JWT access tokens are short lived; refresh tokens rotate and can be revoked. The demo card flow validates in the browser and sends/stores only card brand and last four digits—never a full card number, expiry, CVC, or cardholder name.

## Tests and verification

```powershell
$env:DJANGO_SECRET_KEY = 'a-long-development-only-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py test core --verbosity 1
python configdrf/manage.py check --deploy
```

```powershell
Set-Location frontend
npm run build
npm test -- --watch=false
```

The latest backend run passed **59/59** tests, including **39 new tests** for the added account-control, feedback, saved-list, notification, support, and analytics workflows. Full coverage and UAT steps: [docs/SYSTEM_TEST_REPORT.md](docs/SYSTEM_TEST_REPORT.md).

## Main API endpoints

- `GET /api/products/top/?limit=10` — public top-products ranking.
- `GET/POST /api/products/<id>/reviews/` and `PATCH/DELETE /api/products/<id>/reviews/<review_id>/` — public feedback; owner writes only.
- `GET/POST /api/wishlist/`, `DELETE /api/wishlist/<product_id>/` — customer wishlist.
- `GET/POST /api/waitlist/`, `DELETE /api/waitlist/<product_id>/` — zero-stock restock alerts.
- `GET /api/notifications/`, `PATCH /api/notifications/<id>/read/` — owner’s in-app notifications.
- `GET/POST /api/support-tickets/`, `PATCH /api/support-tickets/<id>/` — customer-owned tickets and authorised staff triage.
- `PATCH /api/users/<id>/role/` — Head Manager/administrator, or bounded Security Manager role control. Security changes need `reason`.
- `PATCH /api/users/<id>/status/` — Security Manager/administrator with a required reason.
- `PATCH /api/products/<id>/stock/` — Warehouse/administrator with `stock_qty` or `adjustment` plus reason.

For requirements, database design, architecture, and future work, see [docs/PROJECT_REQUIREMENTS_AND_DESIGN.md](docs/PROJECT_REQUIREMENTS_AND_DESIGN.md).
