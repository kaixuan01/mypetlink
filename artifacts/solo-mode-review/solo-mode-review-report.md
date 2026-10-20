# Independent review: Solo Operator Mode (consignment)

Date: 18 October 2026 · Scope: final uncommitted source at `C:\Project\MyPetLink` · Read-only review and testing

## Method and constraints

- No application source was modified, and nothing was staged, committed, pushed or deployed. Production was not touched.
- All data was synthetic and labelled. Disposable databases used:
  - fixture `MyPetLinkTest_*` databases;
  - `MyPetLinkQA_Solo_E2E`, built from the root `migration.sql` and dropped afterwards.
- `.claude/launch.json` was temporarily extended and then restored byte-for-byte (SHA-256 `cb74ac9a…`). Dev tokens were deleted.
- Codex's counts were not reused.

**Evidence in this folder:**
- `api-full-suite.trx/.log`
- `solo-probes.log`, `solo-probe-s05.log`, plus the probe source `SoloReviewProbes.cs`
- `isolated-b2b-solo-tests.trx/.log`
- `ef-script.log`
- `e2e-db-migration*.log`
- `web-*.log`

## 1. Verification matrix

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1.1 | Founder enables Solo | **PASS** (browser) | The policy card shows Team and no founder by default. The founder picked Solo, named themselves, gave a reason and confirmed a warning ("removes independent internal review for the named founder only… does not prove partner acceptance or authorize stock release, payments or financial postings"). Result: Solo, with QA Synthetic Founder as the authorized self-reviewer. |
| 1.2 | Create and self-approve an agreement | **PASS** (browser + SQL) | The approval dialog shows the full term summary. Without the Solo confirmation ticked, it returns 400. With confirmation, a reason and the version's signed-acceptance reference, the agreement becomes Active with a visible "Self-reviewed (Solo)" badge. Evidence that isn't the signed acceptance returns 400 (S02). |
| 1.3–1.4 | Reserve and dispatch | **PASS** (browser) | Branch-validated reservation of 4 units, then dispatch. |
| 1.5–1.6 | Partner-signed receipt; partial good/damaged/missing | **PASS** (browser + S02) | Per-unit findings (2 good, 1 damaged, 1 missing) were recorded with a signed partner receipt reference and self-review. The good units became Received; the damaged and missing units were held under review. Without the attestation: 400. With attestation evidence that differs from the receipt evidence: 400. |
| 1.7 | Discrepancy self-review | **PASS** (S02) | Reusing earlier receipt evidence: 400. New evidence: accepted. "Still missing" can't be passed off as a resolution (409). The missing unit can't be handed over (409). |
| 1.8 | Returns, QA, write-off | **PASS** (S02) | The return was inspected with the real `PhysicalQaService` (QR and NFC matched through simulated reader input) and saved as Failed. Write-off set the unit to WrittenOff and disabled the tag; it remains held. *Observation:* write-off is allowed before the receiving review (see section 2). |
| 1.9 | Reconciliation and review-log export | **PASS** (HTTP) | The review-log CSV has 16 columns, including review mode, actor, reason, external evidence, policy version and "Self-review confirmed". It separated policy changes from self-reviews. The manifest CSV has "Agreement review mode" and "Receiving review modes" columns. |
| 2.1 | Team is the default and fails closed | **PASS** | The migration seeds Team with no founder (seen on both the E2E database and a migrated probe database). With the policy row missing, self-review returns 403 (S01). |
| 2.2 | Requires current nominated founder plus capability | **PASS** | Nominating someone without `self_review` returns 400. Revoking the capability gives 403 on the next request. Changing the founder makes the old founder get 403. Deactivating the founder's account gives 403 (S03). |
| 2.3 | Unrelated Super Admin can't self-review | **PASS** | Both in the service (S03) and over real HTTP with a separate Super Admin identity, self-approving their own draft in Solo returns 403. |
| 2.4 | Nomination grants nothing else | **PASS** (HTTP) | A nominated founder with dispatch and reconcile removed gets 403 on dispatch and receive. A nominee without `self_review` is refused at nomination. |
| 2.5 | Solo → Team restores maker/checker immediately | **PASS** | S03: founder self-approval returns 403 right after the switch; an independent B approval records "Independent (Team)". HTTP: founder self-resolution returns 403 right after switching to Team. |
| 2.6 | Revocation and founder change on next request | **PASS** | S03 (capability, nominee, account). |
| 2.7 | Concurrent policy change vs approval | **PASS** | S04: a race between "switch to Team" and the founder's self-approval resolved to Team with the approval refused (403). No approval was recorded under Team. Both run under the same global lock. |
| 2.8 | No fake independent approval | **PASS** | Self-reviews are recorded as "Self-reviewed (Solo)". Others are recorded as "Independent (Solo)" or "Independent (Team)". Pre-Solo approvals stay null, shown as "Historical review not recorded" (S06). |
| 3.1 | Genuine partner evidence required | **PASS** | Agreement: must equal the version's signed-acceptance reference. Receipt: must equal the receipt's signed evidence reference. Resolution: must be *new* evidence (S02). |
| 3.2 | Actor, reason, timestamp, evidence retained | **PASS** | The review journal and the CSV columns. |
| 3.3 | Append-only journal (API + SQL) | **PASS** | S05 on a **migrated** database: an EF update is refused ("append-only"). Raw SQL `UPDATE` and `DELETE` both fail with SQL 51042. The row count and content are unchanged. |
| 3.4 | Exports distinguish Self / Independent / Unknown | **PASS** | S06 and HTTP. |
| 3.5 | Duplicate requests don't duplicate events | **PASS** | S02: an exact replay leaves the review events at 3→3. An altered attestation on the same reference returns 409. |
| 3.6 | No claim of cryptographic signature | **PASS** | The UI and documentation describe a "reference to retained external evidence". The review log contains no "verified signature" wording. |
| 4.x | Inventory, QA, custody, returns, privacy, PDF, finance | **PASS** | S06: a Solo founder is still blocked by retail reservations (`409 inventory_reserved`), and the duplicate-claim index is intact. Unresolved receiving holds still block handover. Finance rows are 0 in S02 and in the E2E database. The PDF, privacy and inventory regressions all pass in the full API suite. |
| 5.1 | All four consignment migrations | **PASS** | `…082802`, `…103941`, `…160448` and `…035952` are in the history and in the isolated tree. |
| 5.2 | Fresh migration plus idempotent replay | **PASS** | Root script on an empty database: exit 0. Replay: exit 0. **A replay with Solo enabled keeps Solo and the founder** (no reset). |
| 5.3 | Down guard protects business and Solo history | **PASS** | S05: a Down migration with only one policy-change event is blocked ("retain approval policy, review and custody evidence"). |
| 5.4 | Root `migration.sql` matches the final EF model | **PASS** | The idempotent script generated from the isolated migration assembly is identical to the root `migration.sql` (SHA-256 prefix `cfa03bc7…`, line endings normalised). |
| 5.5 | B2B-only isolation | **PASS** | See section 5. |
| 5.6 | Solo patch is not a release package | **PASS** | `solo-operator-mode.patch` doesn't apply to clean HEAD (`git apply --check` fails). It's an incremental review diff. |

