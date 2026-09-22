# MyPetLink Marketing Strategy

> Read [`AI_AGENT_REFERENCE.md`](../../apps/web/docs/AI_AGENT_REFERENCE.md) first. This document
> covers product **positioning** and how the two public surfaces map to two
> different audiences. For the technical routing rules see
> [`PUBLIC_PROFILE_ROUTING.md`](../../apps/web/docs/PUBLIC_PROFILE_ROUTING.md).

---

## 1. Core promise

**A safer way home for your pet.** Every pet can start with a free public
profile and pet-level Safety Profile so a finder can contact the owner quickly.
The QR + NFC Smart Tag is an optional one-time add-on for owners who want extra
safety on a collar.

---

## 2. Two public surfaces, two audiences

These are **different pages with different jobs**. Never blur them in product,
copy, or campaigns.

| Surface | Route | Audience | Emotional job | Primary action |
| ------- | ----- | -------- | ------------- | -------------- |
| **Public Share Profile** | `/p/{petSlug}-{publicCode}` | Friends, family, social media, pet communities | Pride, delight, community | **Share** |
| **Safety Profile** | `/q/{safetyCode}`, or an active tag at `/q/{tagCode}` / `/n/{tagCode}` / legacy `/t/{tagCode}` | A stranger who opened a pet QR page or scanned a physical tag on a found pet | Urgency, trust, "help me get home" | **I found this pet — Contact Owner** |

- The **Share Profile** is the IG-style page an owner *chooses* to send. It is
  warm and clean: photo, name, bio, public memories, timeline, care badges. It
  is **not** emergency-first. Its only finder behaviour is a **Lost Mode** banner
  when pet-level `lostModeEnabled` is on.
- The **Safety Profile** is the page a finder *lands on* from a pet-level QR
  link (`/q/{safetyCode}`) or an active physical tag (`/t/{tagCode}`). It is
  finder-first: big contact CTA, WhatsApp/Call/Send Found Location, emergency
  and safety notes, minimal lifestyle content.

Marketing must reinforce this split. "Share with your community" = `/p/`.
"If your pet is ever lost, a finder opens the Safety Profile" = `/q/`; active
physical tags use `/t/` and render that same safety content.

---

## 3. What each surface should never say

**Share Profile must not** lead with "I found this pet", "Send Found Location",
emergency wording, or QR/safety-page language by default.

**Safety Profile must not** be overloaded with memories, timeline, or lifestyle
content that slows a finder down.

---

## 4. The smart tag is the hook

The free pet profile is the base product. Optional physical smart tags add a
printed QR code or QR + NFC tap surface to the same pet safety content. Retail
packaging, QR, NFC, and owner UI all show the same TagCode (see
`SMART_TAG_PRODUCT_STRATEGY.md`). Campaigns should make the scan-to-reunite
story concrete: scan or tap → safety page → contact owner. Never market an
internal id, short token, or `/p/{slug}`-only URL.

---

## 5. Owner experience supports the story

Owners manage everything from the portal hub (`/pets/{petId}`) and a tabbed edit
form. Owner-facing "View / Preview" buttons open the real public pages in a new
tab so owners can see exactly what a friend or finder sees. The marketing claim
("you control what's public") is backed by the per-field `visibility` flags split
across **Public Profile** and **Contact & Safety** settings.

---

## 6. Messaging guardrails for future agents

1. Keep the two surfaces distinct in every asset, mockup, and landing page.
2. Lead the share story with *Share*; lead the tag story with *reunite*.
3. Use real route formats (`/p/{slug}-{publicCode}`, `/t/{tagCode}`), never the
   deprecated `/p/{slug}` alone or old short tokens.
4. Privacy is a feature, not fine print — owners approve what's public.

---

## 7. Product positioning — safety AND care, QR-first

MyPetLink is a pet **safety and care** profile product, **not** a QR/NFC gadget.

- **Core message:** *"A safer way home for your pet."*
- **Supporting line:** *"Create a public pet profile, save important care
  details, and let finders contact you quickly through a QR smart tag."*
- **Free Profile is the Phase 1 product.** A pet does not need a physical tag to
  have a Safety Profile. The QR + NFC Smart Tag is an optional one-time add-on,
  never a subscription prerequisite. Present QR scanning and NFC tapping as two
  access methods for the same product, especially on the first screen.
- The marketing surfaces (Home, Pricing, Privacy) are **distinct from** the
  public/finder app pages — keep them warm, calm, and trustworthy, and never let
  a marketing page look like the finder safety page.

---

## 8. Home page — current section order

The landing page (`src/app/page.tsx`) tells one story in order: what you get,
what happens when a pet is lost, the two pages a pet gets, the community, the
tag that makes it wearable, what it costs, where to buy, the questions people
ask, and the close. One purpose per section, fewer cards, generous whitespace.

Two conventions hold it together, and both are enforced by the page's own
comments: exactly one `<h1>`, in the hero, with every section below an `<h2>`;
and the only two buttons on the page are the same signup action at the top and
at the close, because a page with seven buttons has no primary action at all.

1. **Hero** — *"A safer way home for your pet."*, the supporting subtitle, the
   primary CTA, a sample profile preview, a three-point trust strip, and one
   plain line stating the Smart Tag's real availability.
