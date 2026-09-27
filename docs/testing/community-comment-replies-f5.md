# Community Comment Replies — F5 live verification

F5 verifies the one-level Reply feature (F2 read model, F3 write path and
Activity, F4 web experience) against a **real local API, real SQL Server, real
Reply rows, Activity, Blocks, reports and Admin moderation**. No response
fixtures, no Production, nothing pushed or deployed. No product defect was
found; no production code changed in F5.

## Environment

- Branch `feat/comment-replies` at `201379c`, on top of `origin/main` `ebadf31`.
- A **disposable copy** of the local `MyPetLinkDev` database (`MyPetLinkF5QA`,
  backup/restore) with the branch `migration.sql` applied through
  `migration-session-settings.sql` and `sqlcmd -I -b -V 11`. The copy's
  Comments, mentions, reports, Activity and migration history checksums were
  identical before and after, plus one history row; `ParentCommentId`, the
  self-FK (`NO ACTION`, trusted), `CK_MomentComments_NotOwnParent` (trusted)
  and both Reply indexes were present. `MyPetLinkDev` itself was never
  migrated or written, and was checksum-identical after QA.
- The branch API (Development profile) pointed at the copy, and the branch web
  dev server with Social ON. Browser: headless Edge through `playwright-core`.
- Sessions were minted locally for existing Development fixture households
  (`social.a`–`social.e`, `admin.dev`) and a separate Administrator
  (`qa.moderator`), so the moderator never decided a report involving their own
  household. One fixture household had Community switched on through its own
  settings API and joined a real collaboration, both on the copy only.

| Role | Household |
|---|---|
| A — Moment author | `rahmanpets` |
| B — top-level Comment author | `teohfamily` |
| C — Reply author | `quietpaws` |
| D — viewer / reporter | `devadminhouse` |
| E — accepted collaborator | `nghome` |
| F — uninvolved (blocked by A in the fixtures) | `omarhousehold` |

## Results

About 360 live assertions ran across API, SQL Server and browser scripts. Every
failure seen during the run was traced to the QA harness itself (a wrong route
guess, CSS text-transform, an empty-string SQL read, smooth scrolling, a list
asserted before its options loaded, the fixed rate limit exhausted by earlier
scripts) and re-verified; none was a product defect.