## 2. Remaining defects

**No release-blocking defect found.** Non-blocking observations (no code change needed before staging):

1. **Write-off can happen before the receiving review** (S02).
   - A physically returned, QA-Failed unit can be written off while its damaged finding is still open.
   - It stays held and disabled, and the discrepancy stays open until reviewed, so there's no inventory or financial exposure.
   - Mention it in UAT so operators review first and then write off.
2. **Receipt dates can't be in the same minute as dispatch** (Low, browser).
   - The receipt-date field has minute precision. A receipt dated in the same minute as the dispatch is rejected because it is earlier than the dispatch timestamp.
   - Real partner receipts come later, so this is low impact.
3. **Policy card shows an administrator GUID** (Low, cosmetic).
   - "Last change" on the policy card shows the acting administrator's GUID instead of their name.

## 3. Test results (final source)

| Run | Total | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| API full suite (whole repository, real SQL Server) | 2,837 | 2,837 | 0 | 0 |
| Independent Solo probes S01–S06 (disposable SQL Server) | 6 | 6 | 0 | 0 |
| B2B + Solo regression in the **isolated B2B-only tree** (serial) | 655 | 654 | 1* | 0 |
| Web full Vitest suite | 4,353 | 4,346 | 0 | 7 |
| Typecheck (app + functions) | – | pass | – | – |
| ESLint (merchant sales, consignment service, capabilities) | – | pass | – | – |

