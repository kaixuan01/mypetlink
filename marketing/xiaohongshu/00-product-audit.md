# MyPetLink through the eyes of a first-time Malaysian pet owner

Audited against **live production** (`mypetlink.com.my`), not the roadmap. Everything
below was confirmed from the deployed bundle, the live pages, and the code. This file
exists so nobody writes a post promising something an owner cannot actually do today.

---

## Who we are talking to

**Aina, 27, Puchong.** Adopted a kitten from a rescue two weeks ago. Her whole pet
life lives in WhatsApp groups and her camera roll. She has never used a "pet app".
She is on Xiaohongshu daily for skincare, cafés, and 猫咪 content.

What she actually worries about, in her order of priority:

1. Is my kitten eating/pooping normally? (daily anxiety)
2. What vaccinations does it need, and when? (paperwork anxiety)
3. What if it slips out the door? (background dread — condo corridors, open gates)
4. I want to show my kitten to people without being cringe. (social)

What she is **not** thinking about: "pet identity management", "QR infrastructure",
"digital pet profile". Nobody searches for those. Content must enter through 1–4.

---

## What she can actually do today, free, no purchase

Confirmed live. This is the honest feature set for the first 30 posts.

| Capability | Reality check |
| --- | --- |
| Up to **3 pet profiles** | `planLimits.ts` → `maxPets: 3` |
| **Public Share Profile** (`/p/…`) | Live. The friendly page for friends and family |
| **Safety Profile** (`/q/…`) | **Live.** Finder page with WhatsApp + Call Owner |
| **Share Pet Card** image (1080×1350, QR inside) | Live, always available, no flag |
| **Birthday card** variant | Live, appears only on the pet's birthday |
| **Adoption Day card** variant | Live, appears only on the adoption anniversary |
| **Pet Memories** | Up to **10 per pet** on Free |
| **Care records** | Basic: vaccines, deworming, grooming, vet visits |
| **Lost Mode** | Live. Adds a missing-pet notice to both public pages |
| **5 profile themes** | default, mint, peach, sky, lavender |
| **QR download** | Live, from the Share Center |
| **Sample profile** to browse before signing up | `/sample` — live, no account needed |

## What she CANNOT do today — do not promise these

| Not available | Why it matters for content |
| --- | --- |
| **Smart Tags (physical)** | Pricing page says **Coming Soon** for both RM19.90 QR and RM39.90 QR+NFC. Tag ordering is **switched off** in production. **No post may drive a tag purchase.** Teasing is fine; a buy CTA is not. |
| **Premium** | Coming Soon. No reminders, family access, scan history, unlimited memories, document upload, or advanced themes. |
| **GPS / live tracking** | Deliberately never. The site says plainly: a scan "does not track your pet or reveal a live GPS location." **Correcting this misconception is a content opportunity, not a limitation.** |

## Honest gaps a first-time owner will feel

These are real and worth knowing before we promise anything in a caption.

1. **Almost no social proof yet.** The production sitemap contains a single public pet
   profile. There is no "10,000 Malaysian pet owners" claim to make. The Trust pillar
   has to build credibility from honesty and craft, not from numbers we do not have.
2. **10 memories per pet is tight** for someone documenting a new kitten. Content should
   frame Memories as "the moments worth keeping", not "your whole camera roll".
3. **Care records are basic.** No reminders. Frame as "a record you can hand to a vet",
   not "an app that reminds you".
4. **The two-profile idea needs explaining.** Public Share Profile vs Safety Profile is
   genuinely useful but not self-evident. This is the single best Education topic we have.
5. **Nothing to buy.** That is a *feature* for launch content — everything we show is
   free, so posts never feel like an ad for a purchase.

---

## The three things that actually differentiate us in Malaysia

Every post should ladder up to at least one:

1. **WhatsApp-first finder contact.** A finder taps one button and is in WhatsApp with
   the owner. This is exactly how Malaysians already communicate. No app download for
   the finder.
2. **General area, never a full address.** The owner shows "Ampang, KL", not their home.
   Malaysian owners are rightly cautious about publishing where they live.
3. **Two pages, two jobs.** The page you send your friends is not the page a stranger
   sees. Nothing else in the local market draws that line.

---

## Content guardrails

- **Never** say "GPS", "tracker", "track your pet", or imply live location.
- **Never** put a "buy a tag" CTA in these 30 posts. Tags are Coming Soon.
- **Never** invent a lost-pet-reunion story. If we tell one, it is real and consented, or
  it is clearly labelled a demonstration.
- **Never** show a real phone number, real home address, or a real stranger's face.
- Free means free. Say "免费" plainly and do not add asterisks we do not have.
- Malaysian specifics only: RM, WhatsApp, condo/landed, local vet norms, MCO-era adoption
  wave, Malaysian street cat culture.
