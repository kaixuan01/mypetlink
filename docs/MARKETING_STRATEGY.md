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
  when a bound tag is reported `Lost`.
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
