# Smart Tag physical QA

## Scope and release rule

Physical QA extends Admin → Tag Inventory. It updates existing `SmartTags`;
it does not regenerate codes, duplicate inventory, activate tags, change tag
lifecycle or call public scan resolution. QR camera decoding and NFC NDEF
decoding stay on the inspection screen. No `TagScans`, location records,
notifications to owners, or finder activity are produced by QA.

`QaStatus` is separate from `Status` and `FulfilmentStatus`:

| QA status | Stock use |
| --- | --- |
| Pending | Held |
| Passed | Released, subject to existing inventory and lifecycle rules |
| Failed | Held; move package to the failure tray |
| Needs Review | Held; separate package for investigation |
| NULL | Outside the QA cohort; keeps its pre-QA behaviour |

**NULL is released on purpose.** It marks stock that existed before physical
QA and was never enrolled from a shipment manifest; those tags keep exactly the
behaviour they had before. The consequence is the deployment window described
below: until the 900-code shipment is enrolled, its tags are NULL and sellable.

There is one release rule, `PhysicalQaReleaseRules.Released`
(`QaStatus IS NULL OR QaStatus = 'Passed'`), used as SQL by every stock count
and eligibility query and in memory by every action. It is checked by:

- retail stock and checkout (both availability counts and the checkout
  physical-stock check);
- Admin order tag assignment, change of assigned tag, and replacement;
- Admin claim, pet assignment and ownership transfer;
- merchant eligibility (automatic and manual allocation), quotation Send and
  conversion to an order. Each runs as one database transaction that locks
  the quotation (so a draft edit cannot change its lines meanwhile), reloads
  it, locks the SKUs of its current lines — the same SKU locks checkout and QA
  use — and keeps every lock until it commits. If the connection drops, the
  attempt rolls back and is retried from the start, re-locking and re-checking
  stock; a commit whose response was lost is confirmed, never repeated;
- bulk Send to Owner and Send to Reseller;
- retail and merchant Ready to Ship and Shipped (shipping re-reads the tags);
- **public activation** — an owner cannot activate a Pending, Failed or Needs
  Review tag, even with the tag in hand. They see "This tag isn't ready to
  activate yet. Please contact MyPetLink Support." Historical NULL tags
  activate as before.

Newly generated stock starts Pending, with its production batch number as its
shipment reference. Generation remains a separate operation.

### Accepted tag links

Expected formats for the first shipment:

- QR: `https://mypetlink.com.my/q/{tagCode}`
- NFC: `https://mypetlink.com.my/n/{tagCode}`, expected as an NDEF web link
  (URI) record

**What has and has not been verified.** One example tag code
(`MPL-E8FN-NLGY`) was checked against these formats. The rest of the shipment
has **not** been verified, and the actual NDEF record type and the chip ID (UID)
behaviour on the inspection phone still require physical hardware testing.
Nothing in this document claims hardware compatibility; the hardware checks
below decide it.

QA accepts exactly `{PublicSite:BaseUrl}/q/{code}` for the camera and
`{PublicSite:BaseUrl}/n/{code}` for NFC: same scheme and host, nothing after
the code, uppercase code, and both readings resolving to the package's code.
**The older printed-tag link `/t/{code}` is not accepted** and no compatibility
is added unless tags that need it are actually found. Each refusal names the
problem and the expected link:

| Message begins | Meaning |
| --- | --- |
| "…opens https://other-host, not https://mypetlink.com.my" | Wrong website (including `www.` or `http://`) |
| "…uses the older printed-tag link /t/" | Legacy encoding — hold the package as Needs Review |
| "…uses the QR link /q/ instead of /n/" (or the reverse) | QR and NFC contents swapped or wrongly encoded |
| "…has extra text after the tag code" | Query string or fragment appended |
| "…does not end in a valid tag code" / "…not in the expected format" | Lowercase code, trailing slash, other path |
| "…belongs to MPL-B, but this package is MPL-A" | Wrong package or mis-encoded chip/QR |
| "The NFC chip stores a … record instead of a standard web link (URI) record" | Encoding problem: absolute URI, smart poster, text, empty chip |
| "The phone didn't report this NFC chip's ID, so the package can't pass" | No usable chip ID — hold the package as Needs Review |
| "This code passed earlier on NFC chip X, but chip Y was read now" | A second package with the same printed code — Needs Review, separate both |
| "NFC chip X has already passed as MPL-…" | One chip read under two codes — Needs Review, separate both packages |

