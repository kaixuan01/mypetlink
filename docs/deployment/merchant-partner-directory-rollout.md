# Merchant partner directory rollout

Architecture and endpoint reference:
[`../architecture/merchant-partner-directory.md`](../architecture/merchant-partner-directory.md).

## Current QA status (2026-10-15)

Independent QA defects have been addressed with actual client-to-Kestrel routing
and real-browser navigation coverage. Full web tests still report unrelated
failures; do not treat the historical focused results below as a green CI run.
The defect report, exact changed files, current check counts and staging gates
are in [merchant-partner-directory-qa-2026-10-15.md](merchant-partner-directory-qa-2026-10-15.md).

## Historical follow-up verification (2026-10-13)

Verified on 2026-10-13. Tests use InMemory or uniquely named disposable SQL
Server test databases; production data and the existing development database
are not changed.

| Check | Result |
| --- | --- |
| Final directory/service/HTTP/SQL Server tests, merchant sales/allocation/fulfilment/shipped activation and capability coverage | 232 passed, 0 failed, 0 skipped |
| Final permission-scope tests after the branch relocation safeguard | 38 passed, 0 failed |
| Merchant Admin web suites, directory, navigation, commerce and SEO route rules | 499 passed across 31 suites, 0 failed |
| Directory and SEO suites repeated with checkout/Community ON | 146 passed across 6 suites, 0 failed; overlaps the broader web run |
| Release-selection and exported-artifact tooling | 15 passed, 0 failed |
| Web typecheck (app and Pages Functions) | Passed |
| Full web lint | Passed |
| Isolated production-profile static builds, all four OFF and all four ON | Passed; 160 pages each; ON is validation only |
| Isolated preview build, all four OFF plus explicit noindex | Passed; 160 pages; preview robots policy verified |
| SEO output verification | OFF: 11 sitemap URLs / 105 noindex pages; ON: 12 / 104 |
| EF model and regenerated idempotent SQL script | No pending model change; root migration.sql matches regenerated output |
| Working-tree whitespace check | Passed |

These are follow-up checks executed for this task, not the initial implementation's
120/57 API and 417 web results. Repeated and focused runs overlap and must not be
added together. Validation exports live in a temporary isolated workspace; the
existing repository export is retained. All-ON checks validate the tooling and
do not authorize enabling any feature in production. Production settings and
secrets were not changed.

