# MyPetLink Marketing Strategy

> Read [`AI_AGENT_REFERENCE.md`](./AI_AGENT_REFERENCE.md) first. This document
> covers product **positioning** and how the two public surfaces map to two
> different audiences. For the technical routing rules see
> [`PUBLIC_PROFILE_ROUTING.md`](./PUBLIC_PROFILE_ROUTING.md).

---

## 1. Core promise

**A safer way home for your pet.** Every pet can start with a free public
profile and pet-level QR Safety Page so a finder can contact the owner quickly.
Physical QR and QR + NFC smart tags are optional one-time add-ons for owners who
want extra safety on a collar.

---

## 2. Two public surfaces, two audiences

These are **different pages with different jobs**. Never blur them in product,
copy, or campaigns.

| Surface | Route | Audience | Emotional job | Primary action |
| ------- | ----- | -------- | ------------- | -------------- |
| **Public Share Profile** | `/p/{petSlug}-{publicCode}` | Friends, family, social media, pet communities | Pride, delight, community | **Share** |
| **QR Safety Page** | `/q/{safetyCode}` or active `/t/{tagCode}` | A stranger who opened a pet QR page or scanned a physical tag on a found pet | Urgency, trust, "help me get home" | **I found this pet — Contact Owner** |

- The **Share Profile** is the IG-style page an owner *chooses* to send. It is
  warm and clean: photo, name, bio, public memories, timeline, care badges. It
  is **not** emergency-first. Its only finder behaviour is a **Lost Mode** banner
  when pet-level `lostModeEnabled` is on.
- The **QR Safety Page** is the page a finder *lands on* from a pet-level QR
  link (`/q/{safetyCode}`) or an active physical tag (`/t/{tagCode}`). It is
  finder-first: big contact CTA, WhatsApp/Call/Send Found Location, emergency
  and safety notes, minimal lifestyle content.

Marketing must reinforce this split. "Share with your community" = `/p/`.
"If your pet is ever lost, a finder opens the QR Safety Page" = `/q/`; active
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

- **Core message:** *"A safer profile for your pet."*
- **Supporting line:** *"Create a public pet profile, save important care
  details, and let finders contact you quickly through a QR smart tag."*
- **Free Profile is the Phase 1 product.** A pet does not need a physical tag to
  have a QR Safety Page. Physical QR and QR + NFC smart tags are optional
  one-time add-ons, never a subscription prerequisite. Do not over-emphasize NFC,
  especially not on the first screen.
- The marketing surfaces (Home, Pricing, Privacy) are **distinct from** the
  public/finder app pages — keep them warm, calm, and trustworthy, and never let
  a marketing page look like the finder safety page.

---

## 8. Home page — required section order

The landing page (`src/app/page.tsx`) must keep this exact nine-section flow.
Do not reorder, merge sections into a feature dump, or reintroduce many small
cards per section. One purpose per section, fewer cards, generous whitespace.

1. **Hero** — title *"A safer profile for your pet."*, the supporting subtitle,
   primary CTA **Create Free Pet Profile**, secondary CTA **View Sample
   Profile**, one clean profile mockup. Calm and premium, not a wall of stats.
2. **Why it matters** — 3 cards: pets can get lost / finders need quick contact
   / your details stay protected.
3. **How it works** — 4 steps: create profile / choose what is public / share or
   order a smart tag / finder scans and contacts you. Anchor `#how-it-works`.
4. **Public Share Profile vs QR Safety Profile** — explain the two surfaces
   (see §2) with their real routes.
5. **Core features** — grouped into exactly **3 pillars**: Safety, Care,
   Memories (see §9). Never a flat 7-item feature list.
6. **Smart Tag add-on** — optional one-time add-ons: QR Pet Tag (RM19.90) and
   QR + NFC Smart Tag (RM39.90). NFC must not look required. Anchor
   `#smart-tags`.
7. **Pricing preview** — short: Free Profile / Smart Tag Add-ons / Premium
   Coming Soon / GPS Coming Later + a **View Pricing** CTA. Do not duplicate the
   full pricing page here.
8. **FAQ** — a few short answers, including that NFC is optional.
9. **Final CTA** — *"A safer way home for your pet."* + Create Free Pet Profile.

---

## 9. Feature pillars — only three

Marketing always groups features into **three pillars**, never a long flat list:

- **Safety:** QR safety profile, WhatsApp/call contact, emergency note, general
  area (not full address).
- **Care:** care records, reminders, medication/allergy notes, vet visit history.
- **Memories:** pet moments, public/private memories, life timeline, shareable
  profile.

---

## 10. Pricing strategy

`/pricing` has four clear cards: Free Profile, Smart Tag Add-ons, Premium Plan
Coming Soon, and GPS Safety Coming Later.

- **Free Profile:** RM0, available now. Includes up to 3 pets, Public Share
  Profile, QR Safety Page, WhatsApp/call owner, basic emergency note, Basic Lost
  Mode, Basic QR download, profile photo, shareable pet URL, basic care records,
  and up to 10 pet memories per pet. Basic finder contact is **on the Free
  plan** — never imply finder contact is locked behind Premium.
- **Smart Tag Add-ons:** QR Pet Tag **RM19.90** one-time; QR + NFC Smart Tag
  **RM39.90** one-time. They work with the free pet profile and open the same QR
  Safety Page.
- **Premium Plan:** clearly **Coming Soon**. Do not show a monthly Premium
  price, paid-plan CTA, checkout, or payment copy in Phase 1.
- **GPS Safety:** clearly future ("Coming Later"), kept smaller.

The Home pricing preview mirrors this but stays short and links out to
`/pricing`.

---

## 11. Privacy page messaging

`/privacy` is the Phase 1 Privacy Notice. It should be complete enough for the
pet profile, QR Safety Page, optional smart tag, manual payment proof, and order
tracking flow, while still feeling friendly and readable on mobile.

Lead with clear owner privacy control and group the Notice into:

- **What may be collected:** account, pet profile, safety/contact, care records,
  memories, smart tag/order/payment proof, finder scan, and technical
  information.
- **What can be public:** pet name, photos, breed/type, general area,
  owner-approved notes, public memories, and finder-friendly QR Safety Page
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
