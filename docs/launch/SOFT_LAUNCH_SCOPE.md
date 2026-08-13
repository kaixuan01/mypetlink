# MyPetLink Soft Launch Scope

**Date:** 2026-08-13 · **Companion documents:** [`SOFT_LAUNCH_READINESS.md`](SOFT_LAUNCH_READINESS.md) · [`CODEX_FIX_BACKLOG.md`](CODEX_FIX_BACKLOG.md)

This document defines what MyPetLink markets and supports at soft launch. It reflects the **actual default configuration** in `apps/web/src/lib/features.ts` and `apps/api/MyPetLink.Api/appsettings.json`, not aspiration.

---

## Included at Soft Launch

Everything below is implemented, enabled by default, and verified.

| Capability | Surface |
| --- | --- |
| Google Sign-In, session handling, logout | `/login` |
| Create and manage up to 3 pets (Free plan) | `/pets`, `/pets/new`, `/pets/:id/edit` |
| Pet identity, photos, theme, personality, about, allergies | Pet profile |
| Public Share Profile with About / Moments / Timeline | `/p/:petSlug` |
| Per-pet link previews and generated social cards | Cloudflare Pages Functions + API |
| Copy Link and WhatsApp sharing | Pet profile, post-creation screen |
| Moments — 12 categories, media, public/private | `/pets/:id/moments` |
| Life Timeline | `/pets/:id/timeline` |
| Care Records — 9 types, due dates, visibility | `/pets/:id/records` |
| Owner dashboard with upcoming-care widget | `/dashboard` |
| Marketing site, pricing, FAQ, legal pages | `/`, `/pricing`, `/privacy`, `/terms` |
| Admin Portal for owner/pet support | `/admin` |

**Positioning ceiling:** market free pet profiles, sharing, memories and basic care. Do not market tags, subscriptions, reminders, or GPS.

---

## Recommended Before Launch

From [`CODEX_FIX_BACKLOG.md`](CODEX_FIX_BACKLOG.md):

- **P0-001 — implemented** — Safety Profile no longer instructs a finder to use contact options it is not showing.
- **Owner-managed / excluded** — Migration SQL artefacts are managed by the repository owner and are not part of the Codex launch backlog.
- **P1-001** — Minimum funnel analytics (~8 events).
- **P1-002** — Add an `overdue` care-record state.
- **P1-003** — Configure the sample pet, or hide the sample CTAs when none exists.

Strongly worth including if time allows: **P1-004** (a single primary CTA after pet creation, leading to "Add your first Moment") — the cheapest available activation improvement.

---

## Deferred

Deferred by existing feature flags — **no code removal required**:

| Deferred | Mechanism |
| --- | --- |
| Smart Tag ordering and purchase | `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=false`, `Features:SmartTagOrderingEnabled=false` |
| Smart Tag navigation and management | `NEXT_PUBLIC_SMART_TAGS_ENABLED=false` |
| Tag order history | `NEXT_PUBLIC_TAG_ORDERS_ENABLED=false` |
| Owner-facing Safety Profile management UI | `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED=false` |
| Transactional email | `Email:Enabled=false` |

Deferred because unbuilt: Premium plans, care reminder delivery, profile completion checklist, FIUU payment gateway, GPS.

**Not to be built:** explore/social feed, likes, comments, following, chat, community, BLE. No partial implementation of any of these exists — nothing needs hiding.

**Also not to be built: a separate Milestones feature.** `MomentType` already includes Birthday, Adoption Day, First Day Home and Achievement, and `showInLifeTimeline` / `timelineNote` already power a Life Timeline page. Promote what exists rather than duplicating it.

---

## Two Scope Decisions That Need an Explicit Answer

Both are currently decided by a default value rather than by intent:

1. **Does `Email:Enabled` go to `true`?** If not, new owners receive no welcome email and the product never contacts them. Everything needed to send is built and templated.
2. **Does the Safety Profile owner UI ship (`NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED`)?** The `/q/:safetyCode` page works and the homepage advertises "Basic QR download" as a free feature — but with this flag off, owners have no first-class place to manage what a finder sees. Launching with it off means launching a safety promise the owner cannot administer.

---

## Product Positioning

### Working statement

> **MyPetLink is your pet's digital home.**

This is well supported. The Public Profile genuinely reads as a pet's own page rather than a record, and "Give your pet a page of their own" is deliverable today. The current homepage line — *"A safer profile for your pet"* — leans safety-first, which is the weaker half at launch given Smart Tags and the Safety owner UI are both off. Consider leading with the page/home framing and treating safety as the reason it matters.

### Pillar assessment

| Proposed pillar | Verdict at soft launch |
| --- | --- |
| **Profile** | Keep — strongest, fully delivered |
| **Memories** | Keep — Moments and Life Timeline are complete |
| **Care** | Keep, stated modestly — records yes, reminders no |
| **Share** | Keep — best-executed pillar, real per-pet previews |
| **Smart Tag** | **Drop from launch messaging** — disabled; already correctly marked "Coming Soon" |
| **Safety** | **Qualify** — the finder page works, but owner-side management is flagged off and P0-001 is open |

**Recommended launch pillars: Profile · Memories · Care · Share**, with Safety promoted to a pillar once P0-001 is fixed and the owner UI flag is decided. That yields four pillars fully backed by shipping functionality — a smaller, more honest promise than six pillars where two are conditional.