\* The one isolated-tree failure, `MerchantDirectoryHttpTests.BrowserServiceSmoke…`, is environmental. The test shells out to the web workspace's `vitest`, and the scratch export has no `node_modules`; npm tried to fetch vitest into its own cache, then the config failed to load. The test passes in the full repository run (2,837/2,837).

**Probe history.** The first two probe runs had failures caused by *my fixture*, not the app:
- The fixture database was built from the EF model, so it lacked the migration-seeded policy row and the append-only trigger. That showed fail-closed behaviour ("policy unavailable, self-review disabled") but not the Solo path.
- I added the policy seed, ran S05 on a migrated database, and fixed two script mistakes. Final run: 6/6.

**Not executed:**
- Android camera / Web NFC hardware.
- Staging.
- Real partner documents.
- The production web build (Codex's log only).
- Two live browsers racing each other. Concurrency was tested at the SQL level (S04).

## 4. Solo Founder end-to-end usability verdict: **USABLE**

One authorized founder can complete the whole loop alone:

1. Enable Solo.
2. Self-approve against the signed acceptance reference.
3. Reserve, then dispatch.
4. Record the partner-signed partial receipt.
5. Self-review the discrepancy with new evidence.
6. Return, inspect, then write off.
7. Export the review log.

Every self-reviewed step is explicit, needs evidence, is visibly labelled and is journaled. Team mode is fully restored with one confirmed change.

## 5. B2B release-isolation assessment: **PASS**

- I exported the full committed HEAD tree into scratch (not a worktree or clone) and overlaid every modified and untracked B2B / consignment / Solo file under `apps`, `docs` and `migration.sql`.
- Excluded: `Program.cs`, `launchSettings.json`, `appsettings.Development.json`, `MarketingDemoOptions.cs`, `MarketingDemoSeeder.cs` and `MarketingDemoSeederTests.cs`. `Program.cs` = HEAD plus the two consignment registrations.
- `IAdminAccessResolver` is already registered at HEAD, so Solo's resolver is injected in the isolated build.
- The API and test projects build with 0 errors and no `MarketingDemo` references. All four consignment migrations are present, and the generated idempotent script equals the root `migration.sql`.
- The B2B + Solo regression subset ran inside the isolated tree (section 3).
- **Package from the full working-tree file set.** None of the scoped patches (consignment remediation, final remediation, Solo) is a standalone package. `Program.cs` needs a hunk-level commit, and the root `package.json` `marketing:*` scripts and `.gitignore` Demo entries stay out.

## 6. Staging UAT readiness: **GO for controlled B2B Staging UAT**

**Prerequisites:**
- Package the isolated B2B commit.
- Back up the staging database.
- Apply `migration.sql` with `sqlcmd -I`.
- Deploy the API and the matching web build together.
- Grant the founder least-privilege capabilities explicitly: the normal consignment actions plus `consignment.self_review` and `consignment.approval_policy.manage`.
- Use test stock only.

**Rehearse in staging:**
- Team mode first.
- Then the Solo enable → full loop → switch back to Team.
- The migration replay and the Down guard.
- Real QR/NFC re-inspection on the intended Android hardware.

## 7. Production and first-100 dispatch blockers (business / operational)

| Item | Status |
| --- | --- |
| Accepted staging UAT evidence and a separately approved production deployment | Open |
| Signed 35% partner agreement with its actual acceptance reference | Open |
| Settlement frequency, payment deadline, discount policy, commission base and rounding, tax/e-Invoice responsibility | Open |
| Founder named and granted least privilege; monthly partner statement reconciliation and periodic accountant review of the Solo review log agreed | Open |
| Missing/damaged investigation and permanent-shortage policy | Open |
| Real QR camera / Web NFC hardware and packaging validation | Not tested (staging gate) |
| Partner-countersigned physical count of the 100 tags against the controlled manifest | Open |

## 8. Recommendation

**No release-blocking defect was found. Close local Solo Mode development and the local remediation cycle, and move to controlled B2B Staging UAT.** No further feature development is required for safe operation.

**Production deployment and real stock dispatch remain NO-GO** until the section 7 items are closed.
