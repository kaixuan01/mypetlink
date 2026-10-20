# MyPetLink TikTok Post 007 V2

Final video: `D:\Project\MyPetLink\MyPetLink_TikTok_Post_007_v2.mp4`.
Complete production folder: `D:\Project\MyPetLink\Marketing\Videos\post-007-v2`.
The original `MyPetLink_TikTok_Post_007.mp4` is preserved and hash-checked.

V2 keeps Linko, Poppins, MyPetLink colours, the opening and real product
material. It removes blue wipes, trims the form sequence, holds Moments for
four seconds, replaces the Copy Link scene with a genuine Share Card flow
and four-second card showcase, then shows the card's actual QR opening Linko's
public Share Profile in an anonymous browser, before the four-second CTA.
There is no Safety Profile or physical-tag demonstration.

See `timeline.md`, `implementation-report.md`, `source/final-review.json` and
`source/playback-review.json` in the production folder for the final timing,
authenticity evidence, limitations and export/playback checks.

## Editing

`source/index.html` contains all scene copy, layout, timings and animation.
`source/preview.html` provides an offline timeline scrubber and music playback.
`source/render.mjs` renders the 28-second MP4 from the clean original assets.
`source/music.py` extends the original arrangement by two bars at 120 BPM,
ending with G → C and a fade. Neither the audio nor the whole video is slowed.

The renderer uses the existing repository's Node dependencies (Playwright,
FFmpeg) and local Chrome. Python with NumPy is required for music. Set
`MYPETLINK_REPO_ROOT` if the repository moves, then run:

```powershell
node "D:/Project/MyPetLink/Marketing/Videos/post-007-v2/source/render.mjs"
```

To review stills only, append `--stills`. No website build is needed.
`capture.mjs` documents and repeats the real public brand-profile card capture;
it needs internet and the existing local marketing app for the Moment.
`capture-public-journey.mjs` reads the original card QR and opens its decoded
address in a fresh anonymous browser, retaining the real destination screenshot
and recording. The video scan line is editorial; no phone-camera UI is simulated.
Existing V1 form/result captures are included, so rebuilding does not require
an owner sign-in, creating a pet, or changing any application data.

`subtitles.srt` is an editing sidecar; the MP4 already contains its captions.
Do not add it as another visible caption layer when uploading.

Only marketing production assets were changed. No application functionality,
API contract, schema, migration or deployment was changed. No commit or push.
