# 🛒 QuickMart | Full-Stack E-commerce Platform

**QuickMart** is a modern e-commerce platform developed as a final project for Web Development. The project is a complete Full-Stack application using Django REST Framework for the backend and Angular for the frontend.

---

## 👥 Project Team
*   **Rakhat** — Frontend Developer
*   **Orazbay** — Backend Developer
*   **Vadim** — Full-stack / UI Design

---

## 🚀 Key Features
- **Role-based operations**: Buyers and sellers use customer and catalog flows. Sales Managers operate orders and catalog data, Warehouse Staff prepare orders and reconcile stock, Head Managers manage operational roles and see non-PII business metrics, and Security Managers protect accounts and inspect the audit trail.
- **Product Catalog**: Browse products with category filtering and sorting by price/name.
- **Inventory**: Products have unique SKUs, non-negative stock, purchase-time prices, and an immutable reasoned stock-adjustment history.
- **Checkout**: Customers provide a delivery address and choose a payment method. Checkout is atomic and reserves stock.
- **Demo Payments**: Card, bank-transfer, and cash-on-delivery choices are recorded as pending; no payment is charged and no card details are collected.
- **Customer Account**: Customers can view and update their own profile and see/cancel their own new orders.
- **Order Operations**: Managers update order statuses and review a 30-day sales report; warehouse staff prepare orders and update stock.
- **Map Integration**: Interactive maps for shop locations using Leaflet.
- **Security**: Password-policy validation, short-lived rotating JWT sessions, throttled login/registration, account activation controls, and audit records.
- **Responsive Design**: Fully optimized for mobile and desktop viewing.

---

## 🛠 Technology Stack
### Backend
- **Django 6.0+**
- **Django REST Framework**
- **SimpleJWT** (Authentication)
- **SQLite** (Database)

### Frontend
- **Angular 17+** (Standalone components)
- **TypeScript**
- **Leaflet** (Maps API)
- **FontAwesome** (Icons)

---

## 🏁 Getting Started

### 1. Prerequisites
Ensure you have **Python 3.x** and **Node.js** (with npm) installed on your system.

### 2. Backend Setup

Run these commands from the project root. The examples below use PowerShell:

~~~powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DJANGO_SECRET_KEY = python -c "import secrets; print(secrets.token_urlsafe(50))"
$env:DJANGO_DEBUG = "True"
python configdrf/manage.py migrate
python configdrf/seed_data.py  # Adds/updates catalog data without resetting stock or orders
python configdrf/manage.py runserver
~~~
*The backend will be available at: http://127.0.0.1:8000*

### 3. Frontend Setup
```bash
cd frontend
npm install
npm start
```
*The website will be available at: `http://localhost:4200`*

## Temporary public presentation link

For a short demo, the Angular server proxies /api requests to Django so remote browsers use the laptop-hosted backend rather than their own localhost. Keep Django bound to localhost and use an ignored configdrf/.env file containing a private DJANGO_SECRET_KEY, DJANGO_DEBUG=False, and DJANGO_SECURE_SSL_REDIRECT=False. The last setting is necessary only because the local Angular proxy talks to Django over HTTP after the public tunnel terminates TLS:

```bash
cd configdrf
. .venv/bin/activate
set -a
. .env
set +a
python manage.py runserver 127.0.0.1:8000 --noreload
```

In another terminal, start the frontend and a Cloudflare Quick Tunnel:

```bash
cd frontend
npm start -- --configuration production --host 0.0.0.0 --port 4200
```

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4200
```

Share the `https://…trycloudflare.com` address printed by `cloudflared`. Anyone with the link can access the site, and the link stops working when the tunnel or laptop stops. Quick Tunnels are for testing, have no uptime guarantee, and generate a different hostname when restarted; use a registered domain and a named tunnel for a stable URL. Do not use this development setup for production or expose real customer data.

---

## 🔐 Administrative and role demo accounts
Create an administrator with a unique password after applying migrations:
~~~bash
python configdrf/manage.py createsuperuser
~~~

For a disposable local demonstration, create Buyer, Seller, Sales Manager, Warehouse Staff, Head Manager, and Security Manager accounts with a password you choose. The command never contains or generates a default credential, and it never overwrites an existing account:

~~~bash
python configdrf/manage.py bootstrap_demo_accounts
~~~

## Roles and operational workflow

The database stores customers (the authenticated `User` model), categories, products, orders, order items, and one payment record per new order. Each order item records quantity and the unit price at checkout. Stock is decremented within the same transaction that creates the order and payment; an insufficient-stock error rolls the transaction back. Cancelling a new order restores its reserved stock.

Passwords are stored as Django password hashes and are write-only in the API. Customers can change their own password and update only their own profile. A Head Manager can create and assign the operational Buyer, Seller, Sales Manager, and Warehouse Staff roles. A Security Manager can deactivate/reactivate ordinary operational accounts with a mandatory reason, and can review audit records. Leadership, security, and database-administrator accounts cannot be reassigned or changed by a Security Manager.

The Angular checkout is a demonstration flow only: selecting a payment method records a pending payment and does not charge a card. Warehouse Staff use POST /api/orders/<id>/prepare/ to mark a paid or cash-on-delivery order as Preparing. Managers can then move it through the permitted delivery states. Every warehouse inventory adjustment requires a reason and creates an immutable stock-history and audit record. Sales reports include paid, shipped, and delivered orders from the last 30 days; new and cancelled orders are excluded.

## Key protected API endpoints

- GET /api/dashboard/overview/ — Head Manager or database administrator.
- GET/POST /api/users/ and PATCH /api/users/<id>/role/ — Head Manager or database administrator. Role changes are limited to operational roles.
- PATCH /api/users/<id>/status/ and GET /api/audit-logs/ — Security Manager or database administrator.
- PATCH /api/products/<id>/stock/ — Warehouse Staff or database administrator; body includes stock_qty or adjustment, plus a required reason.
- GET /api/products/<id>/stock-history/ — Warehouse Staff or database administrator.
- PATCH/DELETE /api/products/<id>/ — the owning Seller, Management, or database administrator. Delete is a safe deactivation.
- POST /api/me/password/ and POST /api/logout/ — authenticated user.

The old Swagger endpoint was removed because its dependency was not part of the runtime requirements. The endpoint list above is kept in sync with the backend routes.