### Chip identity

A pass binds the package's tag code to the NFC chip ID (UID) that was read.
Chip IDs are normalized before any comparison: Web NFC's `04:a1:b2:…`, PC/SC's
`04A1B2…`, dashes, spaces and letter case all become the same uppercase hex
value. A value that is not a 4–10 byte hexadecimal ID, or is all zeros, counts
as **no chip ID**.

- **A pass needs a chip ID.** If the phone reports none, the package cannot
  pass; it is held as Needs Review. QA never invents an ID and never treats a
  link read without one as identity-verified. If the inspection phone reports
  no chip IDs at all, nothing can pass: stop and decide before inspecting.
- **Once a code has passed, every later pass must read the same chip.** A
  missing, blank or different chip ID is refused, whatever was saved in
  between. Failed and Needs Review never bind or replace the recorded chip, and
  every chip ID seen is kept in the audit history (normalized and as reported).
- **One chip, one code.** A chip that passed for one tag code cannot pass for
  another. The database enforces this with a unique index, so two inspectors
  saving at the same moment cannot both bind the same chip; the second gets a
  conflict.
- A chip ID is an identifier, not proof of authenticity: chips can be cloned.
  It catches packaging and encoding mistakes, not a determined forger.

Tags that were Passed before this rule existed keep their status; their next
pass binds a chip. In production no tag has a QA result yet, because the
migration has not been applied.

## Deployment sequence — operator action required

No production database operation is performed by this implementation.

### 1. Freeze sales and fulfilment for the affected SKUs

`IsPurchasable` alone is **not** a complete lock: it stops new checkouts only.
Use all of the following, and keep them until enrollment is confirmed:

| Path | Control |
| --- | --- |
| New retail checkouts | Turn the SKUs' purchasing off in the catalog; for a full stop set `Features:SmartTagOrderingEnabled=false` (App Setting, restarts the API) |
| Assign / change / replace order tags | Temporarily remove `orders.tags.assign` from every role except the deploying Super Admin |
| Mark preparing, ready to ship, shipped | Temporarily remove `orders.shipping.manage` |
| Admin claim / pet assignment / transfer | Temporarily remove `smart_tags.assign` and `smart_tags.transfer` |
| Bulk Send to Owner / Reseller | Temporarily remove `inventory.manage` |
| Merchant allocation, ready to ship, shipped | Temporarily remove `merchant_orders.fulfil` |
| Merchant quotation Send / Convert | Temporarily remove `merchant_orders.manage` |
| Public activation | Keep the physical shipment in the warehouse, unopened, until inspection |

Access is resolved from the database on every request, so a removed capability
takes effect immediately. Super Admin keeps every capability — the person
deploying must not fulfil orders during the window. Record which grants were
removed so they can be restored exactly.

### 2. Read-only pre-checks against production

Paste the 900 manifest codes into the table variable. These statements only
read.

```sql
DECLARE @Manifest TABLE (TagCode nvarchar(32) PRIMARY KEY);
-- INSERT INTO @Manifest (TagCode) VALUES (N'MPL-E8FN-NLGY'), (N'...');

-- Every code exists exactly once in inventory.
SELECT COUNT(*) AS ManifestCodes, COUNT(t.Id) AS FoundInInventory
FROM @Manifest m LEFT JOIN SmartTags t ON t.TagCode = m.TagCode AND t.DeletedAt IS NULL;

-- Lifecycle and fulfilment of the cohort.
SELECT t.Status, t.FulfilmentStatus, t.HasNfc, COUNT(*) AS Tags
FROM @Manifest m JOIN SmartTags t ON t.TagCode = m.TagCode AND t.DeletedAt IS NULL
GROUP BY t.Status, t.FulfilmentStatus, t.HasNfc;

-- Retail orders already holding a cohort tag.
SELECT t.TagCode, t.Status AS TagStatus, o.OrderNumber, o.Status AS OrderStatus
FROM @Manifest m JOIN SmartTags t ON t.TagCode = m.TagCode
JOIN TagOrders o ON o.Id = t.OrderId;

-- Live merchant allocations on cohort tags.
SELECT t.TagCode, mo.MerchantOrderNumber, a.Status, mo.FulfilmentStatus
FROM @Manifest m JOIN SmartTags t ON t.TagCode = m.TagCode
JOIN MerchantOrderAllocatedTags a ON a.SmartTagId = t.Id AND a.ReleasedAt IS NULL
JOIN MerchantOrders mo ON mo.Id = a.MerchantOrderId;

-- Anything already activated or sent onward (enrollment refuses these).
SELECT t.TagCode, t.Status, t.FulfilmentStatus, t.ActivatedAt
FROM @Manifest m JOIN SmartTags t ON t.TagCode = m.TagCode
WHERE t.ActivatedAt IS NOT NULL OR t.FulfilmentStatus NOT IN (N'Generated', N'Printed')
   OR t.Status NOT IN (N'Unclaimed', N'Pending', N'Preparing') OR t.ArchivedAt IS NOT NULL;
```

