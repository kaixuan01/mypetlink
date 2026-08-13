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
| Owner dashboard with care due-date widget | `/dashboard` |
| Marketing site, pricing, FAQ, legal pages | `/`, `/pricing`, `/privacy`, `/terms` |
| Admin Portal for owner/pet support | `/admin` |

**Positioning ceiling:** market free pet profiles, sharing, memories and basic care. Do not market tags, subscriptions, reminders, or GPS.

---

## Recommended Before Launch

From [`CODEX_FIX_BACKLOG.md`](CODEX_FIX_BACKLOG.md):

- **P0-001 — implemented** — Safety Profile no longer instructs a finder to use contact options it is not showing.
- **Owner-managed / excluded** — Migration SQL artefacts are managed by the repository owner and are not part of the Codex launch backlog.
- **P1-001 — implemented in code; production configuration remains** — Privacy-limited funnel analytics are inert until Operations configures GA4 and rebuilds.
- **P1-002 — implemented** — Care records distinguish overdue, due-soon, upcoming, and complete states.
- **P1-003 — implemented** — The guided Sample Experience is complete with or without optional approved-pet personalization; public and safety CTAs deep-link to matching sections.
- **P1-004 — implemented** — Pet creation leads to one primary View Profile action, with Add First Moment secondary and missing-contact guidance kept separate.
- **P1-005 — implemented** — Active Care surfaces describe due-date tracking without promising automatic reminder delivery.

The selected code corrections are complete. Proceed through production configuration, then run final end-to-end soft-launch verification before a controlled launch.

---

## Deferred

Deferred by existing feature flags — **no code removal required**:

| Deferred | Mechanism |
| --- | --- |
| Smart Tag ordering and purchase | `NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=false`, `Features:SmartTagOrderingEnabled=false` |
| Smart Tag navigation and management | `NEXT_PUBLIC_SMART_TAGS_ENABLED=false` |
| Tag order history | `NEXT_PUBLIC_TAG_ORDERS_ENABLED=false` |
| Smart Tag-linked Safety/activation flows | Smart Tag and order flags remain `false` |
| Transactional email | `Email:Enabled=false` |

Deferred because unbuilt: Premium plans, care reminder delivery, profile completion checklist, FIUU payment gateway, GPS.

**Not to be built:** explore/social feed, likes, comments, following, chat, community, BLE. No partial implementation of any of these exists — nothing needs hiding.

**Also not to be built: a separate Milestones feature.** `MomentType` already includes Birthday, Adoption Day, First Day Home and Achievement, and `showInLifeTimeline` / `timelineNote` already power a Life Timeline page. Promote what exists rather than duplicating it.

---

## Production Scope Decisions

The controlled-launch recommendation is now explicit:

1. Keep `Email:Enabled=false` initially. Email is not authentication-critical;
   SMTP and the Owner Welcome template can be enabled in a separate controlled
   step after delivery testing. Commerce templates remain off with commerce.
2. Set `NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED=true`. The public marketing
   surface promises a free Safety Profile and basic QR download, the finder
   no-contact defect is fixed, and showing the existing owner controls is safer
   than leaving an active finder page without its first-class management UI.
3. Keep Smart Tags, tag orders, ordering, manual payment, and fulfilment outside
   this launch. Existing finder routes remain available for existing data.

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
| **Safety** | Keep at the free-profile level — finder fallback is fixed and owner management is recommended on; physical tags remain Coming Soon |

**Recommended launch pillars: Profile · Memories · Care · Share · basic Safety**, while physical Smart Tags, commerce, reminders, Premium, and GPS remain explicitly deferred.
