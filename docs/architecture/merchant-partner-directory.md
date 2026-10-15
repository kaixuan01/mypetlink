# Merchant partnership branches and public directory

## Existing implementation findings

The live merchant domain is `Merchant` in `MerchantSalesEntities.cs`, managed by
`MerchantSalesService` and `/api/v1/admin/merchant-sales/merchants`. Merchant
Management is the Merchants tab under Partners in the existing Admin sales
workspace. `IsActive` is the existing business state; there is no separate
approval state or Merchant Portal. Billing/delivery addresses, assigned sales
staff, quotations, merchant orders, tag allocation, fulfilment, commissions,
documents and email all already operate at merchant level.

The existing `/where-to-buy` marketing page had an empty static retail partner
placeholder. The public directory extends that page rather than adding another
store route. The app is a static Next.js export backed by the live .NET API and
SQL Server. Older root README/planning descriptions of a placeholder API are
historical; they are not the architecture used for this implementation.

The initial directory reused legal/trading names and added a description and
explicitly entered branch contacts. The merchant-logo follow-up adds one
optional `Merchants.LogoMediaFileId` reference using the existing media pipeline;
branches have no logo field. See the [logo implementation and rollout record](../deployment/merchant-logo-implementation-2026-10-15.md).

## Database and visibility

`Merchants.ShowOnWebsite` is false by default, including every existing row.
`BusinessDescription` is optional (2,000 characters). `DirectoryPublicCode` is
an opaque random public identifier, allocated on the first listing-settings
save and retained when visibility changes. Internal IDs and sequential merchant
codes are not public directory identifiers.

`MerchantBranches` is a one-to-many child of `Merchants`, with a restrictive
foreign key. It has name, structured address, optional Maps/Waze links, optional
paired coordinates, optional phone/WhatsApp, simple hours, active status,
independent public consent, display order, UTC timestamps and rowversion.
There is no delete endpoint. Disable a branch to preserve its record. Limits
include 100 branches per merchant, 160-character names, 2,048-character links,
500-character hours and display order 0–10,000. Every branch save advances the
parent rowversion so publication scope cannot race a branch edit. Additions also
serialize the branch limit. Commercial editors with older tokens must reload.

The one effective rule is:

```
Merchant.IsActive && Merchant.ShowOnWebsite &&
Branch.IsActive && Branch.ShowOnWebsite
```

A merchant also needs at least one eligible branch to be returned publicly.
Parent visibility changes do not alter child choices. Listing changes never
change `IsActive`, commercial terms, quotations, orders, tag allocation,
activation or financial snapshots. Changing commercial active status clears the
parent publication switch and audits the withdrawal in the same save. Commercial
reactivation needs no permission evidence and cannot republish: an administrator
must explicitly publish again with current evidence. Branch visibility choices,
public codes and historical evidence are preserved. Legacy inactive rows with a
selected parent switch are also cleared on reactivation.

Migration: `20261013081130_AddMerchantPartnerDirectory`. Its Up path only adds
columns, the branch table, coordinate check constraint, restrictive FK and
lookup indexes. Both public switches have SQL defaults of false. No addresses
are copied automatically from billing/delivery records and no consent is
backfilled. Root `migration.sql` is regenerated as an idempotent deployment
script. `database/migration.sql` remains non-authoritative.

## API contracts and authorization

All paths below are under `/api/v1` and use the existing response/error envelope.

| Method / path | Purpose | Access |
| --- | --- | --- |
| GET `/admin/merchant-sales/merchants/{merchantId}/listing` | Listing preferences and all branches | `sales.view` |
| PUT `/admin/merchant-sales/merchants/{merchantId}/listing` | Save consent and description | `sales.manage` |
| POST `/admin/merchant-sales/merchants/{merchantId}/branches` | Add a physical branch (201) | `sales.manage` |
| PUT `/admin/merchant-sales/merchants/{merchantId}/branches/{branchId}` | Edit, enable or disable a branch | `sales.manage` |
| GET `/public/partner-stores?page=1&pageSize=20&search=...` | Paged eligible merchants and their eligible branches | Anonymous |
| GET `/public/partner-stores/{publicCode}` | Eligible merchant; hidden/inactive/unknown returns 404 | Anonymous |

