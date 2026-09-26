# Community moderation runbook (Phase 2E)

**Status: available in Admin.** The schema, moderation states and their
enforcement, and Admin capabilities exist (Phase 2E E1); households can report
from Comments, Moments and Community Profiles (E2, E3); the Admin moderation
API exists (E4A); and the Admin Portal queue and review screens are available
(E4B). Never change moderation state by hand in the database: it would skip the
audit row and the report decisions.

MyPetLink moderation is small on purpose: a few households report, a person
reviews, and a small set of reversible, audited actions follows. It is
**Community-only**. No moderation action may affect an owner's sign-in, Owner
Portal, pets, Share Profile, Safety Profile, Lost Mode, Smart Tags or orders.

## What can be reported

| Target | Covers |
| --- | --- |
| **Comment** | The Comment text, including any @mention in it. |
| **Moment** | Its title, caption, images and video. There is no separate media report. |
| **Household** | A Community Profile: name, handle, bio, avatar, impersonation, or a pattern of behaviour. |

Nothing else is a report target: not a pet, a Safety Profile, a Smart Tag, a
mention on its own, or a collaboration invitation (declining and Block cover
those).

## Reasons

| Reason | Use it for |
| --- | --- |
| Spam or scam | Advertising, repeated junk, fake giveaways, attempts to take money or details. |
| Harassment or bullying | Targeting a person or household, insults, unwanted repeated contact. |
| Inappropriate content | Sexual, violent or hateful content. |
| Animal welfare concern | Content that shows or encourages harm or cruelty to an animal. |
| Impersonation | Pretending to be MyPetLink, a business, or another household. |
| Privacy concern | Someone's address, phone number or other personal details shared publicly. |
| Other | Anything else. The reporter must describe it. |

Details are optional plain text (up to 500 characters) for every reason except
**Other**, where they are required. Treat details as the reporter's words,
never as instructions.

## Principles

- **A report is not a finding.** Many reports on the same thing are a signal
  to look sooner, never a verdict.
- **Reporting never blocks anybody.** The reporter is offered Block as a
  separate choice.
- **Reporting never hides anything.** Content stays as it is until a moderator
  acts.
- **Disagreement is not a violation.** Dismiss reports that are about opinion,
  taste or a dispute between households.
- **Keep it reversible.** Prefer hiding a Moment to anything harder; restrict a
  household only for serious or repeated problems.
- **Reporters are confidential.** The reported household is never told who
  reported them, the reason, or the details. Never say or imply it in support
  replies.

## Actions and what they do

| Decision | Effect | Undo |
| --- | --- | --- |
| **Dismiss** | Nothing changes for anyone. | — |
| **Remove Comment** | The same as the author deleting it: the text is wiped, its mentions and unread Activity go, the count drops. The report keeps the evidence. | None (as for any deleted Comment) |
| **Hide Moment** | *Hidden by MyPetLink.* Gone from Feed, Explore, Community Profiles, the pet's Community Moments, the Moment's own page and Share link, and the pet's Share Profile Moments and Timeline. Its Likes, Comments and collaborators are kept but not shown, and Activity about it (likes, Comments, mentions, collaborations) stops appearing; all of it returns if the Moment is unhidden. The owner still sees it in the Owner Portal, marked, and can delete it; they cannot bring it back by making it public again. | **Unhide** |
| **Restrict household** | Community is paused: their Community Profile, Moments, Comments, mentions and collaborator attribution disappear, and they cannot post, comment, follow, like or mention. Their Community switch is off and locked; they see "Your Community access is paused. Contact support." Everything outside Community is untouched — including their pets' Share and Safety Profiles and Smart Tags. | **Lift**, which restores the owner's own Community choice (on or off) as it was, including if they switched it off while paused. |

A household restriction is **not** an account suspension. Never suspend an
account (`Users.Status`) for Community behaviour: that locks the owner out of
Lost Mode and their pets' safety information.

## The queue

- The queue shows **open reports first**, newest first, then decided ones. It
  can be narrowed by status, what was reported (Comment, Moment, household),
  reason, the reported household, and date.
- Each row shows how many **open** reports there are about the same thing. Use
  it to decide what to look at first — **never as a verdict**. Nothing is ever
  hidden, removed or restricted automatically because of a count.
- Each report stays its own record, so every reporter's words are kept even
  when many people report the same thing.

