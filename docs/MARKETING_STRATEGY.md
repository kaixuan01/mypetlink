# MyPetLink Marketing Strategy

> Read [`AI_AGENT_REFERENCE.md`](./AI_AGENT_REFERENCE.md) first. This document
> covers product **positioning** and how the two public surfaces map to two
> different audiences. For the technical routing rules see
> [`PUBLIC_PROFILE_ROUTING.md`](./PUBLIC_PROFILE_ROUTING.md).

---

## 1. Core promise

**A safer way home for your pet.** Every pet gets a smart tag and a public
profile so a finder can reunite a lost pet with its owner in seconds — and so
owners have a friendly place to celebrate their pet.

---

## 2. Two public surfaces, two audiences

These are **different pages with different jobs**. Never blur them in product,
copy, or campaigns.

| Surface | Route | Audience | Emotional job | Primary action |
| ------- | ----- | -------- | ------------- | -------------- |
| **Public Share Profile** | `/p/{petSlug}-{publicCode}` | Friends, family, social media, pet communities | Pride, delight, community | **Share** |
| **QR/NFC Safety Profile** | `/t/{tagCode}` | A stranger who just scanned a physical tag on a found pet | Urgency, trust, "help me get home" | **I found this pet — Contact Owner** |

- The **Share Profile** is the IG-style page an owner *chooses* to send. It is
  warm and clean: photo, name, bio, public memories, timeline, care badges. It
  is **not** emergency-first. Its only finder behaviour is a **Lost Mode** banner
  when pet-level `lostModeEnabled` is on.
- The **Safety Profile** is the page a finder *lands on* from a QR/NFC scan. It is
  finder-first: big contact CTA, WhatsApp/Call/Send Found Location, emergency and
  safety notes, minimal lifestyle content.

Marketing must reinforce this split. "Share with your community" = `/p/`.
"If your pet is ever lost, a finder scans the tag" = `/t/`.

---

## 3. What each surface should never say

**Share Profile must not** lead with "I found this pet", "Send Found Location",
emergency wording, or QR/safety-page language by default.

**Safety Profile must not** be overloaded with memories, timeline, or lifestyle
content that slows a finder down.

---

## 4. The smart tag is the hook

One physical tag = one **TagCode** (`MPL-XXXX-XXXX`). Retail packaging, QR, NFC,
and owner UI all show the same TagCode (see `SMART_TAG_PRODUCT_STRATEGY.md`).
Campaigns should make the scan-to-reunite story concrete: scan → safety page →
contact owner. Never market an internal id, short token, or `/p/{slug}`-only URL.

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
- **QR is the MVP / main product.** A plain QR tag (or just the shareable
  profile) is all most owners need. **QR + NFC is a premium upgrade**, never
  required. Do not over-emphasize NFC, especially not on the first screen.
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
6. **Smart Tag add-on** — *"Start with QR. Upgrade to QR + NFC."* Two options:
   QR Pet Tag (everyday) and QR + NFC Smart Tag (premium). NFC must not look
   required. Anchor `#smart-tags`.
7. **Pricing preview** — short: Free / Premium / Smart Tag Add-ons + a **View
   Pricing** CTA. Do not duplicate the full pricing page here.
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

`/pricing` has **three sections**: Plans → Physical tag add-ons → Coming later.

- **Free:** *"Free forever, with basic finder contact included."* Basic finder
  contact (WhatsApp/call owner, emergency note) is **on the Free plan** —
  never imply finder contact is locked behind Premium.
- **Premium (RM19.90/mo):** multi-pet care, reminders, records, lost mode, scan
  history, documents, family access, richer memories.
- **Add-ons:** QR Pet Tag **RM19.90**, QR + NFC Smart Tag **RM39.90**. Copy:
  *"One-time purchase. Works with Free or Premium."*
- **GPS Safety:** clearly future ("Coming Later"), kept smaller.

The Home pricing preview mirrors this but stays short and links out to
`/pricing`.

---

## 11. Privacy page messaging

`/privacy` is a friendly explainer (card/icon rows), **not** a legal text wall.
Lead with *"Privacy-first pet profiles"* and group into:

- **What can be public:** pet name, photos, breed/type, general area,
  owner-approved notes, public moments.
- **What stays private:** full address, private notes, private memories, account
  details, internal records.
- **Owner controls (off until enabled):** WhatsApp, call, public memories, life
  timeline, care badges, safety notes.
- Short explainers for the finder safety page, found-location sharing, and how
  care records/memories stay private until marked public.

---

## 12. Marketing navigation

Public nav (`PublicLayout`) labels: **Home, How It Works, Sample Profile, Smart
Tags, Pricing, Privacy**. "How It Works" → `/#how-it-works`, "Smart Tags" →
`/#smart-tags` (Home anchors with `scroll-mt-*`). Use **"Sample Profile"**, not
"Sample". Collapse into a mobile menu on small screens.

---

## 13. What future agents must not mix up

1. Don't position MyPetLink as a QR/NFC gadget — it's a safety **and** care
   profile. NFC is a premium add-on, not the hook.
2. Don't make the Home page a cluttered feature dump — keep the 9 sections and
   the 3 feature pillars.
3. Don't imply finder contact costs money — it's free on the Free plan.
4. Don't blur the marketing pages with the public/finder app pages, or the
   Public Share Profile with the QR Safety Profile (see §2).