The follow-up requires private permission evidence and agreed branch scope (also
renewed on a selected active branch's relocation or rename),
preserves independent drafts across saves/refreshes, confirms effective branch
republication, separates directory SEO from checkout, and makes release flag
selection and artifact verification explicit. It adds no database migration,
consent table, Merchant Portal or commercial feature.

No requested check was unavailable. No failure remains in the focused suites.
The entire repository test suite was not run. Two existing API test compiler
warnings remain in `ReservedHandleAssignmentTests` (async without await) and
`SocialScaleRelationalTests` (interpolated SQL). The existing sample Share
Profile SEO warning remains: its initial HTML has only 93 text characters.
These files and the sample's indexing policy are outside this feature.
Node's experimental type-stripping/module-detection warnings also remain in
release tooling on 22.13.1; builds and artifact verification pass. The declared
minimum is now 22.6, matching that built-in capability; no package was added.

- API unit/service tests: visibility combinations, new defaults, additive
  migration defaults, one-to-many branches, isolated branch hiding, safe limits,
  public search/projection privacy, parent-scoped edits, validation, audit and
  unchanged commercial quotation/order conversion.
- HTTP tests: anonymous 401; owner/read-only/disabled admin 403; authorized
  listing save; public safe envelopes, no-store headers and withdrawn-link 404.
- SQL Server tests: actual SQL public projection, native merchant/branch
  rowversion conflicts, stale parent scope rejection, additive migration over an
  existing merchant, and full root-script execution/replay preserving publication
  settings and audit history. Allocation, shipping and owner activation succeed
  after branch withdrawal/disablement.
- Existing merchant allocation/fulfilment tests run against disposable SQL
  Server databases to check tag operations remain compatible.
- Web tests: private evidence/scope, publishing/reactivation confirmation, default-hidden branch forms, disabling,
  read-only controls, field/stale-edit errors, branch grouping/navigation,
  location search, pagination, stale-content removal, empty/error/retry states,
  independent merchant/branch drafts, parent refresh, reload/editor switch,
  workspace navigation/browser Back, stale tokens, existing merchant screens
  and both navigation/release flag configurations.
- Web typecheck, full lint, static production build and SEO output verification.

## Manual QA checklist

Use staging with a test merchant and an administrator who has `sales.manage`.

- [ ] Create a merchant through existing Merchant Management. Confirm it is
  active for sales and hidden in the directory by default.
- [ ] Open merchant detail and add two branches. Confirm each starts hidden.
  Enter different addresses, contacts and hours; reload to verify persistence.
- [ ] Enable one branch while the parent is hidden. Confirm the directory,
  public search and direct public read return no merchant.
- [ ] Enable parent visibility with a source and private permission reference,
  confirm every selected branch (including inactive ones), confirm the dialog and check
  only the selected active branch appears. Open the preview in a new tab.
- [ ] Publish the second branch, then hide the first. Confirm only the second
  remains and it is still grouped under the same merchant.
- [ ] Disable a published branch, then re-enable it. Confirm publication requires
  a new permission reference and explicit availability confirmation, and its record and
  public preference were retained. Inactivate/reactivate the merchant through
  its existing workflow: parent publication must remain OFF, branch preferences
  must remain selected, and current evidence is required to publish again.
- [ ] Hide the parent. Confirm branch settings remain selected internally,
  public list/search exclude the merchant, direct read returns 404, and an
  already-open directory removes it on its next successful refresh (every 30
  seconds/on focus). Retained results during an outage expire within 60 seconds
  of the last successful read, including a still-pending request.
- [ ] Edit listing/branch in two sessions. Confirm older merchant/branch/parent
  tokens are rejected; input remains until explicit discard/reload. Edit a branch
  while another session confirms merchant publication; the stale scope must fail.
- [ ] Type merchant description/visibility/evidence, save a branch, and verify
  all merchant drafts remain. Type a branch draft, save merchant settings, then
  refresh/filter the parent list; the editor and feedback must remain.
- [ ] Switch merchant/branch, close, reload, use a navigation link, Back/Forward
  and browser reload with a dirty draft. Keep editing must retain input; discard
  must be explicit. Saving an unchanged private branch should not ask about public
  availability. Browser crash recovery is not provided.
- [ ] Move/rename a selected active branch under an enabled parent. New permission
  evidence must cover the changed location; changing only hours/order should not
  require it. A hidden merchant can prepare branches without permission evidence.
- [ ] Try JavaScript, HTTP, lookalike and unrelated map URLs; incomplete/out of
  range coordinates; blank address/name and invalid contacts. Confirm clear
  field errors and no invalid records are saved.
- [ ] Check Maps-only, Waze-only, coordinate-only and no-navigation branches.
  Test actual destinations on iOS/Android with and without the provider apps.
  Confirm navigation opens separately and no verification claim appears.
- [ ] At phone/tablet/desktop widths, verify forms, long text, cards, pagination
  and provider buttons remain usable with keyboard and touch.
- [ ] As a read-only admin and an owner, attempt mutation requests directly.
  Confirm authorization refuses them even when bypassing the page controls.
- [ ] Inspect public responses: no internal IDs, notes, billing addresses,
  account contacts, sales staff or tax/registration information.
- [ ] Create/convert a quotation and exercise allocation, shipment and tag
  activation for a hidden merchant. Confirm sales behavior remains unchanged.
- [ ] Inspect authorized activity history for permission source/reference and
  branch scope, actor, UTC time and both sides. Hide with a withdrawal reason and
  verify original evidence remains. Public responses/HTML must omit all evidence.
- [ ] Confirm static HTML, sitemap and page metadata contain no merchant rows
  or individual branch links, and the directory works when online ordering is off.
- [ ] Verify the approved release profile in the actual deployed export, and
  confirm staging uses its independent noindex safeguard. Review any legacy
  published records lacking evidence before a production rollout.

## Explicit release builds

The four existing release selections are `NEXT_PUBLIC_SMART_TAGS_ENABLED`,
`NEXT_PUBLIC_TAG_ORDERS_ENABLED`, `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED`, and
`NEXT_PUBLIC_SOCIAL_ENABLED`. All ordinary/release build scripts require each
as `true` or `false` in the shell or command before Next reads dotenv files.
Missing/invalid/inconsistent selections stop before the build. Existing Social
ON/OFF aliases set only Community and require the other three shell values.

Safe validation example from `apps/web` (Node 22.6+; verified on 22.13.1):

```powershell
node --experimental-strip-types scripts/build-release.mjs --smart-tags=false --tag-orders=false --ordering=false --community=false
```

For `npm run build` / root `npm run build:web-release`, set all four explicitly
in the shell; this avoids npm argument forwarding differences. The example
values are a validation profile, not a production setting recommendation.
The normal app/API URLs and owner Safety Profile build setting are also needed.

The build verifies exported flag metadata against actual rendered tag/order/
checkout gates, runs the existing Community verifier and audits production SEO.
`NEXT_PUBLIC_NOINDEX=true` remains an independent preview safeguard: the build
verifies homepage/directory noindex and skips the production-only sitemap audit.
Run that full audit on the intended production-profile export before release.
Artifact checks do not replace mobile/device QA or approval of the release profile.

Manual device/browser QA remains a staging release step; automated checks do
not verify that a merchant supplied the correct real-world destination.

## Deployment steps — approval required before execution

1. Review the additive migration and the appended section of root
   `migration.sql`, take the normal database backup, and test the script in
   staging. Do not use `database/migration.sql`.
2. Apply the reviewed SQL Server migration through the existing approved
   deployment process. Confirm all pre-existing `ShowOnWebsite` values are
   false, no branches were invented, and merchant/commercial records are intact.
3. Release the API containing the new service/controller before the web build.
   An API deployed against the old schema cannot read directory columns.
4. Build/release the web app using the normal API URL and explicit release
   flags. No new deployment settings, keys, paid services or dependencies are
   needed. Do not infer or change Smart Tag ordering flags for this feature.
5. Check anonymous reads initially return an empty collection. Confirm the
   production edge respects the browser/CDN no-store response headers and does
   not override them with a cache-everything rule for `/api/v1/public/partner-stores*`.
6. Keep all merchants hidden until agreement is recorded privately in activity history. An
   authorized admin adds physical branches and opts in only the agreed locations.
   Review public data before publishing and complete the manual checks above.

## Rollback and risks

- First hide the affected merchant through the listing control if consent is
  withdrawn or public data needs correction. This does not disable sales.
- Application rollback can retain the additive database schema. The previous
  API/web ignore the new fields. Retain branch rows, audit history and consent
  settings; do not run the migration Down path as routine rollback because it
  drops the new branch table and description/consent fields.
- Existing records are deliberately not auto-published or automatically turned
  into physical branches from billing addresses. An empty directory after
  deployment is expected until administrators publish agreed locations.
- Listing saves and every branch save advance the parent rowversion. Commercial editors
  holding an old merchant token must reload before saving; this prevents
  overwriting another admin's change.
- No tag-stock claim is made. Store hours and actual navigation destinations
  require merchant/admin verification. External apps decide how to handle their
  HTTPS navigation links on each device.
- Public API reads reflect changes immediately, but content already delivered
  can remain in an open visible tab until its next refresh (up to 30 seconds).
- The generic directory is indexable with checkout ON or OFF; staging noindex
  remains independent. Individual store SEO pages are deferred to avoid stale
  static merchant content.

## Readiness and remaining risks

Current staging pipeline: NO-GO while the full web suite is red. Directory-specific
checks pass and isolated QA is possible, but unrelated failures need resolution
before a normal staging release; see the current report linked above.
Production deployment: NO-GO until staging/device/edge-cache QA, permission review,
the approved release profile, database backup/migration review and explicit
deployment approval are complete. No production deployment is authorized here.

Permission references are admin attestations, not independently verified signed
documents. Existing audit actor/time supplies when permission was recorded;
admins can include the agreement date in the reference. Attachments, dedicated
consent UI, browser crash draft recovery and push invalidation are deferred.

No commit, push, production migration or deployment is performed as part of
implementation. Existing unrelated working-tree edits are preserved.