### 3. Apply the migration, then deploy API and web together

`AddSmartTagPhysicalQa` (`20261008040000`) is purely additive:

| Object | Detail |
| --- | --- |
| `SmartTags` columns (14) | `QaStatus`, `QaShipmentReference`, `QaVersion` (int, NOT NULL, default 0, EF concurrency token), `QaInspectionId`, `QaQrUrl`, `QaNfcUrl`, `QaQrVerifiedAt`, `QaNfcVerifiedAt`, `QaNfcSource`, `QaNfcSerialNumber`, `QaPhysicalCondition` (nvarchar(32), NOT NULL, default `Unchecked`), `QaRemarks`, `QaInspectedAt`, `QaInspectedByAdminUserId`; all others nullable |
| `SmartTags` indexes (5) | `IX_SmartTags_ProductVariantId_QaStatus_Status`; `IX_SmartTags_QaInspectedByAdminUserId`; `IX_SmartTags_QaInspectionId` (unique, filtered `IS NOT NULL`); `IX_SmartTags_QaNfcSerialNumber` (unique, filtered `IS NOT NULL`); `IX_SmartTags_QaShipmentReference_QaStatus` |
| `SmartTags` foreign key (1) | `FK_SmartTags_AdminUsers_QaInspectedByAdminUserId` → `AdminUsers.Id`, `ON DELETE NO ACTION` (Restrict) |
| `PhysicalQaShipments` table | `Id` (PK `PK_PhysicalQaShipments`), `ShipmentReference` nvarchar(100), `ExpectedCount` int, `ManifestSha256` nvarchar(64), `EnrolledByAdminUserId`, `EnrolledAt`; all NOT NULL |
| `PhysicalQaShipments` indexes (2) | `IX_PhysicalQaShipments_ShipmentReference` (unique); `IX_PhysicalQaShipments_EnrolledByAdminUserId` |
| `PhysicalQaShipments` foreign key (1) | `FK_PhysicalQaShipments_AdminUsers_EnrolledByAdminUserId` → `AdminUsers.Id`, Restrict |

No check constraints, triggers or data changes. Nothing is backfilled: every
existing tag keeps `QaStatus` NULL, and the new table starts empty, so neither
unique index can conflict with existing rows. `Down` drops exactly these
objects.

Apply the release's root
`migration.sql` through the existing process (`migration-session-settings.sql`
first). In a QA-only release that script's only pending migration is
`AddSmartTagPhysicalQa`; check `__EFMigrationsHistory` afterwards.

Deploy the API and web together. The old API does not enforce QA, so avoid
mixed old/new instances. Confirm `PublicSite:BaseUrl` is exactly
`https://mypetlink.com.my` in the API's configuration: an empty or invalid
value refuses inspection.

### 4. Grant inspection access

Grant `inventory.qa.manage` with `inventory.view` (and optionally
`inventory.export`) to the named inspectors only. The built-in Operations
template includes it; existing customized roles are not changed automatically.
Super Admin has it implicitly. `inventory.qa.manage` effectively releases
stock, so keep the list short.

### 5. Enroll the exact manifest — immediately

Open Enroll shipment manifest. Choose the manufacturer manifest as CSV (in
Excel: File → Save As → CSV UTF-8; the workbook itself is refused with that
instruction). Enter the shipment reference and **900** expected packages, then
Review. The reconciliation shows:

