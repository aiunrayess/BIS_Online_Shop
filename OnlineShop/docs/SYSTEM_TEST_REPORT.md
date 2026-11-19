# OnlineShop system test report

## Scope and verified result

This report maps the automated Django system suite in `configdrf/core/tests.py` to the project acceptance criteria. Tests run against an isolated database, so they do not change demonstration stock, orders, or customer data.

**Latest verification result (19 November 2026): 59/59 tests passed** with:

```powershell
$env:DJANGO_SECRET_KEY = 'a-long-development-only-secret'
$env:DJANGO_DEBUG = 'True'
python configdrf/manage.py test core --verbosity 1
```
## Automated system coverage

| ID | Scenario | Acceptance evidence |
| --- | --- | --- |
| ST-01 | Create a card order | Order, items, safe payment snapshot, total, and reduced stock are created together. |
| ST-02 | Insufficient stock | Checkout returns a validation error and rolls back order, payment, and stock. |
| ST-03 | Customer cancellation | A new order can be cancelled once and reserved inventory is restored. |
| ST-04 | Sales payment/reporting | A manager marks a valid order paid and sales data reports units, revenue, and stock. |
| ST-05 | Cash on delivery | COD becomes paid only when the order reaches delivery. |
| ST-06 | Warehouse stock access | Only warehouse staff update stock and a change creates an adjustment record. |
| ST-07 | Staff checkout restriction | A manager cannot create a customer order. |
| ST-08 | Seller customer journey | A seller can also place a normal customer order. |
| ST-09 | Warehouse data minimisation | Warehouse order output excludes payment and customer-account fields. |
| ST-10 | Public registration safety | Registration cannot create a staff role. |
| ST-11 | Customer order privacy | A customer cannot read another customer’s order. |
| ST-12 | Profile access scope | A customer edits own profile data but cannot change own role. |
| ST-13 | Head-manager access | A head manager creates/reassigns only ordinary operational roles. |
| ST-14 | Security-manager status control | A security manager locks an ordinary account with a reason and reviews audit events. |
| ST-15 | Seller ownership | A seller edits/deactivates only owned products and cannot alter stock directly. |
| ST-16 | Stock reconciliation | A warehouse adjustment needs a reason and cannot make stock negative. |
| ST-17 | Fulfilment workflow | Warehouse staff prepare eligible orders but not unpaid card orders. |
| ST-18 | Dashboard/password/availability | Head dashboard is protected, password changes work, and inactive products cannot be ordered. |
| ST-19 | Administrator bootstrap | A Django superuser receives the database-administrator role. |
| ST-20 | Session revocation | A user revokes only a refresh session belonging to that user. |
| ST-21 | Security role reassignment | Security Manager changes an ordinary role with a reason and an audit event. |
| ST-22 | Security role reason | Security Manager cannot change a role without a reason. |
| ST-23 | Security self protection | Security Manager cannot reassign their own account. |
| ST-24 | Protected account guard | Security Manager cannot reassign a Head Manager account. |
| ST-25 | Django administrator guard | Security Manager cannot change an `is_staff`/`is_superuser` account. |
| ST-26 | Privilege-escalation guard | Security Manager cannot grant a protected role. |
| ST-27 | Security reactivation | Security Manager reactivates an ordinary account with audit evidence. |
| ST-28 | Review creation/aggregate | Customer creates feedback and product returns rating average/count. |
| ST-29 | Rating range | Ratings outside 1–5 are rejected. |
| ST-30 | One review per product | A second review by the same customer/product is rejected. |
| ST-31 | Review ownership update | Review author can edit their own feedback. |
| ST-32 | Review ownership delete/edit | Another customer cannot edit or delete a review. |
| ST-33 | Staff feedback guard | Staff account cannot submit a customer review. |
| ST-34 | Public review minimisation | Review output excludes email and address. |
| ST-35 | Rating recalculation | Removing a review updates aggregate count/average. |
| ST-36 | Top-products rating rank | Higher rating ranks first. |
| ST-37 | Top-products review-volume tie-break | More reviews ranks first at equal rating. |
| ST-38 | Top-products demand tie-break | More completed-order units ranks first when rating/reviews tie. |
| ST-39 | Wishlist save | Customer saves a product privately. |
| ST-40 | Automatic zero-stock waitlist | Saving a zero-stock product also activates waiting-list enrollment. |
| ST-41 | Wishlist privacy | Customer cannot see another customer’s wishlist. |
| ST-42 | Inactive wishlist guard | Inactive product cannot be saved. |
| ST-43 | In-stock waitlist guard | In-stock product cannot be added to waiting list. |
| ST-44 | Idempotent waitlist | Duplicate waitlist request leaves one entry. |
| ST-45 | Waitlist removal | Customer can stop an active stock alert. |
| ST-46 | Restock notifications | A zero-to-positive restock notifies every waiting customer exactly once. |
| ST-47 | No false restock alert | Positive-to-positive stock update does not notify. |
| ST-48 | Notification privacy/read state | Notifications are private and an owner can mark one read. |
| ST-49 | Re-enrolment | Customer can request a later alert after an earlier restock notice. |
| ST-50 | Cancellation preservation | Customer cancellation saves cancelled products to wishlist. |
| ST-51 | Managed cancellation alert | Management cancellation restock notifies waiting customer. |
| ST-52 | Support creation/ownership | Customer creates and lists own support ticket. |
| ST-53 | Support privacy | Customer cannot see another customer’s ticket. |
| ST-54 | Support update guard | Customer cannot update a support ticket as staff. |
| ST-55 | Support triage/reply | Manager reply/status change records audit and notifies customer. |
| ST-56 | Security support workflow | Security Manager can securely resolve a ticket. |
| ST-57 | Support status transition | Invalid ticket lifecycle transition is rejected. |
| ST-58 | Support input validation | Meaningful subject/message are required. |
| ST-59 | Support analytics | Head dashboard returns open and per-status support KPIs. |

