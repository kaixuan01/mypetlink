# API Contract Draft

> Historical draft. For current backend planning, use [`api-contract-v1-draft.md`](api-contract-v1-draft.md), which adds `/api/v1` versioning, Phase A auth, provider-neutral media/payment proof design, audit logging, scan analytics consent rules, and configurable plans.

Draft REST contract for the future C# .NET 8 API. **Not implemented — for planning only.** Shapes mirror the current frontend types (`apps/web/src/types.ts`) so the mock service layer can be swapped for real calls with minimal UI change. All responses use the existing envelope:

```json
{ "data": {}, "meta": { "requestId": "…", "page": 1, "pageSize": 20, "total": 42 } }
```

Auth: bearer tokens; `/admin/*` endpoints require an admin role. All ids below are server ids; public lookups use the public codes only.

## Auth

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Owner login (OAuth token or email link exchange) |
| POST | `/auth/logout` | End session |
| GET | `/auth/me` | Current session (role: owner/admin) |

## Owner: pets

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/pets` | List my pets |
| POST | `/pets` | Create pet (server generates `publicCode`, `safetyCode`) |
| GET | `/pets/{petId}` | Pet detail |
| PATCH | `/pets/{petId}` | Update profile/visibility/contact |
| POST | `/pets/{petId}/lifecycle` | `{ status: Active|Memorial|Archived, memorial? }` (restore enforces plan limits) |
| POST | `/pets/{petId}/lost-mode` | `{ enabled, lostMode? }` |
| GET/POST/PATCH/DELETE | `/pets/{petId}/records[...]` | Care records |
| GET/POST/PATCH/DELETE | `/pets/{petId}/moments[...]` | Moments; media via upload endpoint |
| POST | `/media/uploads` | Signed upload (photos, payment proofs) |

## Public (no auth)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/public/profiles/{publicCode}` | Public Share Profile projection (visibility enforced server-side) |
| GET | `/public/safety/{safetyCode}` | QR Safety Page projection |
| GET | `/public/tags/{tagCode}` | Finder resolution → `{ state: active|unassigned|pending|inactive|not-found, profile? }` |
| POST | `/public/tags/{tagCode}/activate` | Activation flow (authenticated step binds pet) |

## Owner: tags and orders

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/tags` | My tags |
| POST | `/tags/{tagId}/report-lost` \| `/disable` \| `/archive` \| `/restore` | Owner tag actions |
| GET | `/orders` | My orders |
| POST | `/orders` | Create tag order (pet bound from the start) |
| GET | `/orders/{orderNumber}` | Order detail |
| POST | `/orders/{orderId}/payment-proof` | Submit proof `{ reference?, note?, fileId }` → status Payment Submitted |
| GET | `/orders/{orderId}/receipt` | Receipt (after Payment Confirmed) |

## Admin (role-guarded; every mutation writes an audit log entry)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/summary` | Dashboard counts + recent activity |
| GET | `/admin/owners` / `/admin/owners/{id}` | Owner accounts with pet/order counts |
| GET | `/admin/pets` | All pets with lifecycle/Lost Mode/tag status filters |
| GET | `/admin/orders?status=` | Orders with filters |
| POST | `/admin/orders/{id}/confirm-payment` | Payment Submitted → Payment Confirmed |
| POST | `/admin/orders/{id}/reject-payment` | `{ reason }` → back to Pending Payment |
| POST | `/admin/orders/{id}/status` | `{ status: Preparing|Shipped|Delivered }` (fulfillment; syncs tag) |
| POST | `/admin/orders/{id}/cancel` | Cancel before shipping |
| GET | `/admin/payment-proofs?status=` | Review queue (proof file access) |
| GET | `/admin/tags?status=&petId=` | Tag registry |
| POST | `/admin/tags/{id}/status` | `{ status: Lost|Disabled|Replaced }` |
| POST | `/admin/tags/{id}/archive` \| `/restore` | Archive state |
| POST | `/admin/tag-batches` | `{ count, hasNfc, shape }` → generate Unclaimed stock |
| GET | `/admin/tag-batches/{batchNo}/export` | Manufacturer CSV |
| POST | `/admin/tag-batches/{batchNo}/printed` | Mark printed (future) |
| GET | `/admin/audit-logs` | Operations audit trail |

## Status enums (shared with frontend)

- `OrderStatus`: Draft, Pending Payment, Payment Submitted, Payment Confirmed, Preparing, Shipped, Delivered, Cancelled — fulfillment lives on the order.
- `TagStatus` (server target): Unassigned, Active, Disabled, Lost, Replaced (the frontend's Pending/Preparing/Delivered collapse into order fulfillment).
- `PetLifecycleStatus`: Active, Memorial, Archived. Lost Mode is a pet flag, not a status.
