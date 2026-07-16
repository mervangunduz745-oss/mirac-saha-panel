# Miraç ERP v1.5 — Focused Security Review

Date: 2026-07-16 UTC

Scope:

- `public/index.html` order → production → sale changes
- `public/firebase-cloud.js` concurrency behavior from GitHub `main`
- `firestore.rules` authorization and revision controls from GitHub `main`
- supplied `mirac_erp_pilot_yedek-1.json`, inspected read-only

Result: no reportable security regression found in the changed flow.

Verified controls:

- A linked final sale is blocked when its order/job is missing, mismatched, duplicated, or not delivered.
- Order, production, and sale identity fields are taken from the source order and cannot drift during linked production edits.
- Automatic legacy migrations are queued to Firestore only for `owner` or `editor`; `worker` and `viewer` do not push migration writes.
- Firestore saves changed order, production job, sale, and log documents inside one transaction with revision checks. Concurrent finalizations therefore contend on the same order/job revisions instead of silently creating two valid sales.
- Worker-controlled order and production strings are HTML-escaped in movement, order, delivery, production, guide, control, and technical-status sinks touched by this change.
- The legacy migration fills missing fields only, refuses to overwrite conflicting non-empty links, does not auto-resolve duplicate sales, and is idempotent.
- The supplied backup contains no duplicate transaction IDs, production IDs, or stock codes; no negative amounts; and no paid-over-total records.

Data integrity result:

- Before migration: 16 critical linkage problems.
- After migration: 0 critical linkage problems and 2 non-blocking order/sale price-difference warnings.
- Sales, collections, advances, receivables, and cash totals are unchanged by migration.

Limitations:

- This is a focused local review, not a completed GitHub diff scan: the GitHub connector rejected branch creation, so no PR revision exists to scan.
- Authenticated browser and live Firebase staging tests were not executed; production remains unchanged.
