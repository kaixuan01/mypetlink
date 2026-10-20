# October 2026 social posts: Instagram, Threads, TikTok

Two educational posts taken from the [competitive brief](../../competitive-brief-2026-10.md):

| Post | Copy and captions | Carousel | Video |
| --- | --- | --- | --- |
| Lost pet? Your first 72 hours | [01-lost-pet-72-hours.md](01-lost-pet-72-hours.md) | 8 slides | 44s |
| QR, NFC, AirTag or GPS? | [02-qr-nfc-airtag-gps.md](02-qr-nfc-airtag-gps.md) | 10 slides | 53s |

## Files

- `content.mjs`: all on-slide text, in one place. Edit it, then re-render.
- `render.mjs`: renders both formats from the same templates.
- `assets/`: mascot cutouts (backgrounds removed from the official renders in
  `marketing/demo/assets/`).

Rendered media is written outside the repository, to
`D:\Project\MyPetLink\Marketing\Videos\2026-10-social\<post>\` on this machine (the folder
beside `marketing/demo/output-root.local`):

```text
carousel/slide-01.png …   1080 x 1350 (4:5): Instagram, Threads, TikTok photo mode
video.mp4                 1080 x 1920, 30 fps, H.264, silent stereo AAC track
video-cover.jpg           opening frame, for the Reel cover
```

## Rebuild

From the repository root (needs local Chrome or Edge and an internet connection for the
brand fonts):

```bash
node marketing/social/2026-10-posts/render.mjs
```

Options: `--post 01` renders a single post; `--only carousel`, `--only video` or `--only stills`
(the final frame of each video scene, for a quick review) renders one format; and `--out DIR` changes the output folder. The carousels take a few seconds; the
videos take a few minutes, because every frame is captured.

## Before posting

1. **Add music in the app.** The videos are silent on purpose: tracks from the Instagram and
   TikTok libraries are licensed for use there, and posts with sound tend to get more reach.
   Keep the music low; the text carries the message.
2. **Re-check product facts on the day** (price, "available now", free-plan limit) against
   mypetlink.com.my/pricing.
3. **Instagram:** post the carousel first, because it's the one people save. Post the Reel 3–4
   days later with a different first line in the caption. Add the alt text from the copy
   file.
4. **TikTok:** post the video. The carousel also works as a TikTok photo post.
5. **Threads:** post the text from the copy file with the carousel images attached.
6. The mascots are presented as mascots. Never caption Linko or Linky as a real lost or found
   pet.