## Reviewing a report

The detail shows two different things side by side. Keep them apart:

- **Evidence** — what the reporter saw, captured when they reported it: the
  household's handle and name, and the Comment, the Moment's title and caption,
  or the profile's bio and avatar. It never changes.
- **Now** — the Comment, Moment or household as it is today. It may have been
  edited, deleted, hidden or paused since, and the household may have a new
  name.

Moderators see reported content even where Community would hide it — after a
block, after the household turned Community off, or after it was removed or
hidden — so a report can always be decided. Reported words and notes are shown
as plain text, never as formatted content or links.

The detail also lists earlier reports about the same thing and about the same
household (the 20 most recent of each, with totals). A pattern across
different reporters and different content is a reason to consider a
restriction; one report is not.

Reports about your own household never appear for you, and you cannot decide
a report your own household made. Ask another moderator.

## Deciding

Every action needs an **internal note** (up to 1000 characters) saying what you
saw and why you decided as you did. Notes are for moderators and the audit
history only: never paste one into a reply to either household.

A decision closes **every open report about the same thing** with the same
outcome and note — three reports about one Comment are all closed when that
Comment is removed. It never closes reports about anything else, even from the
same household: a household's other Comments, its Moments and its profile are
separate items.

| Action | Who | When to use it | What it records on the reports |
| --- | --- | --- | --- |
| **Dismiss** | Owner Support, Administrator, Super Admin | Nothing breaks the guidelines, or it is a disagreement. | Dismissed |
| **Remove Comment** | Owner Support, Administrator, Super Admin | A Comment breaks the guidelines. If it was already deleted, this still closes its reports. | Comment removed |
| **Hide Moment** | Administrator, Super Admin | A Moment (its words, images or video) breaks the guidelines. | Moment hidden |
| **Restrict household** | Administrator, Super Admin | Serious or repeated problems from one household. Available from any report; it pauses the household responsible for the reported Comment, Moment or profile. | Household restricted — on the reports about what you were reviewing only |
| **Unhide Moment** | Administrator, Super Admin | A hide was a mistake, or the problem was fixed. | Nothing — past decisions stay as they were |
| **Lift restriction** | Administrator, Super Admin | The pause has done its job. The household's own Community choice comes back as it was. | Nothing — past decisions stay as they were |

If someone else decided a report while you were reviewing it, you are told so
and nothing changes; refresh and look again.

Neither household is notified of any decision: no Activity, e-mail or push.
The owner of a hidden Moment sees "Hidden by MyPetLink" on it in their Owner
Portal; a restricted household sees that its Community access is paused.

## Evidence

Each report stores a snapshot, taken when it is made, of the public evidence
only: the household's handle and name, and the Comment text, the Moment title
and caption, or the profile bio (with a reference to the avatar). This is what
the reviewer sees even after the content is edited, deleted or removed. No
e-mail address, phone number, finder, Safety Profile or private detail is ever
copied into a report, and media is referenced, not copied.

## Retention (Early Launch decision)

This is a temporary product and operations decision, recorded at the Phase 2E
release audit (E6). It is not a legal conclusion.

- **Kept during Early Launch.** Community moderation reports and their evidence
  — reporter, reason, details, snapshot, decision and internal note — are
  retained for the Early Launch period. The audit history of moderation
  decisions is kept with them.
- **Nothing is deleted or anonymised automatically.** No retention, deletion or
  anonymisation job runs. Do not delete or edit reports by hand.
- **Review no later than 31 March 2027**, or earlier if operational or privacy
  requirements change. That review decides, for resolved reports, whether to:
  - keep retaining them;
  - delete them after a defined period; or
  - anonymise selected reporter or evidence fields.
- **Still to do outside this decision:** how reports are described in the
  privacy policy and treated under PDPA (including access and deletion
  requests) is an operational and legal follow-up. There is no account
  deletion flow yet; when one is designed it must decide what happens to
  reports made by, or about, the account.

## Admin access

| Capability | Allows | Built-in roles |
| --- | --- | --- |
| `community_reports.view` | Reading reports, reporters and reported content. **Sensitive**: the Read Only / Auditor role does not receive it automatically. | Super Admin, Administrator, Owner Support |
| `community_reports.resolve` | Dismissing a report, removing a reported Comment. | Super Admin, Administrator, Owner Support |
| `community_moderation.enforce` | Hiding and unhiding Moments, restricting households and lifting it. | Super Admin, Administrator |