- entries, distinct codes, codes found, ready to enroll, already enrolled;
- codes listed more than once, entries that are not tag codes, codes not in
  inventory;
- counts by SKU and by production batch, with batch codes **not** in the
  manifest (a batch partly outside the shipment is information, not an error);
- tags already promised to a customer or merchant order;
- customer units still waiting for a tag.

Matching codes only proves the codes exist; it does not prove each package is
physically unique. Inspection does that.

**Blocking exceptions:** wrong count, duplicates, malformed or unknown codes,
and any tag that is archived, not QR + NFC, without SKU, activated or
delivered, lost/disabled/replaced, already sent onward (shipped, sent to
reseller or merchant), inconsistently linked, or enrolled in another shipment.
Resolve them through the existing order and allocation controls; never alter
tag codes to fit the manifest.

**Allowed and kept:** a tag assigned to an unshipped customer order (Payment
Confirmed, Preparing, Ready to Ship) or allocated to an unshipped merchant
order. Enrollment leaves its order, owner, pet, allocation, lifecycle and
fulfilment exactly as they are and holds it: no shipping step will accept it
until it passes. Any such commitment, or customer units still waiting for
stock, requires the explicit acknowledgement before Enroll is enabled.

Enrollment is atomic and takes the same SKU lock as checkout. **A shipment
reference names exactly one manifest.** On enrollment the server records the
reference with the expected package count and a fingerprint (SHA-256) of the
distinct, normalized tag codes, computed by the server; it is never updated.

- The same membership again — retried, reordered, different letter case or
  spacing — changes nothing and writes no further audit entries, even after
  inspection has started.
- Any different membership or expected count under that reference is refused
  with a conflict: a shipment cannot grow from 900 to 901, lose a code or swap
  one. Use a new shipment reference for different packages. There is no
  amendment workflow in this release.
- A reference already carried by tags outside the manifest (for example a
  generated batch number) cannot name a new manifest.
- Concurrent enrollments of the same reference leave exactly one shipment.

Each enrolled tag gets an audit entry (with its commitment), plus one shipment
entry with the fingerprint. Verify Expected = 900 and Pending = 900 for the
shipment filter.

### 6. Pilot, then inspect

Inspect a pilot of about 20 packages (see hardware checks), then all of them.
Only Passed units are released. Export the shipment CSV and reconcile package
counts and trays against all 900 codes.

### 7. Lift the freeze

Restore the removed capability grants exactly, then reopen purchasing once the
released quantities cover existing commitments. Orders holding a still-held
tag stay blocked at Ready to Ship / Shipped until the tag passes or an admin
changes the assigned tag (the old tag returns to stock, still held).

### Rollback

Keep the additive columns and results. Pause affected sales and shipping
**before** returning to an older API, because its stock queries ignore QA. Do
not clear `QaStatus` or unenroll stock as a rollback shortcut.

## Mobile procedure

Use Chrome on an NFC-capable Android phone over HTTPS. Start the QR camera and
enable the NFC reader once; allow camera/NFC access and turn device NFC on.
Feature availability alone does not prove the phone has a working NFC antenna.

For each package:

1. Present the QR. It is decoded in the page; the link is never opened. Typing
   the printed code (Find tag) only opens the record — it is not QR proof.
2. Hold **the same package** to the back of the phone; keep other tags away.
   Only an actual Web NFC reading event with exactly one web link (URI) record
   is used. An NFC tap with no package open shows "Scan the package's QR code
   first".
3. For a good package press **Good condition: pass and next**. For an
   exception choose condition and decision, add remarks and save. Passed needs
   fresh matching QR and NFC readings and Good condition on the server; Failed
   and Needs Review need remarks.
4. Move the package to its tray. The form clears and the readers stay on.

Scanner behaviour that protects the 900-package run:

- **Just-finished package:** after a save (or Clear / next tag) the camera
  ignores that package's QR until it has seen a different code, so a package
  still drifting out of view never reopens itself. To inspect it again on
  purpose, use Find tag.
- **Another package's QR while one is open:** nothing is recorded. The screen
  asks: *Open MPL-B*, *Record as MPL-A's QR* (only when that QR is printed on
  the open package — it shows as a mismatch and can only be saved as an
  exception), or *Ignore*.
- A QR is read again only after it has really left the view (about one second
  of empty frames), not on a single missed frame.