`MerchantDirectoryService` owns the listing logic, validates typed requests and
uses `IAuditLogService` to record the actor and old/new values in the same save
as the change. Existing merchant commercial editing never accepts listing
fields, preventing older callers from clearing consent accidentally. Listing
and branch updates require their own current concurrency tokens; stale writes
return 409. Malformed fields return 400; mismatched merchant/branch parents
return 404. Capability access is resolved by the existing database-backed
authorization handler on each request, not from role names or token role claims.

The Admin listing includes the parent's active state alongside its rowversion.
Branch forms submit `merchantConcurrencyToken` as well as the branch token, so
the parent cannot change from hidden/inactive to published behind an older
confirmation. The optional parent token keeps older private-edit clients
compatible; the current Admin UI always supplies it.

Publication permission uses the existing audit table, with no new schema.
Turning a merchant's public switch ON requires `permission.source` (WhatsApp,
Email, WrittenAgreement or Other), a nonblank private `permission.reference`
(maximum 500 characters), and `permission.branchIds` matching every currently
selected branch, including inactive selections. The audit snapshots agreed
branch IDs, names and addresses atomically with the switch. Empty scope is valid
when no branches are selected; later opt-ins require separate branch evidence.
Under an enabled merchant, selecting an active branch or reactivating a selected
branch requires its own permission reference, even if the merchant is currently
commercially inactive. Changing a selected active branch's name or structured
address also requires new evidence, so relocation cannot silently expand the
agreed scope. Hours, contacts, links and ordering edits do not require renewed
evidence on an already-selected branch. A hidden parent may prepare branches without evidence;
enabling the parent then requires confirmation of their scope. Optional
`withdrawalReason` (500 characters) is audited on hiding/disabling. Evidence is
not returned in listing DTOs or public contracts; authorized activity history
is the existing place to inspect it. Legacy published records are preserved,
but their permission should be reviewed operationally before production.

The public query explicitly filters parent and child visibility, including
when matching locations. A hidden branch cannot make its merchant match a
search. Public DTOs omit internal IDs, private billing/delivery addresses,
registration/tax numbers, account contacts, sales assignments, notes, terms,
consent flags and concurrency tokens. Only opted-in physical branch addresses
and contacts are published. Search is capped at 160 characters and page size at
100; stable ordering precedes pagination.

## Admin and public experience

The existing merchant detail view contains Partner Directory & Store Locations:
merchant consent, description, effective publication badges, public preview link,
and store location add/edit forms. UI copy uses "Store Location" for single shops
and multi-location businesses; entity names, DTO fields and endpoint paths still
use `Branch`. Each location shows Active/Inactive separately from Published/Hidden.
The shared image upload control has an opt-in compact layout for the merchant's
one logo, with an 80 px contained preview and wrapped upload/save actions. Other
image upload forms retain their existing layout and behavior.

Locations retain structured address/navigation fields, separate active and public
switches, shared phone controls, validation, confirmation and reload after stale
edits. Read-only administrators see records without mutation actions. New
merchants remain hidden; add physical store locations explicitly in their detail
view. Billing addresses never create a location automatically.

The public layout uses only the eligible locations returned by the public API.
One location displays its address directly inside the merchant card, without a
nested location card. A near-identical location name (ignoring case, spacing and
punctuation) is suppressed; a distinct name remains visible. Two or more locations
use "Our Locations (n)" and compact cards. The logo appears once per merchant.
Empty location lists render no merchant card. No internal count or hidden
location is used to select a layout; server publication and permission rules
remain authoritative and unchanged.

