# Merchant Partner Directory — independent QA fixes (2026-10-15)

Working root: `C:\Project\MyPetLink`. Current code was inspected before changes.
No production/valuable development data, deployment settings or existing export
was changed. Tests use uniquely named disposable SQL databases or fresh InMemory
records; browser fixtures intercept HTTP and only admit loopback origins.

## Root causes and fixes

| Issue | Verified cause and resulting fix |
| --- | --- |
| P0 API routes | `apiRequest` concatenates the configured origin and supplied path. The directory service omitted `/api/v1`. All six request forms now use the existing versioned convention; the global client is unchanged. Request tests check URLs, methods, encoding, auth and no-store. A C# test hosts real controllers/capability authorization on loopback Kestrel and invokes the actual TypeScript service/client over HTTP for Admin read/update, branch create/update, public list/search/direct and withdrawal. |
| P0 Vitest collection | Vitest's default discovery collected Node `node:test` scripts. Only `scripts/**/*.test.mjs` is excluded, retaining normal source/edge/function tests and Vitest defaults. Node release tests remain on their dedicated runner; browser tests also have a dedicated runner. No suite or legitimate failing test was suppressed. |
| P1 browser Back | The old component listener registered after Next had initialized its history listener; React teardown could erase the dirty signal before the guard ran. The defect was reproduced in Edge against an actual Next page. A small root `beforeInteractive` bridge owns traversal interception outside React. History indexes undo/replay actual traversal, preserving Forward entries. Dirty signals commit synchronously; unmount cleanup no longer clears them. The workspace owns unload consent, so explicit discard does not trigger another warning. Tests exercise native Back/Forward, merchant and branch drafts, merchant switching, Next links, discard and real reload. |
| P1 reactivation | `SetMerchantActiveAsync` retained `ShowOnWebsite`; changing `IsActive` back to true re-exposed selected branches. Both actual status transitions now clear the parent public switch and audit withdrawal atomically. Reactivation works without publication permission. Branch preferences, code and permission history remain; republication requires the existing evidence/scope validation. Admin confirmation and feedback explain this separation. |
| L1 private-name search | Search previously matched legal and trading names although only one was displayed. It now matches exactly `(TradingName ?? LegalBusinessName)`, the public display name. A private registered name cannot reveal a trading-name listing through results/counts. |
| L2 list 404 | The error renderer treated every 404 as a withdrawn store. That message is now specific to a direct store request; a list 404 displays a load failure and retry. |
| L3 refresh stability | Reload participated in the content key and refresh cleared the result. Query identity and refresh revision are separate. Cards remain during background refresh; success replaces results and withdrawal clears them. Failed/pending refreshes cannot retain results beyond a 60-second freshness lease. Search/page changes still show the appropriate loading state. |
| L4 profile coverage | CI previously built only all-OFF. It now verifies isolated all-OFF, checkout ON/Community OFF, and checkout ON/Community ON profiles, with the existing four explicit flags and artifact/SEO checks. Browser checks run against each generated export. These are validation selections, not deployment-setting changes. The API job installs existing workspace tools for its cross-stack routing test. |
| L5 Maps traversal | No redirect-path bypass was confirmed for literal or encoded dot traversal. .NET URI canonicalization moves those examples out of `/maps` before the existing allowlist check, which rejects them. Added regression cases for `../`, `%2e%2e/` and `.%2e/`. No speculative vulnerability claim or broader provider-path change was made. Destination correctness remains manual QA. |
| L6 terminology | Navigation already shows Partner Stores with checkout OFF. The landing eyebrow, heading and metadata now use partner-store terminology while retaining Smart Tag/Malaysia search intent and the existing canonical URL. No merchant rows enter static HTML/sitemap. |

No additional database migration, table, dependency or feature was introduced.

## Changed files in this QA follow-up

Paths below are relative to `C:\Project\MyPetLink` and identify files touched by
this task, including feature files already uncommitted before this task.