Repeated codes show the previous result, inspector and time, and a repeat
inspection needs a reason. **A second package with the same printed code is
not a routine reinspection:** choose Needs Review and isolate both packages.
See Chip identity above: only the chip that first passed can pass that code
again, and no chip can pass for two codes.

A stale result returns 409: reload, review, read both again. Retrying a lost
save response with the same inspection id returns the stored result without
another audit row. Reader results expire after 30 minutes and are bound to
administrator, tag and QA version; a 2-minute allowance absorbs clock
differences between API instances.

## External USB NFC reader — deferred

The external PC/SC reader helper is **not part of this release**. Its sign-in
reused the administrator's full access token through the clipboard, and its
results had to be pasted from the PC into the phone screen; a PC cannot verify
the QR either, because desktop Chrome on Windows has no camera barcode decoding.
Bringing it back needs: a capture-only credential that cannot call any other
Admin API, a server-side handoff of the reader result to the open inspection,
and a reviewed adapter for the actual reader and chip. Until then the
inspection screen accepts camera and Web NFC readings only, and the server
refuses any other capture source. If Web NFC cannot read a package, record it
as Failed or Needs Review with a reason.

## Physical hardware checks before enrolling and inspecting

Automated tests do not establish hardware compatibility. On the actual
inspection phone and real packages:

1. Read 10 packages spread across boxes and batches with the inspection
   screen. All must show QR Verified and NFC Verified with the expected
   `https://mypetlink.com.my/q/…` and `/n/…` links and the same code as the
   printed label.
2. Confirm the chip encoding is a standard web link record: any "stores a …
   record instead" message means the supplier encoding differs — stop and
   decide before inspecting the rest.
3. Confirm the phone reports a chip ID: the NFC line must read "Verified ·
   chip 04…". If it says the phone reported no chip ID, **no package can pass**
   on that phone — stop and decide before inspecting.
4. Read two different packages and confirm their chip IDs differ.
5. Present a package QR while another package is open, and let a finished
   package drift back into view: the switch prompt and the "was just
   finished" hint must appear, and nothing may be recorded.
6. Deny camera permission once, turn device NFC off once, lock and unlock the
   phone mid-inspection: the screen must show a clear error and recover after
   Start QR camera / Enable NFC reader.
7. Tap an enrolled package with a normal phone (screen off the inspection
   page) only if you accept one public scan record; do not do this routinely.

## Security and operational limits

- `inventory.qa.manage` is sensitive; Inventory View alone cannot enroll,
  capture or save. Export keeps its own permission, is audited, and escapes
  spreadsheet formula prefixes. CSV rows always end in CRLF.
- Reader results are operator reports sealed by the server, **not hardware
  attestation**: an authorized administrator can submit a crafted capture
  request. Keep the inspector list short, review the audit history and
  reconcile physical counts.
- Data Protection seals reader results. Azure App Service shares the key ring
  across instances of one app; a slot swap or new host invalidates open
  results, which only forces a re-read and never releases a tag.
- A normal phone camera or NFC launch opens the public page and records an
  ordinary finder scan; use only the in-page readers. Owners never see
  pre-activation scans.
- No offline or local fallback: a failed save keeps the inspection open, and
  the package must not move to the passed tray.

## Acceptance checks before release

- Real camera QR and Web NFC on the target phone; permissions denied, NFC off,
  background/foreground, camera teardown.
- Wrong host, `/t/` link, swapped routes, query/fragment, unknown tag, empty /
  text / absolute-URI / multiple-link chips, unreadable chip, mismatched
  package.
- Good package passes once; retry saves once; reinspection needs a reason;
  duplicate code with a different chip is held; repeated reads create no
  TagScans; the just-finished package is ignored; switch prompt appears.
- Two inspectors on one tag: one save wins, the other gets 409.
- A result downgraded after assignment blocks retail and merchant shipping,
  and the assigned tag can be changed to a passed tag.
- Held stock cannot be bought, assigned, claimed, transferred, allocated,
  quoted, sent onward or activated.
- Manifest with duplicates, unknown codes, shipped tags and existing orders;
  acknowledgement required; idempotent repeat; status totals and CSV.
- Historical tags outside the cohort behave as before.

Primary platform references: [Chrome Web NFC](https://developer.chrome.com/docs/capabilities/nfc)
and [BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector).