## Complementary verification

- `npm run build` checks the Angular production build.
- `npm test -- --watch=false` runs the Angular unit suite.
- `python configdrf/manage.py check --deploy` validates Django production-security settings.
- Browser smoke testing covers search/filtering, product feedback, saved lists, notification read state, client support, account controls, cart, checkout, and protected routes.
- On a Docker-capable deployment machine, PostgreSQL verification additionally checks `connection.vendor`, migrations, `pg_trgm`, and an `EXPLAIN (ANALYZE, BUFFERS)` search query. See [PostgreSQL deployment](POSTGRESQL_DEPLOYMENT.md).

## User-acceptance-test demonstration checklist

| UAT ID | User action | Expected acceptance result |
| --- | --- | --- |
| UAT-01 | Open a category or submit a catalogue search. | Results update on the first click; selected search/filter is visible in the URL and catalogue. |
| UAT-02 | Rate/review a product as a customer. | One 1–5 review is saved, average/count update, and no customer contact data is exposed. |
| UAT-03 | Save an out-of-stock product. | It enters wishlist and waiting list; a later zero-to-positive restock creates one in-app notification. |
| UAT-04 | Cancel a new customer order. | Inventory is restored and its products remain in wishlist. |
| UAT-05 | Sign in as Security Manager. | Ordinary-account role/status changes require a reason; protected accounts and roles cannot be changed. |
| UAT-06 | Submit a support request as customer, then sign in as Manager. | Customer sees only own ticket; manager can reply/update status; customer receives an update notification. |
| UAT-07 | Submit checkout without delivery address or valid safe card metadata. | Clear validation appears and no order is created. |
| UAT-08 | Sign in as Warehouse Staff. | Stock changes require a reason and eligible orders can be marked Preparing. |

## Known boundaries

- The card flow is a safe demo. It does not charge a card or transmit/store PAN, CVC, expiry, or cardholder data; production needs a PCI-compliant provider and tokenisation.
- Restock and support updates are currently in-app notifications. Email/SMS/push delivery is a future integration.
- PostgreSQL deployment is configured and documented. Docker was unavailable in this development environment, so live container/query-plan verification must be performed on the deployment machine before it is called runtime-verified.
