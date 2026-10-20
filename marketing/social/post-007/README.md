# TikTok Post 007 — Si Bulus Punya Profil Sendiri

Final media and the complete editable package are stored at:
`D:\Project\MyPetLink\Marketing\Videos\post-007`.

The final is `output/MyPetLink_Post_007_Si_Bulus_Punya_Profil_Sendiri.mp4`.
Cover: `output/MyPetLink_Post_007_Cover.png`. Caption: `output/caption.txt`.
Implementation and review notes: `implementation-report.md` in that folder.

This is a 24-second, 1080 × 1920, 30 fps Malaysian Malay video, using official
Linko artwork, actual mobile application recordings, animated captions and an
original 120 BPM synthesized instrumental. No voiceover is used.

## Edit and rebuild

`index.html` contains all text, layout, colours and animation. `render.mjs`
renders deterministic browser frames and assembles H.264/AAC using the existing
project's Playwright and FFmpeg dependencies. `music.py` contains every music
note and sound generator. `capture.mjs` records the actual isolated local app;
it uses the existing development login, filming data and privacy guard. It
does not supply fabricated API responses or submit media to remote storage.

From the repository root:

```powershell
node marketing/social/post-007/render.mjs --stills
node marketing/social/post-007/render.mjs
```

Re-capture requires the existing local marketing API and web app. The browser
must be installed at the path in the scripts (or set `MYPETLINK_CHROME` for the
renderer). The capture supports `--scene profile|create|photos|share|safety`.
Use `--refresh` on the renderer after re-capturing footage.

The D-drive package has an offline `source/preview.html` with a scrubber and
playback control. Its editable renderer uses `MYPETLINK_REPO_ROOT` to locate
the installed project dependencies. Python with NumPy is needed for music.

No application functionality, API contracts, database schema, migrations or
production settings are changed. No commit, push or deployment is part of
this task.