```text
.github/workflows/ci.yml
apps/api/MyPetLink.Api/Services/MerchantDirectoryService.cs
apps/api/MyPetLink.Api/Services/MerchantSalesService.cs
apps/api/MyPetLink.Api.Tests/MerchantDirectoryHttpTests.cs
apps/api/MyPetLink.Api.Tests/MerchantDirectoryTests.cs
apps/api/MyPetLink.Api.Tests/MerchantSalesServiceTests.cs
apps/web/package.json
apps/web/vitest.config.ts
apps/web/scripts/merchant-directory.browser.test.mjs
apps/web/src/app/layout.tsx
apps/web/src/app/where-to-buy/page.tsx
apps/web/src/lib/merchantDraftNavigation.ts
apps/web/src/services/merchantDirectoryService.ts
apps/web/src/services/merchantDirectoryService.test.ts
apps/web/src/services/merchantDirectoryService.routing.test.ts
apps/web/src/components/admin/merchantSales/useMerchantDraftGuard.ts
apps/web/src/components/admin/merchantSales/MerchantListingPanel.tsx
apps/web/src/components/admin/merchantSales/MerchantsPanel.tsx
apps/web/src/components/admin/merchantSales/merchantsPanel.test.tsx
apps/web/src/components/marketing/PartnerStoresDirectory.tsx
apps/web/src/components/marketing/PartnerStoresDirectory.test.tsx
docs/architecture/merchant-partner-directory.md
docs/deployment/merchant-partner-directory-rollout.md
docs/deployment/merchant-partner-directory-qa-2026-10-15.md
```

## Verification from this task

Repeated/focused runs overlap; counts must not be added together. Previous
2026-10-13 results are historical and are not claimed as this task's checks.

| Check | Result |
| --- | --- |
| Directory/API HTTP/real Kestrel routing, consent/status, SQL concurrency/migrations, Merchant Sales/allocation/fulfilment/shipping/activation and capability coverage | 238 passed, 0 failed, 0 skipped |
| Real TypeScript service-to-Kestrel smoke cases | 3 passed inside the API test above; separately skip during ordinary web-only runs |
| Focused Admin/directory/service/navigation/SEO/release-rule Vitest suites | 509 passed across 32 suites, 0 failed |
| Playwright-core against actual Next development page | 5 passed, 0 failed |
| Browser cases against all-OFF, checkout ON/Community OFF, and fully ON static exports | 5 passed per profile, 0 failed/0 skipped; same five scenarios repeated |
| Standalone release-profile Node runner | 15 passed, 0 failed, 0 skipped |
| Final complete `npm run test:web` | 4,273 passed, 2 failed, 7 skipped; 367 suites passed, 2 failed, 1 skipped (370 total) |
| Separate affected unrelated-suite diagnostic run | 82 passed, 1 failed across 4 suites; TagProductPickerDialog failed; PetProfileForm, PetMomentsManager editor and MomentReplies passed |
| Typecheck and full ESLint | Passed |
| Explicit-flag isolated builds/artifact and SEO checks | All three profiles passed, 160 pages each. OFF and retail: 11 sitemap URLs / 105 noindex pages; fully ON: 12 / 104 |
| EF model/script consistency and existing export checksum | No pending model changes; root SQL matches regenerated EF output; original export SHA256 unchanged |

The complete web runs reproduced a stable TagProductPickerDialog assertion
failure: `queryByText("-")` matches multiple legitimate elements (line 115).
Earlier full runs also reproduced PetProfileForm creation focus timing (line 85)
and PetMomentsManager editor deep-link timing; these passed on focused rerun.
The final full run failed TagProductPickerDialog and PetProfileForm; the earlier
full run also failed PetMomentsManager. MomentReplies passed in full and focused checks. Those modules/tests were not
modified or excluded. Full-suite failures therefore still prevent a green CI.

Four pre-existing skipped application cases remain; the three additional
web-only skips are integration cases actually executed through the API smoke.
Existing API compiler warnings (CS1998/EF1002), Node type-stripping/module
warnings and the sample Share Profile's 93-character SEO warning remain.
One fully-ON export attempt hit a transient Windows `EBUSY` while copying a
generated RSC file inside the isolated workspace. A complete retry succeeded,
followed by artifact, SEO and browser checks. No production export was involved.

The unchanged original `apps/web/out/index.html` SHA256 is
`34A3D59C258B3E5BCAFBD57932B3C379082386162D7A1FBA0E7A815297FDE907`.

Browser checks use installed headless Edge/Chromium, real Next routing and
controlled HTTP fixtures. They do not claim actual permission verification or
live backend data coverage; that boundary is covered by the separate Kestrel
smoke and SQL tests. Native reload cancellation is exercised. CDP can force-close
tabs without presenting a native dialog, so the final browser case checks unload
guard registration; actual tab closing, Firefox/Safari and device navigation
remain manual QA. Hosted CI itself was not run (no commit/push).

