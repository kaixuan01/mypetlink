# MyPetLink marketing demo profile and capture

The official-looking **MyPetLink** account and both brand mascots, **Linko** and
**Linky**, built locally so launch videos, Reels and screenshots show the real
product with real brand artwork instead of a test fixture.

Everything here is development-only. The account cannot be created on a deployed
host, and nothing it produces is uploaded anywhere.

---

## What gets created

### The brand account

| | |
|---|---|
| Account email | `marketing.demo@mypetlink.local` (a reserved domain that can never receive mail) |
| Community display name | **MyPetLink** |
| Handle | **@mypetlink** |
| Bio | Helping pets stay identifiable, safer and connected. 🐾 |
| Avatar | The official MyPetLink brand mark |
| General area | Kuala Lumpur |
| Social | Enabled and discoverable |

### The two mascots

Both come from the official IP board and are never merged or swapped.

| | **Linko** | **Linky** |
|---|---|---|
| Role | The Curious Connector | The Loyal Guardian |
| Species | Cat | Dog |
| Breed | Domestic Shorthair | Kampung Dog (Malaysian Local Dog) |
| Personality | Playful, Clever, Curious | Loyal, Protective, Affectionate |
| Safety Profile | `/q/linkodemo` | `/q/linkydemo` |
| Public Share Profile | `/p/linko-linkodemo` | `/p/linky-linkydemo` |
| Story dates | Born 16 Jun 2022, adopted 16 Sep 2022 | Born 28 Feb 2025, adopted 16 Mar 2025 |

Personalities are the IP board's own words. Linky's dates come from his story
document — found under a banana leaf on 15 March 2025, adopted the next day.

### Five Moments

| Title | Subjects | Theme |
|---|---|---|
| Meet Linko 🐾 | Linko | The Curious Connector |
| Meet Linky 🐾 | Linky | The Loyal Guardian |
| Connect • Protect • Reunite | **Linko + Linky** | The brand line, quoted from the board |
| Every pet deserves a safe way home | Linky | Identity, safety, connection |
| Small tag, big connection 🏷️ | Linko | The Smart Tag |

Each Moment's **story date** is historical; its **published date** is spread over
the last fortnight, so the Community feed reads like an account posting over time
rather than five rows written in the same second.

The third Moment is about both mascots. It is a genuine multi-pet Moment — two
`MomentPets` rows against one primary pet — so it exercises that path properly
and costs one allowance, not two.

### Two things worth knowing

**@mypetlink is a reserved handle.** `OwnerHandleRules` reserves it precisely so
that no owner can present themselves as us, and the self-service handle screen
still refuses it after this account exists. The seeder takes it through
`AssignReservedHandleAsync` — the audited, administrator-only path that was built
for exactly this account — and leaves the reservation in place.

**Neither mascot has a medical history.** No conditions, medication, allergies
or emergency contact are invented. A fabricated health record on a page people
read as ours is a lie about a real product, not a prop. Each has a safety note,
which is finder guidance about temperament and says nothing about health. The one
phone number on the account is `+60 11-1000 0000`: an all-zero subscriber number
that cannot be allocated to anybody.

**Linko and Linky are different characters.** Linko is the orange tabby cat;
Linky is the black-and-white kampung dog. The IP files named
`Linky_1_FirstMeet`, `Linky_2_Playdate` and `Linky_3_FirstDayHome` are Linky's
own story and must never be used for Linko. `scripts/asset-map.mjs` records which
file is which, and a test asserts the two pets never share a photograph.

---

## Prerequisites

- Node 22+ and .NET 8 SDK
- SQL Server LocalDB (or any SQL Server the API can reach)
- Google Chrome or Microsoft Edge, for recording
- `npm install` at the repository root
- The official IP folder, only if you need to rebuild the images

