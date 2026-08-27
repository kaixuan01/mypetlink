# Asset capture guide — what MyPetLink produces for you

Eleven of the thirty posts need **no camera at all**. This is how to get those assets.

> **Rule:** use a QA pet on a local or staging environment. Never capture a real
> customer's profile, photo, contact number, or general area for marketing.

---

## 1. Share Cards — the highest-value automatic asset

MyPetLink renders a finished 1080×1350 JPEG with the pet's photo, name, metadata, the
tagline, and a working profile QR. This is a publishable Xiaohongshu image as-is —
the aspect ratio is almost exactly XHS's preferred 3:4.

```bash
curl -o profile-card.jpg "https://mypetlink.com.my/social/pets/{slug}.jpg?variant=share-card"
```

| Variant | Query | Availability |
| --- | --- | --- |
| Profile | `?variant=share-card` | Always |
| Birthday | `?variant=birthday` | **Only on the pet's birthday** |
| Adoption Day | `?variant=adoption` | **Only on the adoption anniversary** |

**Used by:** Posts 16, 17, 18, 25, 29.

### Capturing all five themes for Post 17

Set the QA pet's theme, then fetch the card. Repeat for `default`, `mint`, `peach`,
`sky`, `lavender`. The card follows the pet's Public Profile theme, so you get five
visually distinct cards of the same pet with zero design work — the entire post.

To capture the occasion variants outside their real dates, set the QA pet's birthday and
adoption day to today first.

---

## 2. Page screenshots

Drive a headless browser at **1080×1440** (XHS 3:4) or **375×812** for phone-frame
screen recordings. The existing Playwright scripts in the project scratchpad already do
this; point them at a QA pet.

| Page | Route | Used by |
| --- | --- | --- |
| Public Share Profile | `/p/{slug}` | 11, 13, 20 |
| Safety Profile (finder view) | `/q/{safetyCode}` | 11, 12, 14, 20 |
| Sample profile — no login needed | `/sample` | any "go look" CTA |
| Pricing | `/pricing` | 21 |
| Pet Overview + Sharing & Safety | `/pets/{id}` | 10, 19, 28 |
| Dashboard with occasion strip | `/dashboard` | 18 |

---

## 3. Screen recordings

Record the browser at 375×812, then drop the capture into a phone frame in Canva.

| Flow | What to record | Used by |
| --- | --- | --- |
| Create a pet | Empty dashboard → add pet → completion card rising | 15 |
| Share Center | Share → Share Pet Card → preview appears | 16 |
| Lost Mode | Toggle on → confirm → public pages update → Mark as Found | 19 |
| Care records | Add a record → it appears in the list | 10 |
| Theme switch | Edit → change theme → profile re-renders | 17 |

**Recording tips:** move the cursor slowly and deliberately — real speed looks like a
glitch on video. Pause ~1s on each result before moving on. Record at 2× device scale
factor for a crisp result after XHS compression.

---

## 4. QR code PNG

Download from the app: pet → **Share** → **Show Profile QR** → download. Print it on
plain paper for the physical scanning shots in Session D.

**Used by:** Posts 12, 16.

---

## 5. What you must record yourself

No automation substitutes for these, and they are what make the account feel human:

- Your actual pet, in your actual home
- Your hands, your phone, real scanning
- Your face and voice
- Vet visits, kopitiam cats, moving boxes, the street
- Anything with genuine emotion in it

---

## Pre-publish checklist

Before any asset goes onto Xiaohongshu:

- [ ] No real customer data — QA pet only
- [ ] No real phone number visible
- [ ] No home address; general area only, and ideally a fictional one
- [ ] No stranger's face
- [ ] Clinic names and receipts blurred
- [ ] Usernames blurred in any comment screenshot
- [ ] Nothing on screen says GPS, tracking, or live location
- [ ] No "buy a tag" CTA while tags are Coming Soon
- [ ] Pricing claims match the live `/pricing` page **today**
- [ ] Image is 3:4 (1080×1440) or video is 9:16 (1080×1920)
- [ ] Cover text is readable at thumbnail size
