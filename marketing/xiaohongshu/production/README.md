# MyPetLink Xiaohongshu production toolkit

This folder turns the existing content strategy into a repeatable, privacy-safe capture
and editing workflow. It does not change the MyPetLink application.

## What is here

- `config/visual-system.json` — one brand-aligned 9:16/3:4 visual system.
- `config/capture-scenes.json` — repeatable public and authenticated browser scenes.
- `scripts/capture.mjs` — clean Playwright capture using local Edge/Chrome.
- `scripts/cover.mjs` — deterministic 1080 x 1440 cover rendering.
- `scripts/build.mjs` — FFmpeg assembly, overlays, subtitles, optional audio, and honest
  placeholder scenes when human assets have not been filmed.
- `scripts/check.mjs` — manifest, missing-asset, copy, privacy-text, and output checks.
- `scripts/inspect.mjs` — codec, dimensions, FPS, audio, duration, and file inspection.
- `review/manual-review-checklist.md` — checks automation cannot safely replace.

Dependencies are installed at the repository root. FFmpeg and FFprobe are bundled Node
packages, so a separate system install is not required. Run `npm run xhs:setup` once to
install Playwright's small recording helper. Browser capture then uses an existing Chrome
or Edge installation and does not download another browser.

Capture uses a deterministic 540 x 960 CSS-pixel mobile viewport at 2x device scale. The
saved screenshot and recording are therefore crisp 1080 x 1920 assets while retaining the
app's mobile layout.

## Standard post workspace

Each production post lives in `marketing/xiaohongshu/posts/NNN-slug/`:

```text
brief.md
script.md
shot-list.md
assets-manifest.json
generated/
output/
  preview.mp4
  cover.jpg
  subtitles.srt
  caption.txt
missing-assets.md
```

Asset paths in the manifest are relative to `marketing/xiaohongshu/`. Real footage belongs
under `assets/phone/` or `assets/pet/`; reusable captures belong under `assets/shared/`;
product captures belong under `assets/product/`. Do not copy one clip into several post
folders—reference the same shared path from multiple manifests.

## Commands

Run from the repository root.

```bash
npm run xhs:check -- 001
npm run xhs:cover -- 001
npm run xhs:build -- 001
npm run xhs:inspect -- 001
```

`xhs:check` exits non-zero when required assets are missing. That is expected for an
honest partial prototype. It prints every missing path and never substitutes unrelated
or fabricated footage. `xhs:build` may still build an internal preview; every missing
scene is visibly labelled `待补真实素材`.

## Application capture

Public approved sample experience:

```bash
npm run xhs:capture -- sample-experience -- --base-url https://mypetlink.com.my --mode both
```

Approved public profile or Safety Profile:

```powershell
$env:XHS_PUBLIC_PROFILE_PATH = "/p/approved-sample-slug"
npm run xhs:capture -- public-profile -- --base-url http://localhost:3000 --mode both

$env:XHS_SAFETY_PROFILE_PATH = "/q/approved-sample-code"
npm run xhs:capture -- safety-profile -- --base-url http://localhost:3000 --mode both
```

Authenticated owner capture requires a normal, approved Playwright storage-state file.
The script will not bypass login, and it blocks authenticated capture against the
production hostname.

```powershell
$env:XHS_OWNER_PET_PATH = "/pets/qa-pet-id"
npm run xhs:capture -- owner-pet-profile -- --base-url http://localhost:3000 --storage-state apps/web/playwright/.auth/owner.json --mode both
```

The approved auth-state locations are already gitignored. Never place tokens or browser
profiles under `marketing/`.

## Optional audio

Set `audio.voiceover` and/or `audio.bgm` in a post manifest. Voice is normalized; BGM is
reduced and ducked beneath voice. Music must be supplied by the user and licensed for the
intended use. No music is included in this repository. When neither track exists, previews
contain a silent AAC track so delivery checks remain deterministic.

## Publish gate

A post is publishable only when:

1. `xhs:check` prints `READY`.
2. The manual checklist passes.
3. The prototype badge and placeholder segments are removed by rebuilding from the final
   manifest and real footage.
4. Product claims have been rechecked against the live site on posting day.
