# Community moderation runbook (Phase 2E draft)

**Status: draft.** The schema, the moderation states and their enforcement,
and the Admin capabilities exist (Phase 2E E1), and households can submit
reports through the API (E2). The Report buttons (E3) and the Admin moderation
queue and actions (E4) are not built yet. Until E4 ships, nothing in this runbook can be done from the Admin
Portal; do not change moderation state by hand in the database.

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
| **Hide Moment** | *Hidden by MyPetLink.* Gone from Feed, Explore, Community Profiles, the pet's Community Moments, the Moment's own page and Share link, and the pet's Share Profile Moments and Timeline. Its Likes, Comments and collaborators are kept but not shown. The owner still sees it in the Owner Portal, marked, and can delete it; they cannot bring it back by making it public again. | **Unhide** |
| **Restrict household** | Community is paused: their Community Profile, Moments, Comments, mentions and collaborator attribution disappear, and they cannot post, comment, follow, like or mention. Their Community switch is off and locked; they see "Your Community access is paused. Contact support." Everything outside Community is untouched — including their pets' Share and Safety Profiles and Smart Tags. | **Lift**, which restores the owner's own Community choice (on or off) as it was, including if they switched it off while paused. |

A household restriction is **not** an account suspension. Never suspend an
account (`Users.Status`) for Community behaviour: that locks the owner out of
Lost Mode and their pets' safety information.

## Evidence

Each report stores a snapshot, taken when it is made, of the public evidence
only: the household's handle and name, and the Comment text, the Moment title
and caption, or the profile bio (with a reference to the avatar). This is what
the reviewer sees even after the content is edited, deleted or removed. No
e-mail address, phone number, finder, Safety Profile or private detail is ever
copied into a report, and media is referenced, not copied.

Report records and their snapshots are kept as moderation history. Retention
and deletion of old reports are not automated in V1; agree a period before
the queue ships.

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
thing acted on, its state before and after, the report it resolved, and the
moderator's internal note. Internal notes are visible only in the Admin Portal.

## Severe content: images and video

Hiding a Moment stops MyPetLink from showing or linking its media. The files
themselves stay in the public media bucket under long random names, so anyone
who already saved a direct media link can still open it until the file is
deleted.

For content that is illegal or dangerous — sexual content involving a minor,
credible threats, graphic cruelty — hiding is not enough:

1. Hide the Moment (or restrict the household) immediately.
2. Escalate to the MyPetLink owner/operator the same day. Record the Moment
   id, the report id and the time in the audit note; do not copy the media
   anywhere else.
3. The operator deletes the specific media objects from the storage bucket by
   their object keys (from the Moment's media records), and records that it
   was done.
4. Where the law requires it, report to the relevant authority. Preserve only
   what the authority asks for, through the channel they specify.

There is no automated purge in V1.

## Urgent situations

If a report suggests someone is in immediate danger, or an animal is being
harmed right now, act on the content first (hide or restrict) and escalate to
the operator immediately rather than waiting for the normal queue.
