# Smart Tags management redesign

Implemented locally on 16 October 2026. Nothing staged, committed, pushed, or deployed. Unrelated working-tree changes were preserved.

## Existing implementation and findings

- `TagManagementPanel` serves the owner `/tags` page, per-pet tag pages, the pet management Smart Tag tab, and runtime route fallback. Changes to its cards are shared by those existing surfaces; the global portal shell was not changed.
- Every card previously rendered physical QR tools, commerce rows, NFC controls, activity panels, Premium messaging, and lifecycle buttons together. At 390px, the three fixture cards measured 1,064–1,274px each. At desktop width they were 968px each.
- The apparent **More** category was the shared responsive tab overflow menu. Actual filters were Active, Pending, Lost / Disabled, Archived, and All. The inactive group also included replaced tags and tags on inactive pets. It is now labelled **Inactive**, with unchanged membership and all filters retained in the shared menu.
- The existing archive explanation already said **inactive**, rather than the “stay active” wording in the request. It now appears only in the archived view and relevant details. Archive is a separate marker; restore clears it, preserves prior status, and converts the legacy `Archived` status to `Disabled`. UI copy does not promise every restored tag remains disabled.
- Owner tag endpoints resolve ownership from the authenticated actor. No controller, authentication, service contract, shared type, migration, or database table was changed. Existing `PetListItem`, `PetTag`, `TagOrder`, and scan-history responses remain authoritative.
- Existing lifecycle restrictions and confirmation dialogs were retained. A small UI defect was corrected: tags on inactive pets previously inherited a Disable action even when their stored status was already Disabled. The card now permits disabling only stored Active tags, matching the existing server restriction.

## Before and after

| Area | Before | After |
| --- | --- | --- |
| Card summary | Several nested information panels and all controls | Pet, status, code, product/variant, scan information, primary action, disclosure |
| Details | Always visible | Independent **Manage Tag & Details** disclosure, collapsed initially |
| Expansion state | Not applicable | Retained by tag identity across filters and lifecycle updates while mounted |
| Primary active-tag action | Physical tag scan page | Actual pet-level **View Safety Profile**, opened in a separate tab |
| Unavailable Safety Profile | No dedicated summary action | **Manage Safety Profile** when the linked profile is switched off; no invalid public preview |
| Pending order | Mixed into the full action grid | Applicable order/payment action remains visible; physical tools stay in details |
| Inactive/archived tags | Full control grid | No Safety Profile preview; appropriate controls remain in details |
| QR/NFC | Large separate blocks | Grouped tools, preserving distinct physical URLs, QR display/download, and NFC capability |
| Premium unavailable | Per-card disabled button and promotion | Small coming-soon message inside expanded activity |
| Eligible history | Plan-gated dialog | Same entitlement, dialog, filters, and pagination, fetched only on request |
| Toolbar | Two panels and repeated explanation | Combined pet/order/filter panel, shorter page introduction |
| Physical tag lost | Easily confused with pet Lost Mode | Clear explanation in details and existing confirmation dialog |

Expanded sections contain Tag Information, QR & NFC, Tag activity, and supported Tag Management actions. Purchase and delivery dates still appear only for a matching owner order. QR-only legacy products remain readable without NFC actions. No new product, subscription, or dependency was introduced.

## Scan activity integrity

The existing server behavior was inspected and preserved:

1. Physical tag visits record separate QR, NFC, or legacy source values.
2. Pre-activation visits, including the initial activation entry, remain in the internal audit history but are excluded from owner history and counts by `OwnerVisibleScans` (`ScanTime >= ActivatedAt`). An unactivated tag has no owner-visible activity.
3. The owner projection suppresses last-scanned timestamps older than the current activation. Existing activity counters and source attribution remain unchanged.
4. The old primary physical scan-page link recorded a visit. The new primary action uses `getQrSafetyPath(linkedPet)` and the existing public Safety Profile read; it does not call the physical tag resolver or create scan activity.
5. Loading cards, expanding, filtering, copying, and displaying the QR image do not resolve physical tags. Browser checks verified zero physical scan requests or unexpected write requests during those interactions and a Lost Mode Safety Profile preview.
6. Explicit **View Tag Scan Page**, **Open NFC Link**, and the QR dialog's physical open action retain existing public-route behavior. Deliberately opening those physical links still records a visit. Expanded copy explains this. No owner-supplied query switch or unauthenticated tracking bypass was added.

## Validation

| Check | Result |
| --- | --- |
| Web component/helper/route regression tests | 214 passed across 15 suites |
| API scan-source, activation-time filtering, entitlement, and ownership regression tests | 26 passed, 0 skipped |
| TypeScript app and Pages Functions checks | Passed |
| Full web lint | Passed |
| Production static export | Passed |
| Four explicit release flags, Community verification, SEO verification | Passed |
| Browser widths | 320, 375, 390, 430, 768, 1440px passed |
| Summary cards | 327px on phones; 335px at tablet/desktop widths |
| Mobile height reduction at 390px | About 69–74% using the same fixtures |
| Layout and accessibility | No horizontal overflow or overlapping actions; 44px+ touch targets; keyboard disclosure, dialog Escape, and focus restoration checked |
| Long content | Long pet name and extended legacy tag code checked at 320px |
| Lifecycle interactions | Confirmation/cancellation, lost-tag update, inactive/archived restrictions, replacement links, and restoration covered |
| Plan behavior | Free coming-soon message and existing eligible-account history dialog both checked |
| Console page errors | None in browser scenarios |
| Diff whitespace | Passed |

The production build used a loopback API address and all four release flags explicitly enabled. Browser validation ran against that local export with intercepted test responses; no live owner records, scans, or notifications were changed. API regression tests used their existing automated test setup. Existing non-blocking Node warnings, the thin-content SEO warning for the Topu Share Profile, and unrelated API test compiler warnings remain.

## Files changed

- `apps/web/src/components/portal/TagManagementPanel.tsx`
- `apps/web/src/app/tags/page.tsx`
- `apps/web/src/components/portal/TagManagementPanel.disclosure.test.tsx` (new)
- `apps/web/src/components/portal/TagManagementPanel.acquisition.test.tsx`
- `apps/web/src/components/portal/TagManagementPanel.scanHistory.test.tsx`
- `apps/web/docs/OWNER_PORTAL_FLOW.md`

Local QA outputs include `artifacts/smart-tags-management-browser.mjs`, `smart-tags-management-{before,after}.json`, logs named `smart-tags-management-*.log`, and the screenshots folder. These outputs were not staged.

## Screenshots

- [Before, phone](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/before-390.png)
- [After, phone](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/after-390.png)
- [Expanded, phone](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/expanded-390.png)
- [Before, desktop](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/before-1440.png)
- [After, desktop](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/after-1440.png)
- [Expanded, desktop](C:/Project/MyPetLink/artifacts/smart-tags-management-screenshots/expanded-1440.png)

Screenshots preserve viewport width and use a taller capture surface to keep fixed portal navigation from covering the card details. Interaction and overflow checks run at the normal 900px viewport height.

## Separate follow-up considerations

No blocking implementation issue remains. Explicit physical-link visits still count regardless of who opens the anonymous link; this existing behavior is retained, while the new primary preview avoids it. Excluding authenticated owners from every physical-route visit would need a separately designed server-side attribution rule rather than a frontend flag. Existing unrelated build warnings were not changed as part of this UX task.
