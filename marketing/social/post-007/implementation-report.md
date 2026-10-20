# MyPetLink TikTok Post 007

Delivered in `D:\Project\MyPetLink\Marketing\Videos\post-007`.

## Creative and storyboard

24 seconds, Malaysian Malay, portrait 9:16. Large captions make the story
understandable without audio. Linko is presented as the official illustrated
mascot throughout, never as a real customer's cat or a recovery testimonial.

| Time | Message | Visual and motion |
| --- | --- | --- |
| 0–3s | Kucing korang ada profil sendiri belum?! | Immediate full hook, expressive official Linko, gentle punch-in, floating punctuation and playful speech sticker. |
| 3–7s | Kenalkan MyPetLink! | Actual completed Linko Share Profile, eased scrolling and moving phone frame; photo and name remain prominent. |
| 7–12s | Buat profil digital si bulus — PERCUMA! | Actual Add Pet form: name entry, Cat selection, photo selection and local preview. Free-plan allowance caption. |
| 12–14s | Simpan gambar | Actual Moments tab click and scroll into the existing Linko photo Moment. |
| 14–16s | Kongsi profil | Actual Copy Link click, visible “Profile link copied.” confirmation, clipboard destination verified. |
| 16–18s | Info penting, semua di satu tempat | Actual Safety Profile contact action and safety note, with an explicit owner-control privacy caption. No contact action is clicked. |
| 18–24s | Jom buat profil kucing korang sekarang! | Celebrating Linko, official logo, compact completed profile, PERCUMA badge, three-pet allowance, no-tag-required message, domain and requested tagline. |

The same Share Card is never repeated. The final small completed-profile
preview intentionally returns as the benefit behind the call to action.

## Assets and rights

- Official transparent mascot masters: `docs/branding/assets/mascots/linko-hero-master.png`
  and `linko-celebrate-master.png`; reused unchanged.
- Official `apps/web/public/logo-horizontal.svg`; reused unchanged.
- Existing isolated filming account and Linko media from `marketing/demo/assets/`.
  Provenance is recorded in that folder's existing `manifest.json`.
- New recordings of the actual locally running Next.js app backed by the
  existing marketing SQL Server database. No replacement API responses,
  fabricated product screens or external customer accounts are used.
- Original “Oyen Pop”, 120 BPM: every note, bass, mallet, percussion and accent
  synthesized from the included `music.py`. No third-party song, recording,
  sample, stock-music library or voice model is used. The composition and
  recording were created for this deliverable. No external music licence is
  required for incorporated third-party recordings because there are none.
- Poppins ExtraBold/SemiBold from the official Google Fonts repository,
  included with the SIL Open Font License (`assets/OFL.txt`). Emoji glyphs
  are rendered by the installed Windows system font, not a downloaded sticker pack.

## Product verification and limitations

The current [public pricing page](https://mypetlink.com.my/pricing), checked
19 October 2026, confirms RM0 profiles, up to three pets, Share Profile, Safety
Profile, profile photo and up to ten Moments per pet. The local free-plan
baseline agrees (`apps/web/src/lib/planLimits.ts`). Smart Tags are optional.
No Premium, GPS tracking, automatic recovery or Community participation is
promoted.

Reviewed the canonical product model, app reference, root/web agent rules,
existing marketing workflow, owner sharing code and Add Pet form before
production. Root README and some historical planning text describe older
implementation stages; the current API and canonical product model were used.
`Project-design-doc.md` is not present under that name.

**The photo step shows real file selection and the app's real local preview.**
The form is not submitted and no new pet or photo is saved. The completed
Linko profile shown elsewhere is the existing seeded marketing example.
This avoids uploading filming material to live Cloudflare storage. There is
no invented save confirmation or claim that a storage upload was demonstrated.

The screen recordings use a real 430 × 700 CSS-pixel mobile viewport, then
are cropped and enlarged inside the composition. The high-resolution 2× stills
are included separately. Product microcopy is naturally smaller/softer than
the large captions. The output itself is native 1080 × 1920. No physical-phone
camera footage or voiceover is included.

The local filming database reports an existing schema mismatch in an unrelated
Community restriction-expiry worker. The selected profile, form, Moments,
copy and Safety screens loaded successfully; no schema or application changes
were made to suppress that issue. The non-prebuilt Linko public routes return
a development document status of 404 before resolving their real API-backed
client content; no error page or loading state is included in the edit.

## Scope and access impact

- Frontend: recordings of Add Pet, Share Profile, Moments and Safety Profile;
  no production component or route change.
- API: existing development sign-in and public pet, Moment and safety reads;
  no endpoint, response contract or permission change.
- Database: existing isolated filming data only; no migration, schema change,
  production data update or new pet submission.
- Security/privacy: authenticated capture stays on localhost; supplied
  privacy guard checks screen text. Clipboard content is verified locally.
  No external message is sent, no real owner contact is recorded, and no
  auth token is included in source or deliverables.
- No commit, push, deployment or social-platform upload was performed.

## Files, editing and checks

`output/` holds the MP4, 1080 × 1920 PNG cover, caption and SRT. The MP4 has
burned-in captions; SRT is supplied for editing and should not be added again
as a second visible caption layer.

`source/index.html` is the editable composition. `source/preview.html` has
play/pause and a scrubber, using the captured frames and music offline.
`source/render.mjs` rebuilds the export using the existing project dependencies;
set `MYPETLINK_REPO_ROOT` if the repository moves. `music.py` needs Python and
NumPy. Chrome is required. Recordings, frame images, mascot art, fonts and
verification records are included in the editable package.

Review covers opening, each scene, final CTA and cover; primary copy is kept
away from the right-side action rail and lower caption area. UI content can
continue under those areas, so all essential claims are repeated in the
large overlay captions. The short Safety scene is supplementary to the free
profile message. Automated output verification is in `source/final-review.json`.

## Upload settings

Use TikTok's own-brand content disclosure when posting this MyPetLink
promotion, as required by its [Community Guidelines](https://www.tiktok.com/community-guidelines).
The artwork is an illustrated mascot and the music is synthesized; no realistic
human or synthetic voice appears. Enable AI-generated-content disclosure for
transparency if the supplied mascot renders are AI-originated. TikTok requires
labels for realistic AI-generated images, audio or video; see its
[official explanation](https://newsroom.tiktok.com/new-labels-for-disclosing-ai-generated-content).
These are account-side settings and are not embedded switches in an MP4.

The Malay caption includes a direct registration CTA, a conversational question
and five relevant hashtags. No extra stock music needs to be added to upload.