2. **Finder journey** — five beats, told as a stranger's story: someone finds
   your pet / they see the tag / they scan or tap / the Safety Profile opens /
   they reach you. Anchor `#how-it-works`. This replaced the separate "why it
   matters" and "how it works" sections, which both explained a process.
3. **The two pages a pet gets** — Share Profile and Safety Profile, side by
   side, with what each shows. Anchor `#pet-profiles`. Plus one line for care
   details. This absorbed the old "core features" section.
4. **Community** — a window, not a feed: three illustrative cards and a link to
   Explore. Rendered only when `socialEnabled`. Anchor `#community`.
5. **Smart Tag** — the one optional one-time add-on (RM39.90). Scanning and
   tapping are two ways into the same Safety Profile, never two products.
   Anchor `#smart-tags`.
6. **Pricing preview** — short: Free Profile and the Smart Tag, with Premium and
   GPS named in one muted line. Status comes from configuration, never a
   hand-written promise. Do not duplicate the full pricing page here.
7. **Where to buy** — renders only once a tag can actually be bought.
8. **FAQ** — a few short answers, including that a finder without NFC can still
   scan the QR code.
9. **Final CTA** — *"A safer way home for your pet."* and the same signup action
   as the hero, worded identically.

> **Do not reintroduce the removed sections from memory.** "Why it matters",
> "How it works" as a separate step list, and the "three pillars (Safety / Care /
> Memories)" feature grouping were all deliberately folded into sections 2 and 3.
> Two of the three pillars simply restated the two profile cards.

---

## 9. Naming

Follow [`../architecture/product-model.md`](../architecture/product-model.md),
which is canonical. In marketing copy specifically:

- `/p/{slug}-{publicCode}` is the **Share Profile** (legal copy may use the
  fuller "Public Share Profile"). **Pet Profile** is the umbrella concept — the
  whole pet record — not the name of that page.
- `/q/{safetyCode}` is the **Safety Profile**. Never "QR Safety Page", "QR
  Safety Profile" or "QR Profile"; QR and NFC name the access technology, not
  the page.
- `/u/{handle}` is the **Community Profile**. Community is about **households**
  — you follow a family, not a pet.
- A `PetMemory` is a **Moment** in anything a reader sees.

---

## 10. Pricing strategy

`/pricing` has four clear cards: Free Profile, Smart Tag Add-ons, Premium Plan
Coming Soon, and GPS Safety Coming Later.

- **Free Profile:** RM0, available now. Includes up to 3 pets, Public Share
  Profile, Safety Profile, WhatsApp/call owner, basic emergency note, Basic Lost
  Mode, Basic QR download, profile photo, shareable pet URL, basic care records,
  and up to 10 pet memories per pet. Basic finder contact is **on the Free
  plan** — never imply finder contact is locked behind Premium.
- **Smart Tag Add-on:** QR + NFC Smart Tag **RM39.90** one-time — the only
  physical tag. It works with the free pet profile, and scanning its QR code or
  tapping it with NFC opens the same Safety Profile. The QR-only QR Pet Tag is
  discontinued and must not appear in any campaign.
- **Premium Plan:** clearly **Coming Soon**. Do not show a monthly Premium
  price, paid-plan CTA, checkout, or payment copy in Phase 1.
- **GPS Safety:** clearly future ("Coming Later"), kept smaller.

The Home pricing preview mirrors this but stays short and links out to
`/pricing`.

---

## 11. Privacy page messaging

`/privacy` is the Phase 1 Privacy Notice. It should be complete enough for the
pet profile, Safety Profile, optional smart tag, manual payment proof, and order
tracking flow, while still feeling friendly and readable on mobile.

Lead with clear owner privacy control and group the Notice into:

- **What may be collected:** account, pet profile, safety/contact, care records,
  memories, smart tag/order/payment proof, finder scan, and technical
  information.
- **What can be public:** pet name, photos, breed/type, general area,
  owner-approved notes, public memories, and finder-friendly Safety Profile
  contact options.
- **What stays private by default:** full address, private notes, private
  memories, account email, full payment proof, private account settings, and
  internal order details.
- **Owner controls and requests:** public visibility choices, retention,
  deletion/update requests, third-party services, cross-border processing, and
  support contact.

---

## 12. Marketing navigation

Public nav (`PublicLayout`) labels: **Home, How It Works, Sample Profile, Smart
Tags, Pricing, Privacy**. "How It Works" → `/#how-it-works`, "Smart Tags" →
`/#smart-tags` (Home anchors with `scroll-mt-*`). Use **"Sample Profile"**, not
"Sample". Collapse into a mobile menu on small screens.

---

## 13. What future agents must not mix up

1. Don't position MyPetLink as a QR/NFC gadget — it's a safety **and** care
   profile. NFC is an optional one-time smart tag add-on, not the hook.
2. Don't make the Home page a cluttered feature dump — keep the 9 sections and
   the 3 feature pillars.
3. Don't imply finder contact costs money — it's free on the Free plan.
4. Don't blur the marketing pages with the public/finder app pages, or the
   Public Share Profile with the QR Safety Profile (see §2).
