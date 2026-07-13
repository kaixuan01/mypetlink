# Issues Found — Implementation Status

Audit update: 2026-07-13. This document distinguishes code inspection, automated tests, and local live verification.

## Resolved in this phase

### F-01 — Favourite Food/Toy silently discarded

**Status:** resolved.

**Corrected root cause:** the entity and database columns already existed. The actual omissions were:

- frontend backend-payload mapping;
- create/update request DTO properties;
- create/update service assignments;
- detail/public response DTO fields and mapping;
- frontend detail/public response types and mapping;
- Favourite Food display on the Public Share Profile.

**Fix:** wired the complete flow, retained both Owner Portal inputs, normalized clear operations to `NULL`, kept omitted partial-update values unchanged, and conditionally rendered both public fields. Safety/QR output was not changed.

**Evidence:** backend and frontend regression tests plus local API/SQL/browser verification. A production deployment and signed-in browser Edit Pet pass remain required.

### F-02 — Dashboard computed discarded mock data during build

**Status:** resolved.

**Previous behavior:** `dashboard/page.tsx` called `getPets()` during static generation. Server execution selected the local data path and produced Milo/Luna records, which the API-mode client then discarded.

**New behavior:** the server page passes empty collections. After `AuthGuard` is ready, the client loads real data and renders loading, empty, success, or retryable error states without mock fallback. The plan summary reuses dashboard data rather than issuing duplicate moment loads. Admin pages continue to receive `EMPTY_ADMIN_DATA`.

**Evidence:** page/component/service regression tests. A signed-in production-like browser dashboard run with empty and failing API accounts remains live-test required.

## Still open / not established by this phase

- F-03 full Owner/Admin route matrix: automated checks cover dashboard and admin data initialization, but every portal route was not exercised live.
- Product coverage gaps listed in `enhancements.md` remain unchanged and were not implemented.
- Full Public/Safety privacy, IDOR, media replacement/orphan behavior, responsive/device coverage, and production deployment remain separate verification work.

## Unsupported conclusions removed

Do not report “all fields persist correctly,” “zero Public Profile defects,” “zero Safety Profile defects,” “zero privacy defects,” or “zero responsive defects” based on this phase. The supported statements are limited to F-01/F-02 and the evidence levels recorded in the audit README and test report.