| Area | Live result |
|---|---|
| Journey | Browser Reply writes one row under B's Comment (author C), one POST per Send; thread, `replyCount`, heading count and announcement update; oldest-first. |
| Reply-to-Reply | Stored under the top-level parent; `@handle` prefill only into an empty draft, never overwriting, not re-added once deleted; Cancel restores focus. A Reply id as parent is `422 comment_reply_parent_invalid` with no row. No `ReplyToUserId` exists. |
| Mentions | Mention row names the household's account; none without `@`. |
| Activity matrix | B≠A: B Replied, A Commented. B=A: A only Replied. Self-reply: none to self. Mentioning A/B adds no second row. Unrelated mention: Mentioned. At most one row per recipient per write; badge always equals the list. |
| Activity UI / deep link | "{household} replied to your comment." with no raw type; the link opens the Moment at `#comment-{replyId}`, expands the thread, focuses the Reply; a fresh load of the same URL works. |
| Pagination | 22–24 real Replies: 10, then "View 12 more", then "View 2 more"; SQL Server order; no duplicates or gaps; collapse/reopen reuses loaded Replies. A new Reply into a partly loaded thread appears last and the unloaded middle loads before it. |
| Counts | `commentCount`, `replyCount`, POST/DELETE `parentReplyCount` agree with SQL after create, delete, remove, Block, parent delete and Moment hide. |
| Delete / remove | Author delete and Moment-author remove tombstone one Reply only, clean its mentions and retarget/withdraw Activity; parent author, collaborator and viewer get `404`. |
| Parent delete | Parent tombstoned; Replies and their mentions kept untouched and unpromoted; thread, counts, Activity and deep links all fall back neutrally. |
| Block matrix | Parent↔Reply author (either way): those Replies vanish for everyone, counts drop by exactly the affected Replies, the replier gets the neutral `404`, unblock restores with no new Activity. Viewer blocks replier: only that viewer. Viewer blocks parent author: that viewer loses the thread, its Replies route and the anchor. |
| Restriction | Restricted household refused Comment, Reply, mention Reply, Like, Follow, report and collaboration (`403`); earlier Reply hidden; lift restores it and creates no Activity. |
| Moment hide | Public Moment, thread and Replies `404`; Reply Activity hidden; owner still sees it marked hidden; unhide restores with no rows recreated. |
| Reports / Admin | UI "Report reply" files a Comment report on the Reply against its author with its body. Admin shows Reply target, evidence apart from current state, parent author/body/visibility, plain text only, at 390/768/1280 without overflow. "Remove reply" (`RemoveComment`) tombstones only the Reply, cleans mentions and unread Activity, resolves every open report on it, keeps evidence and writes one `CommunityCommentRemoved` audit row. Removing a parent keeps its Replies as rows. |
| Drafts | A Reply draft interrupted by an ended session is restored for the same account, Moment and parent and posts as that Reply; another Moment does not receive it; another account on the tab neither sees nor keeps it; a vanished parent gives "The comment you were replying to is no longer available." and nothing is posted top level. A parent removed while composing refuses the submit. |
| Anonymous | Reads, expands and pages Replies and follows visible deep links; no Reply, report, delete or remove control. |
| Hidden deep links | Deleted Reply, deleted parent, viewer Block, R3 and hidden Moment: the Reply is not rendered and no wording says why. |
| Security | Cross-Moment, deleted and random parents give identical `404`s; malformed id `400` with nothing written; spoofed author/Moment/time/deletion/recipient fields ignored; anonymous `401`. |
| Rate limit / retries | 19 mixed Comments and Replies plus the 20th succeed; the 21st Reply and a further Comment are both `429`. A retry in one thread is one Reply; the same words at top level and under two parents are three. |
| Stale responses | Rapid expand/collapse, switching threads, paging and posting with delayed responses: both threads end exactly as stored; no Reply changes thread. |
| Accessibility | Top-level and Reply lists are `<ol>`, the Reply list is labelled; `aria-expanded`/`aria-controls`/`aria-busy` track state; no duplicate ids with a composer open; keyboard reach, Enter toggles, mention suggestions by keyboard; Escape closes suggestions without cancelling the Reply. |
| Responsive | 320, 360, 375, 390, 412, 768, 1024, 1280: no horizontal overflow, composer and Send fully visible and unobstructed, one indent step, Reply-to-Reply context shown; live write + delete at 320, 390 and 1280; Activity at 375 and 1280. |
| Boundaries | Search never returns Reply text; Share Profile carries no Reply data; Safety Profile no Comment data; Moment detail count equals the thread's. |

Console and network: no page errors and no unexpected failed requests. The one
recurring `404` is the `next dev` document response for `/moments/{id}`, which
is served from the export's fallback shell by design and renders normally.

## Non-blocking follow-up (F6)

- **Removing a top-level Comment that has Replies does not say the Replies go
  too.** The owner "Delete comment"/"Remove comment" dialog and the Admin
  "Remove comment" confirmation describe only the Comment, and Admin detail
  shows no Reply count for a top-level target. Behaviour is correct; the copy
  should say its Replies will no longer be shown.
- **Pre-existing (Phase 2A, not Reply-specific):** after a Comment is deleted,
  an unread "commented on your Moment" row can be retargeted onto the same
  Comment an older, already-read row points at, so the list can show that
  Comment twice.

## Automated verification

- API full suite (SQL Server tests included): **2,327 passed**, 0 failed, 0
  skipped — among them 84 Comment Reply tests, the F2 query-plan guards (no
  scan of `MomentComments`), 6 scale tests, the 19 F3 SQL Server race tests,
  57 mention, 138 report/moderation and 32 Activity tests.
- Web full suite (`vitest run --maxWorkers=4`): **299 files, 3,328 passed**.
  Focused Reply set: 8 files, 166 passed. Community set (social components,
  Comment/Activity/report services, drafts, Admin moderation): 43 files, 619
  passed.
- Typecheck and lint: passed.
- `build:social-off` and `build:social-on` with their artifact verifiers
  (3 entry points, 4 control markers, entry gate, 11 routes, finder/social
  routing): passed. The export contains no Reply-specific route.
- Pages Functions build: passed.
- EF `has-pending-model-changes`: none. `git diff --check`: clean.

## Cleanup

Servers stopped, the temporary `apps/web/.env.local` removed, the disposable
database dropped with its files. `MyPetLinkDev` was never modified. The branch
launch configuration was restored byte for byte. The QA harness lived outside
the repository.