Merchant and branch drafts are independent. Own branch saves refresh merchant
tokens only when its fields still match the original baseline; external refresh
retains dirty values and their original tokens. Parent list refresh keeps the
selected detail mounted. Reload, switching editors/merchants, closing, workspace
navigation and browser Back/Forward require explicit discard when drafts would be lost.
The root beforeInteractive history bridge intercepts traversal before Next
processes it; native history indexes undo/replay the real traversal rather than
replacing entries. Dirty signals are synchronous layout effects and teardown
never counts as consent to discard. Explicit discard clears the single workspace
unload guard, avoiding a second native confirmation.
Reloading/leaving the browser uses its native warning. Drafts and private
permission references are never persisted to browser storage. Effective branch
publication changes are confirmed, including reactivation with retained consent;
changes that stay private do not prompt for public availability confirmation.

`/where-to-buy` groups multiple branches under each merchant, searches names and
locations, paginates, shows addresses/hours and offers only available navigation
or branch contact actions. The existing header/footer link remains available as
Partner Stores while online ordering is closed. No inventory availability is
inferred from public visibility; visitors are asked to contact the branch.
There are responsive layouts and explicit loading, empty, unavailable and retry
states. With no configured API, the local preview returns an empty collection;
it never fabricates partner data.

`partnerStorePath(publicCode)` provides a preview/filter link on the same page
using `?store=...#partner-stores`. Unknown/withdrawn links show an unavailable
state because the public detail request returns 404. No new dynamic merchant or
branch page, static record generation, individual merchant sitemap entry or
merchant metadata is added. The existing canonical URL is retained; the generic
landing page is indexable and in the sitemap with checkout ON or OFF, including
an empty directory. The existing staging noindex safeguard still takes priority.
Search engines receive no merchant records or permission data in static HTML.

Public API responses set browser and CDN no-store headers; client requests use
`cache: no-store` and omit authentication. No directory data is saved to
localStorage or another client cache. Each new request reflects consent changes
immediately. Already-open visible pages recheck every 30 seconds and on focus,
pageshow or returning from a hidden tab. Background refresh retains cards and
replaces them on success; confirmed withdrawal removes them immediately. A list
404 is a loading error, not an unavailable individual merchant. Transient errors
may retain the last valid result only until 60 seconds after its last successful
read; the same deadline applies while a refresh is still pending. Information
already delivered cannot be recalled. Search uses only the name actually shown
publicly (trading name, falling back to legal name when that is the public name).

## Navigation URL policy

Optional provider links are trimmed/normalized and restricted to HTTPS, exact
approved hosts, default HTTPS ports, no credentials and provider navigation
paths. JavaScript, HTTP, unrelated domains, domain lookalikes, arbitrary Google
redirect paths and credential-bearing URLs are rejected. Supported Maps hosts
are `google.com`, `www.google.com`, Malaysian equivalents, `maps.google.com`
and `maps.google.com.my`, plus Maps-specific `maps.app.goo.gl` and `goo.gl/maps/`
share links. Waze hosts are `waze.com`, `www.waze.com` and `ul.waze.com`, on
`/ul` or `/live-map` paths and their child paths.

Stored provider links take precedence independently. A missing provider link is
generated from the coordinate pair when available. No key, geocoding, embedded
map or paid integration is introduced. Links open with `noopener noreferrer`;
the interface does not claim that a supplied destination is verified.
Generated URLs follow [Google Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started)
and [Waze deep-link documentation](https://developers.google.com/waze/deeplinks).

## Deferred improvements

Logo uploads, localized hours, consent-document attachments, individual store
SEO pages, geocoding/map embeds and push invalidation are deferred. Branch IDs
and the restrictive relationship allow future commercial links, but this phase
adds no branch inventory, sales reporting, Merchant Portal, reviews, ratings,
marketplace links, commissions or checkout flows.

For verification, manual QA and rollout/rollback, see
[`../deployment/merchant-partner-directory-rollout.md`](../deployment/merchant-partner-directory-rollout.md).