No credentials to store. The `marketing-demo` launch profile carries everything
the API needs, and every switch it sets is inert outside Development. The one
optional setting is where recordings are written — see
[Where the video goes](#where-the-video-goes).

---

## First-time setup

### 1. Create the filming database

Filming uses **its own database**, separate from your working one:

```bash
dotnet ef database update --project apps/api/MyPetLink.Api --connection "Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkMarketingDemo;Trusted_Connection=True;TrustServerCertificate=True;"
```

This is not fussiness. Your development database also carries the walkthrough
social world — a missing dog, four unrelated households, a wall-of-text caption —
and every one of those lands in shot behind the brand account on a Community
recording. A database is either for walking the product or for filming it, so
starting the API with the marketing profile deliberately skips the walkthrough
seeder.

### 2. Prepare the images (optional)

The prepared images are committed, so this is only needed when the IP masters
change:

```bash
npm run marketing:assets -- --ip-root "<path to the official 02_IP folder>"
```

It reads the masters, writes web-sized JPEGs into `marketing/demo/assets/`, and
records where each came from in `manifest.json`. The originals are never
modified.

---

## Running it

### Seed the demo profile

```bash
npm run marketing:api
```

Starts the API on `http://localhost:5281` against the filming database and seeds
the profile on startup. Look for `Seeded the marketing demo profile: @mypetlink
with mascots Linko and Linky.` Running it again finds the account and does
nothing.

The same process also serves the demo images at
`http://localhost:5281/dev-marketing-media/`, which is how the pictures reach
the pages without anything being uploaded.

### Start the website

In a second terminal:

```bash
npm run dev:web
```

`apps/web/.env.local` needs `NEXT_PUBLIC_API_BASE_URL=http://localhost:5281` and
`NEXT_PUBLIC_SOCIAL_ENABLED=true`.

### Record the clips

With both running:

```bash
npm run marketing:capture -- mpl-v001
```

One scene at a time, when you are adjusting timing:

```bash
npm run marketing:capture -- mpl-v001 --scene safety-profile-linky
```

### Start over

```bash
npm run marketing:reset
```

Removes the demo account from the filming database by its fixed identifiers and
nothing else. Restart the API to rebuild it.

---

## Where the video goes

Recordings are large and this repository sits on an SSD better spent on source,
so the output root is configuration. It is resolved in this order, and the
capture prints which one it used before recording anything:

1. `--output-dir <path>` on the command line, for a one-off.
2. The `MYPETLINK_MARKETING_OUTPUT_ROOT` environment variable.
3. `marketing/demo/output-root.local` — one line holding a path. Git-ignored, so
   each machine sets its own without touching a tracked file. **This is the
   normal way to configure it.**
4. `marketing/demo/output/` inside the repository, with a warning printed.

The batch name is appended to the root, so one root holds every batch side by
side. On this machine `output-root.local` contains
`D:\Project\MyPetLink\Marketing\Captures`, so a batch lands in
`D:\Project\MyPetLink\Marketing\Captures\MPL-V001`.

To point somewhere else for a single run:

```bash
MYPETLINK_MARKETING_OUTPUT_ROOT=E:\Elsewhere npm run marketing:capture -- mpl-v001
```

No personal path appears in any tracked file, and a fresh clone with nothing
configured still records — it just says where the files went.

## What you get

In the batch folder (`…/MPL-V001/`):

| Clip | Page | Length |
|---|---|---|
| `mpl-v001-safety-profile-linko.webm` | Linko's Safety Profile | ~5.8s |
| `mpl-v001-safety-profile-linky.webm` | Linky's Safety Profile | ~5.4s |
| `mpl-v001-mypetlink-profile.webm` | The MyPetLink Community profile | ~6.4s |
| `mpl-v001-community.webm` | Community discovery | ~6.3s |
| `mpl-v001-mascot-moment.webm` | The Moment about both mascots | ~4.0s |

Each also has a `.mp4` (H.264, same frames) and a `.png` of the opening frame.

Everything is **1080×1920, 30fps, no audio**, ready to drop onto a 9:16 Canva
timeline. The page is rendered at a genuine 540×960 mobile viewport at 2x device
pixel ratio, so the layout is the real responsive one rather than a desktop page
squeezed into a phone shape — no scaling is applied anywhere in the pipeline.

The clips are already trimmed to the scripted movement: Playwright records from
the moment the tab opens, so the page load and teardown are cut off and what is
left is the performance.

If you need something other than H.264 or VP9:

```bash
npx ffmpeg -i mpl-v001-safety-profile-linko.webm -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4
```

### Adjusting the timing

Scene timing lives in `config/capture-scenes.json` as waits and eased scrolls.
The capture reports each clip's length and tells you when one falls outside its
target range. Lengthen or shorten that scene's waits and record it again with
`--scene`.

---

## The guard rails

- **The capture refuses any host but localhost.** The only thing between
  "record the brand profile" and "record whatever is on production right now,
  including a real customer's pet" is that check.
- **The capture refuses to record contact details.** It scans the page before
  and after the performance and fails on anything resembling an email address or
  a Malaysian phone number. The demo's own synthetic number is allowlisted as an
  exact string, so every *other* number still stops the recording.
- **Each scene asserts what must be on screen.** A skeleton, an empty state or a
  page served without the API fails the capture instead of producing an
  unusable clip.
- **The Next.js development indicator is hidden while recording** — hidden for
  the recording only, not switched off in `next.config`.
- **The seeder cannot run outside Development.** `IsDevelopment()`, the `DevAuth`
  opt-in and `MarketingDemo:Enabled` must all agree, and a non-Development host
  configured to enable it fails to start rather than quietly ignoring the
  setting.
- **Demo media never reaches production storage.** A local machine is usually
  pointed at the real Cloudflare bucket and the live media domain, so the seeder
  bypasses the upload path entirely and writes absolute loopback URLs. A media
  base that is not loopback is a startup failure.

---

## Files

```
marketing/demo/
  README.md                     this file
  assets/                       prepared images (committed) + manifest.json
  config/capture-scenes.json    scenes, timing, target lengths, allowlist
  scripts/asset-map.mjs         which IP file becomes which demo asset
  scripts/prepare-assets.mjs    rebuilds assets/ from the IP masters
  scripts/capture.mjs           records the clips
  scripts/output-root.mjs       resolves where recordings are written
  scripts/reset.sql             removes the demo account
  output-root.local             this machine's output path (git-ignored)
```

Recordings themselves live outside the repository — see [Where the video goes](#where-the-video-goes).

API side: `Services/MarketingDemoSeeder.cs`, `Common/MarketingDemoOptions.cs`,
the `marketing-demo` profile in `Properties/launchSettings.json`, and the
`MarketingDemo` section of `appsettings.Development.json`.

---

## A note on the artwork

The two profile photographs are crops of the official IP board, and that is
deliberate. Linko and Linky sit side by side in the Pets row of the brand
profile, so their portraits have to read as a pair — and the board is the only
place both characters are drawn in the same style, lighting and pose: sitting,
waving, wearing the navy collar and the round MyPetLink tag. Linko's richer 3D
art and Linky's illustrated story scenes go into the Moments instead, where each
is shown on its own and has room for the detail.

`scripts/asset-map.mjs` records which IP file becomes which demo asset, with the
crop regions, so nobody has to guess from a filename.
