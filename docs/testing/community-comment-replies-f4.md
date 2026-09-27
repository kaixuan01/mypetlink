# Community Comment Replies — F4 verification

F4 adds the web Reply experience on `feat/comment-replies`, preserving the
F2/F3 API commits `d7aa965`, `bc94faf` and `bf450d1`. No API production file,
database schema or migration is changed. Nothing is pushed or deployed.

## Contract and scope

The existing `MomentComments`, mention composer/body renderer, report dialog,
delete route and capability-based Admin UI are reused. There is no second
Comment system, Reply entity, nested write, Like, rich text or editing flow.
No existing dedicated Reply feature contract was available: older deployments
are recognized by the additive F2 root shape (`parentCommentId === null` plus
a numeric `replyCount`), rather than the count alone. Community's global
Social ON/OFF control continues to govern the surface.

Unit coverage includes root/Reply targeting, draft preservation and recovery,
malformed/account/Moment storage isolation, autocomplete and unique ids,
semantic one-level lists, collapse caching, paging/retry, partial-page append,
id deduplication, authoritative counts and in-flight read/write races, Block
refresh, parent disappearance, permissions, shared reporting, Reply anchors
and neutral hidden-anchor fallback. Activity coverage checks copy, household,
link and unread delivery. Admin coverage checks parent availability, plain text,
evidence separation, unchanged capabilities and the `RemoveComment` action.

## Browser smoke

Runner: `apps/web/scripts/comment-replies-smoke.mjs`, using installed Edge and
the existing Playwright dependency. The web runs with Social ON and an API base
URL. All requests are intercepted with browser-only F2/F3 response fixtures;
no fixture data or authentication fallback is added to production code.

The local `MyPetLinkDev` database stops at `AddCommunityModeration` and has no
`MomentComments.ParentCommentId`. The existing F2 migration was not applied,
respecting this task's no-schema-change scope. Therefore this smoke proves UI
and client contracts, **not live-backend authorization or privacy**. F5 must
repeat the journeys against an environment already migrated to F2/F3.

| Viewport | Eight requested flows | Horizontal overflow | Composer ids |
|---|---|---|---|
| 320 × 640 | Pass | None | Unique |
| 360 × 800 | Pass | None | Unique |
| 375 × 812 | Pass | None | Unique |
| 390 × 844 | Pass | None | Unique |
| 412 × 915 | Pass | None | Unique |
| 768 × 900 | Pass | None | Unique |
| 1024 × 900 | Pass | None | Unique |
| 1280 × 900 | Pass | None | Unique |

Every viewport runs parent → Reply, Reply → Reply-to-Reply, View/Hide,
Delete own Reply, Moment-author Remove Reply, Activity deep link, Report Reply
and anonymous expansion. Assertions also check root ids, non-self prefill,
one composer at one depth, top draft recovery after Cancel, Reply focus/highlight,
Activity return context, delivered unread rows and mark-read, dialog layout,
and absence of anonymous write controls or uncaught browser errors.
All eight journeys were repeated at every viewport against the final Social ON
production export served locally, as well as the development server.

Screenshots are optional (`QA_SCREENSHOT_DIR`) and kept outside the source
tree. The 320px, 390px and desktop thread/composer captures were visually reviewed.

## Verification results

- Focused Comment/Reply, draft, mention, Activity and Admin set: **8 files,
  166 tests passed**.
- Community frontend set (social components plus affected services, drafts and
  Admin moderation): **44 files, 626 tests passed**.
- Final full web suite: **299 files, 3,328 tests passed** with four workers
  (`node ../../node_modules/vitest/vitest.mjs run --maxWorkers=4`).
- Typecheck and lint: passed.
- Social OFF build and artifact verifier: passed.
- Social ON build and artifact verifier: passed.
- Both verifiers checked 3 entry points, 4 control markers, the client entry
  gate, 11 routes and the finder/social routing admission rules.
- Browser: all **64 requested journey/viewport combinations passed** on each
  of the development and final local production-export runs, with contract
  fixtures; no horizontal overflow or uncaught browser errors.
- `git diff --check`: passed.
- No API tests were needed: no backend production code changed.

Environment notes: the first Windows export attempt hit a transient `EBUSY`
copy lock; the final OFF and ON exports both completed. Standard-parallel full
suite runs intermittently hit existing dialog/focus timing assertions in the
unchanged care-record and pet-creation tests. Those files passed separately
(7 and 18 tests respectively); the final full suite passed with four workers.

## Remaining work

F5: full browser audit with live F2/F3 APIs, actual household roles,
restriction/Block changes and hidden Activity/count reconciliation. F6: the
subsequent release acceptance/rollout. There is no Reply UI implementation
debt deliberately left to those phases.
