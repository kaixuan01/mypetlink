# MyPetLink Social — soft-launch runbook

How to put Social in front of a small, controlled group of owners, and how to
take it away again without a deploy.

Social is **additive**. Nothing in pet management, Safety Profiles or tag
scanning depends on it, and none of those may break if it is off or if its
endpoints are unavailable. That property is what makes the rollout below safe,
and it is worth re-checking rather than assuming — step 5 does exactly that.

---

## Before you deploy anything

These are dependencies, not preferences. Do not start until every line is true.

- [ ] **RBAC has landed on `main`.** The Social migrations' model snapshots
      reference the Admin RBAC entities, so Social cannot be applied to a
      database that does not have them. Check with
      `git merge-base --is-ancestor feat/admin-rbac main`. If it is not an
      ancestor, stop: Social is not deployable yet, whatever else is ready.
- [ ] **`migration.sql` reviewed.** It is the deployable script and it is
      append-only. Confirm the Social migrations are the last entries and that
      nothing earlier has been rewritten:
      `git log --oneline -- migration.sql`.
- [ ] **A restore point exists** for the target database. The Social migrations
      only add tables and indexes, but a rollback plan is not optional.
- [ ] **`NEXT_PUBLIC_SOCIAL_ENABLED` is absent or `false`** in the web
      deployment. It defaults to false; make sure nothing has set it.

**Nothing is published by deploying.** Social is three separate opt-ins — the
household's own profile, then each pet, then each pet's discoverability — and
every one of them starts off for existing rows and new ones. Turning the flag on
puts the entry points in front of people; it enrols nobody.

---

## Rollout

Each step is reversible. Do them in this order.

1. **Apply the migration.** `migration.sql` against the target database. It is
   idempotent — every statement is guarded by its `__EFMigrationsHistory` row —
   so a re-run is safe.

   Run it with `sqlcmd -b -I`. `-I` turns on `QUOTED_IDENTIFIER`, which sqlcmd
   leaves off by default and which the script's filtered indexes require; `-b`
   makes the run stop on the first error instead of reporting success after
   one. This is not new to Social — the earliest filtered index predates it —
   but it is easy to omit and the failure looks like a Social failure.

2. **Deploy the API.** Social endpoints go live but nothing links to them. The
   only behaviour change visible to an existing owner is the Safety Profile's
   `publicProfileSlug` field, which stays null for everybody until a household
   enables Social.

3. **Deploy the web app with Social still off.** Build it with the command
   that states the flag rather than inheriting it:

   ```bash
   npm --workspace apps/web run build:social-off
   ```

   `next build` reads `.env.local`, which is gitignored and differs on every
   machine, so a build command that simply omits `NEXT_PUBLIC_SOCIAL_ENABLED`
   gets whatever that file happens to say. This script sets the value in the
   build's environment, where it beats any `.env` file, and then checks the
   artifact it produced instead of trusting the request.

   Then verify the site is unchanged: no Community group in the sidebar, no
   Social section in Owner Settings, no Follow button on a pet's public page,
   the mobile bar is the management one, and — the one that was missed once
   — **no Explore or Search link in the visitor header above a Share Profile**
   (`/p/{slug}-{publicCode}`, signed out). That header is client rendered, so
   the export cannot be searched for it; `verify-social-flag.mjs` checks the
   gate at source and `SocialLayoutVisitorShell.test.tsx` renders both states.

4. **Smoke-test the finder routes before enabling anything.** This is the
   check that matters most, and it must pass with Social off:
   - `/q/{safetyCode}` opens the Safety Profile
   - `/n/{tagCode}` and `/t/{tagCode}` resolve as they did before
   - WhatsApp and Call actions work
   - Lost Mode content appears for a lost pet

5. **Confirm failure isolation.** With Social off, load `/dashboard`, `/pets`,
   a pet page and a Safety Profile. None of them may issue a social request or
   fail if one would have.

6. **Enable Social for the cohort.** Build and deploy the other artifact:

   ```bash
   npm --workspace apps/web run build:social-on
   ```

   This is a build-time value, so enabling Social is a web deploy, not a runtime
   toggle — that is the trade for a static export. There is no API flag to
   change: the endpoints were already live and simply had no entry points.

   **What the flag does and does not do.** It decides what the owner portal
   renders. It does not remove Social code from the JavaScript bundle, and it
   does not close the routes: `/feed`, `/explore`, `/search` and `/u/{handle}`
   stay reachable in both artifacts, exactly as `/p/` does under its own flag.
   Nobody participates until they opt in, so an artifact with Social off and one
   with Social on differ in what is *offered*, never in what exists.

7. **Walk the manual smoke test below** as a real owner account.