## Updated staging gates

- Resolve the unrelated red Vitest/CI baseline before a normal staging release.
- Confirm browser requests use `/api/v1` for both public and authenticated Admin
  routes; verify owner/read-only/disabled Admin mutation rejection.
- Test merchant description, commercial edit and branch drafts with Back,
  Forward, links, merchant switching, reload, tab closing and two sessions.
  Keep editing must retain input; discard must be explicit and prompt only once.
- Deactivate/reactivate a published merchant. Sales access must resume while
  parent publication stays OFF; branches and historical evidence remain. Publish
  separately with current evidence and check anonymous list/search/direct reads.
- Search the private registered name of a shop with a different trading name:
  it must not match or affect counts. Search the public name/location normally.
- Leave the public directory open during withdrawal and a simulated outage.
  Cards should stay stable during normal refresh, update on success, clear on a
  confirmed 404, and expire after 60 seconds when a refresh cannot validate them.
- Check Maps/Waze destinations on iOS/Android; confirm safe external navigation.
- Select the approved release profile explicitly, review actual artifacts and
  verify staging noindex, canonical metadata, sitemap and edge no-store behavior.
- Use the existing backup/reviewed additive migration procedure, API-before-web
  deployment order and application rollback retaining schema/history. No new
  migration is required for these fixes.

**Recommendation:** NO-GO for the normal staging pipeline while the full web
suite is red. Directory-specific changes pass focused checks and isolated QA;
they can proceed through approved staging once the unrelated CI baseline is
resolved. Production rollout/flags/migration/deployment approval remains a
separate gate. Nothing was committed, pushed, migrated in production or deployed.

## Independent verification and full-suite fixes (2026-10-15, follow-up)

C1–L6 were retested against the real local API (disposable database) and
isolated static exports in headless Edge, without request rewriting. All
directory fixes behave as described above. L5 remains informational: an
encoded `..%2f` segment is still accepted under `/maps/`; it is not a redirect.

The remaining web-suite failures were investigated against the committed
baseline (`b4de337`) with repeated runs, not by exclusion:

| Test | Root cause | Fix |
| --- | --- | --- |
| TagProductPickerDialog (deterministic) | Product defect from `b4de337`: the new material line bypassed the existing customer-placeholder rule, so a catalogue material of `-` reached customers. | `isCustomerPlaceholder` moved to `src/lib/tagPhysicalSpecs.ts` and applied to material; regression test in `tagPhysicalSpecs.test.ts`. |
| PetMomentsManager editor (intermittent, also on baseline) | `editorRef` was re-synced in a passive effect. A commit rendered from an older snapshot (the initial list load) could write `null` back after an editor opened; the deep-link effect then reopened it as a new instance and orphaned the save in flight. | `editorRef` is owned by `showEditor`/`clearEditor`, the only `setEditor` callers. |
| PetMomentsManager discard waits, MomentReplies delete (intermittent) | Test timing: the closed confirmation restores `aria-hidden` in its unmount effect, so role queries briefly treated the editor as closed or the page button as missing. | Wait for actual removal (`hidden: true`) / `findByRole`. Assertions unchanged. |
| PetProfileForm creation (intermittent, also on baseline) | Test timing: focus moves in the success view's mount effect, after the heading can first be found. | `waitFor` the same focus assertion. |
| Directory routing smoke (API suite, under load) | Real HTTP to a fresh Kestrel host exceeded Vitest's 5 s default. | 30 s timeout for those three smoke cases only. |

Results after the fixes: complete web suite 4,276 passed / 0 failed / 7 skipped
(twice); the four previously flaky suites 40/40 clean (baseline: 4 of 16 runs
failed); API 2,737 passed in the full run with 4 LocalDB database-creation
contention errors that pass serially (45/45); merchant/directory API regression
266/266 three times; isolated OFF, retail, fully-ON and preview exports pass
release/SEO verification and the browser suite (5/5 each).

**Updated recommendation:** the red-suite condition above is resolved, so
this work can go to approved staging QA. Staging, device, edge no-store and
release-profile checks, migration review and deployment approval remain
separate gates. Nothing was committed, pushed, migrated or deployed.