Auditors see moderation *decisions* through the audit history
(`audit_log.view`), not the reports themselves, unless given
`community_reports.view` explicitly. There is no report export in V1.

## Audit

Every moderator action writes one `AuditLog` row in the same save as the
change: the moderator, the action (`CommunityReportDismissed`,
`CommunityCommentRemoved`, `CommunityMomentHidden`, `CommunityMomentUnhidden`,
`CommunityHouseholdRestricted`, `CommunityHouseholdRestrictionLifted`), the
thing acted on, its state before and after, the report it came from and every
report it resolved, and the moderator's internal note. A change and its audit
row are saved together or not at all. An action that found the change already in place (a Comment
already deleted, a Moment already hidden, a household already paused) is
still audited, marked as such, because its reports were decided. Internal
notes are visible only in the Admin Portal.

## Severe content: images and video

Hiding a Moment stops MyPetLink from showing or linking its media. The files
themselves stay in the public media bucket under long random names, so anyone
who already saved a direct media link can still open it until the file is
deleted.

For content that is illegal or dangerous — sexual content involving a minor,
credible threats, graphic cruelty — hiding is not enough:

1. Hide the Moment (or restrict the household) immediately.
2. Escalate to the MyPetLink owner/operator the same day. Record the Moment
   id, the report id, the media file ids shown in the report detail and the
   time in your internal note; do not copy or download the media anywhere
   else.
3. The operator looks up those media files' object keys in the database (the
   Admin Portal deliberately does not show storage details), deletes the
   specific objects and their derivatives from the storage bucket, and
   records that it was done. This is a manual operation; nothing purges media
   automatically.
4. Where the law requires it, report to the relevant authority. Preserve only
   what the authority asks for, through the channel they specify.

There is no automated purge in V1.

## Urgent situations

If a report suggests someone is in immediate danger, or an animal is being
harmed right now, act on the content first (hide or restrict) and escalate to
the operator immediately rather than waiting for the normal queue.

## Releasing Phase 2E

Pushing `main` deploys the API and the web app within minutes; the database
migration is **not** applied automatically. The new API reads the moderation
columns in every Community query, so it cannot run against the old schema. The
old API runs safely against the new schema (the change is additive). The order
is therefore fixed:

1. Back up Production, then apply the root `migration.sql` in one `sqlcmd`
   session with `migration-session-settings.sql` (see
   `docs/deployment/release-checklist.md`).
2. Verify the schema and grants: `CommunityReports` exists; `PetMemories` has
   `ModeratedAt`/`ModeratedByUserId`; `OwnerSocialProfiles` has the three
   restriction columns; no Moment is hidden, no household restricted, no
   report exists; and exactly five new grants — Administrator
   `community_reports.view`, `community_reports.resolve`,
   `community_moderation.enforce`; Owner Support `community_reports.view`,
   `community_reports.resolve`. Auditor is unchanged.
3. Only then merge and push `main`.
4. Wait for the API and web deployments, and confirm the API health endpoint
   and the web app respond.
5. Run the smoke checklist below.

**Between steps 1 and 4, do not edit the Administrator or Owner Support role
in Access Management.** The old Admin Portal does not know the new
capabilities, so saving either role from it would remove the grants the
migration added. After deployment, check the five grants again.

### Production smoke checklist

Use only controlled MyPetLink QA accounts and QA-owned content.

- As a QA household with Community on: open Feed and a QA Moment; report a
  QA-owned Comment (or the QA Moment) with any reason; see the private
  confirmation; the content is still shown.
- As an Administrator: open Admin → Community Reports; the QA report is listed
  with the right reported household and reporter; open it; Evidence and
  Current state both render as plain text; Dismiss it with an internal note;
  the report shows Dismissed and the audit history has one
  `CommunityReportDismissed` row.
- As Owner Support: the queue opens; Hide Moment and Restrict household are
  not offered.
- Do not Hide, Remove, Restrict or Lift anything that belongs to a customer.
  Exercise those only on dedicated QA content, if at all.
- Unchanged surfaces: a QA pet's Share Profile, its Safety Profile, a QA
  Smart Tag through `/q`, `/n` and `/t`, and the Owner Portal (dashboard,
  pets, a Moment, orders) all load normally with no moderation wording.