8. **Watch for a day.** In particular:
   - API error rate on `/api/v1/social/*`
   - `429` responses — a real person should never meet a limit; if they do,
     the numbers in `RateLimiting:Social` are wrong, not the person
   - Explore suggestion timing (the correlated `MAX`, see the architecture doc)
   - `OwnerNotifications` row growth

9. **Widen** only after that day is quiet.

---

## Rolling back

- **Take Social away:** set `NEXT_PUBLIC_SOCIAL_ENABLED=false` and redeploy the
  web app. Every social entry point disappears — public navigation, the landing
  teaser, the owner sidebar and phone bar, Owner Settings, the sitemap, and the
  visitor header above a Share Profile. The routes and the API stay reachable, so
  existing `/u/` links keep working for anybody who saved one, exactly as `/p/`
  does under its own flag.
- **Data is never deleted by a rollback.** Handles, follows, likes and activity
  remain. Re-enabling restores the same world.
- **Do not roll back the migration** to disable Social. It is unnecessary and
  it would destroy owner-created content.

### The API cannot be rolled back past the migration

This is the one step in the rollout that is not reversible, and it is worth
knowing before step 1 rather than during an incident.

The Social migrations do not only add tables. They also change `PetMemories`:
`AuthorUserId` is added, backfilled from each pet's owner, and then made **NOT
NULL** with a foreign key to `Users`. A pre-Social build of the API does not
know that column exists, so every Moment it tries to create is an insert with
no author — and the database refuses it.

So, once `migration.sql` has been applied:

- Rolling the **web** app back is safe, and is the rollback (the flag).
- Rolling the **API** back to the *previous* Social-capable build is safe.
- Rolling the API back to a **pre-Social** build breaks Moment creation for
  every owner, Social or not. Do not do it. If the API must go back that far,
  the schema has to go with it, which means the restore point from the
  pre-deploy checklist — not a partial undo.

The other two existing-table changes are safe in both directions:
`MediaFiles.DerivativeStatus` is NOT NULL but carries a default, and
`PetMemories.PublishedAt` stays nullable.

The backfills themselves keep the opt-in posture: every `OwnerSocialProfiles`
and `PetSocialProfiles` row the migration creates has social participation and
discoverability set to off, and no name, handle or bio is copied from any
existing identity. The later `AddPetSocialConsentOwner` migration only adds one
nullable column to `PetSocialProfiles` and backfills nothing, so it is safe in
both directions on its own.

---

## Manual smoke test

Run as a real owner account on a phone, after step 6.

| # | Step | Expected |
|---|---|---|
| 1 | Sign in | Owner portal loads; Community group visible in navigation |
| 2 | Settings → Social profile | Claim a handle and a display name; it is NOT pre-filled from your account name |
| 3 | Same screen → **Your pets** → switch on **Show {pet} on MyPetLink Social** | The pet's row shows it on. If the switch is unavailable, the helper text says why — usually that the pet's Public Profile is off, which is turned on from the pet's own profile page and never from here |
| 4 | Same row → switch on **Let people find {pet} when browsing** | Only selectable once the row above is on |
| 5 | Create a public Moment | Appears on the pet's Moments tab |
| 6 | Explore | The pet appears under Suggested pets |
| 7 | Search its name, then the handle | Found under Pets, and under Pet Parents |
| 8 | Follow from a second account | Button becomes Following; follower count moves |
| 9 | Feed on the second account | The Moment is there |
| 10 | Like it | Count moves; refresh keeps it |
| 11 | Activity on the first account | "started following you" and "liked your Moment of …" |
| 12 | Block, then check search | The blocked account is gone from search |
| 13 | Settings → Blocked accounts → Unblock | They reappear; they are NOT following you again |
| 14 | **Scan a tag** | `/t` or `/n` opens the **Safety Profile**, not Social |
| 15 | **Safety contact** | WhatsApp and Call work |
| 16 | Safety Profile, bottom | "View Public Profile" leads to `/p/{slug}` — below the contact actions |
| 17 | Manage: edit a pet, add a care record | Unchanged |

**Rollback-sensitive checks.** Steps 14, 15 and 17 must pass identically with
Social on and with Social off. If any of them behaves differently, Social has
stopped being additive and the rollout stops.

---

## Local rehearsal

`DevelopmentSocialSeeder` builds this world on a developer machine: five
households with mixed discoverability, a blocked pair, a lost pet, multi-pet
Moments, likes and unread activity. It runs only when the environment is
Development **and** the `DevAuth` opt-in is on, and only creates `.local`
addresses.

```
cd apps/api/MyPetLink.Api
ASPNETCORE_ENVIRONMENT=Development \
  DevAuth__Enabled=true \
  DevAuth__AdminEmail=admin.dev@mypetlink.local \
  dotnet run --urls http://localhost:5281
```

Verify against the **static export**, not `next dev`: only the export has the
404-fallback shape that `/u/{handle}` depends on in production.
