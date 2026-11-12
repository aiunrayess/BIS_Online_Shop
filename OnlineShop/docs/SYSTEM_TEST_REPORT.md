# OnlineShop system test report

## Scope and result

This report maps the 20 automated Django system tests in `configdrf/core/tests.py` to the acceptance criteria for the core e-commerce workflow. The suite is designed to run against an isolated test database, so it never changes demonstration orders or stock.

**Latest verification result (12 November 2026):** 20/20 tests passed with `python manage.py test core` after migrations were applied.

## Automated system tests

| ID | Scenario | Acceptance evidence |
| --- | --- | --- |
| ST-01 | Create a card order | Order, items, payment snapshot, total, and reduced stock are created together. |
| ST-02 | Insufficient stock | Checkout returns a validation error and rolls back order, payment, and stock. |
| ST-03 | Customer cancellation | A new order can be cancelled once and reserved inventory is restored. |
| ST-04 | Sales payment/reporting | A manager can mark a valid order paid and sales data reports units, revenue, and stock. |
| ST-05 | Cash on delivery | COD becomes paid only when the order reaches delivery. |
| ST-06 | Warehouse stock access | Only warehouse staff can update stock and a change creates an adjustment record. |
| ST-07 | Staff checkout restriction | A manager cannot create a customer order. |
| ST-08 | Seller customer journey | A seller may also place a normal customer order. |
| ST-09 | Warehouse data minimisation | Warehouse order output excludes payment and customer-account fields. |
| ST-10 | Public registration safety | Registration cannot create a staff role. |
| ST-11 | Customer order privacy | A customer cannot read another customer’s order. |
| ST-12 | Profile access scope | A customer can update own profile data but cannot change own role. |
| ST-13 | Head-manager access | A head manager creates/reassigns only ordinary operational roles. |
| ST-14 | Security-manager access | A security manager can lock an ordinary account with a reason and review audit events. |
| ST-15 | Seller ownership | A seller edits/deactivates only owned products and cannot alter stock directly. |
| ST-16 | Stock reconciliation | A warehouse adjustment needs a meaningful reason and cannot make stock negative. |
| ST-17 | Fulfilment workflow | Warehouse staff can prepare eligible orders but not unpaid card orders. |
| ST-18 | Dashboard, password, availability | Head dashboard is protected, password changes work, and inactive products cannot be ordered. |
| ST-19 | Administrator bootstrap | A Django superuser receives the database-administrator role. |
| ST-20 | Session revocation | A user can revoke only a refresh session belonging to that user. |

## Complementary checks

- `npm run build` validates the Angular production build.
- `npm test -- --watch=false` runs the Angular unit suite.
- `python manage.py check --deploy` validates the Django production-security configuration.
- Browser smoke testing covers catalogue search/filtering, product details, cart quantities, checkout validation, and protected role routes.

## User-acceptance-test demonstration checklist

Use this short UAT checklist with a stakeholder during the project demonstration. It complements—not replaces—the automated checks above.

| UAT ID | User action | Expected acceptance result |
| --- | --- | --- |
| UAT-01 | Open a category or submit a catalogue search. | Results update on the first click and the selected filter/search is visible in the URL and catalogue. |
| UAT-02 | Try to add an out-of-stock product. | The Add control is disabled; the API would also reject an unavailable item at checkout. |
| UAT-03 | Increase/decrease a cart quantity. | Quantity stays between 1 and available stock, and totals update. |
| UAT-04 | Submit checkout without delivery address or valid card data. | The page shows a clear validation message and no order is created. |
| UAT-05 | Submit a valid demo card checkout. | The order appears with a masked brand/final-four reference; no full card data is stored. |
| UAT-06 | Sign in as Warehouse Staff. | Stock changes require a reason and eligible orders can be marked Preparing. |
| UAT-07 | Sign in as Head Manager or Security Manager. | Each sees only the account/dashboard or audit/status controls assigned to that role. |
| UAT-08 | Search the audit log and sales report. | Relevant operational/security events and current KPI/report data are returned. |

## Known test boundary

The card flow is a safe demo: tests verify the API accepts only card brand and final-four metadata. It deliberately does not perform a real card charge or transmit/store PAN, CVC, or expiry data. A production payment integration requires a PCI-compliant provider and tokenisation.
