# MyPetLink Post 007 V2 — corrected sharing journey

Final video: `D:\Project\MyPetLink\MyPetLink_TikTok_Post_007_v2.mp4`.

**28 seconds · 1080 × 1920 · 9:16 · 30 fps · H.264 / AAC stereo.**

## Final story and changes

**Create a free profile → keep cute Moments → open the Share Card → a friend
visits the public Share Profile → register.**

The Safety Profile scene is removed completely. The 20–24s replacement shows
the **existing Share Card QR**, followed by its **actual public Share Profile
destination**, opened in a fresh anonymous browser. The destination has matching
royal Linko artwork and name. The frame includes the public header, cover,
portrait, pet name and metadata; its crop ends above the incidental Smart Tag
badge. No product DOM or privacy settings were changed.

Linko, brand colours, Poppins, the original music and all other agreed pacing
remain. Clean cuts replace the blue wipes. No captions are placed over earlier
burned-in captions. Primary promotional captions stay within two lines.

| Time | Scene |
| --- | --- |
| 0–3s | “Kucing korang dah ada profil sendiri?” with the existing Linko hook |
| 3–6s | “Kenalkan MyPetLink!” and a genuine completed Share Profile |
| 6–10s | Real name/photo form states, followed by a two-second completed example; PERCUMA |
| 10–14s | Fully loaded existing Linko Moment, held for four seconds |
| 14–15s | Genuine Share Pet Card entry and click indicator |
| 15–16s | Genuine loaded Share Card preview |
| 16–20s | Original Share Card JPEG, held steadily for four seconds at 4:5 proportions |
| 20–20.8s | Original card QR enlarged, with a brief editorial scan line |
| 20.8–24s | Real anonymous visit to the decoded Share Profile address; “Kawan-kawan pun boleh tengok profilnya! 🐾” |
| 24–28s | Linko, free-profile invitation and stable mypetlink.com.my CTA |

## Verified Share Card behaviour

Reviewed the current `ShareCenter`, `PetShareCard`, `publicProfileSocial`,
`PublicProfileSocialCardRenderer`, and owner-sharing documentation before
editing. Owners open **Share → Share Pet Card** from the dashboard, pet detail
or their own Share Profile. Visitors use **Share profile → Share Pet Card**.
The same card component supports Save Image, full-image viewing, copying the
profile link and device sharing where the browser supports it.

The genuine server-generated card is a **1080 × 1350 JPEG** containing hero
art, a circular portrait, logo, pet name, metadata, a tagline, a scannable
Share Profile QR and the website. `BuildPublicProfileUrl` builds its destination
under `/p/{slug}`. The QR was not assumed from this code: its original pixels
were decoded and the resulting URL was actually opened.

**Decoded destination:**
[Linko's public Share Profile](https://mypetlink.com.my/p/linko-p3nj5udj5dzpyb7cg).

The fresh anonymous visit returned **HTTP 200**, stayed at that exact decoded
URL, and displayed Linko. No owner login or stored session was provided.
The page-text privacy check passed; no finder contact controls appeared.
The script used the decoded value directly for navigation rather than a
separately hardcoded navigation URL.

The card also matches the actual Save Image download and the existing approved
brand card byte for byte:

`6c2a90d44ca06349c00cd8c90afa423259bb83161818bec4ce0855761ab73969`

Evidence: `source/share-card-verification.json`,
`source/public-profile-journey-verification.json`, original JPEGs, public-page
screenshots and `recordings/public-profile-journey/`.

## Presentation limits and privacy

The QR is read by the included image decoder and the decoded address is opened
in a real anonymous browser. The video uses a crop of the original QR with an
**editorial scan line**, followed by the genuine destination capture. This is
not physical phone-camera footage; no camera app, scanner button, URL, QR
pattern or successful external share is invented. No message or post is sent.

The creation sequence reuses the genuine V1 form and local photo-preview
captures. Its completed result is the existing marketing example, rather than
a newly submitted registration. No fabricated save confirmation is shown and
no media upload or new pet record is submitted.

The brief Share Card interaction is assembled from verified actual before/after
UI screenshots and the downloaded JPEG; the raw browser capture is retained.
Royal artwork is existing brand-uploaded artwork. The film makes no claim
that the application generates costumes or portraits.

Only information already visible anonymously is used in the destination
capture. Non-GET/HEAD requests were blocked during public capture. Only video
production assets changed; no website, API, database code, business data,
migration or deployment changed. No commit or push was performed.

## Verification and delivery

The original V1 MP4 is preserved and checked against its original SHA-256:

`3ca1dd172c44c69cb904dbd52157d15ab6057c640acd927a8bfb0566d499c577`

The earlier V2 export is backed up under
`archive/before-public-profile-correction/`. The corrected final uses the
requested `MyPetLink_TikTok_Post_007_v2.mp4` filename.

Final checks are recorded in `source/final-review.json`:
840 frames at 30 fps, full audio/video decoding, black-frame and full-blue-flash
scans, card QR decoding from exported frames, and the verified anonymous
public-profile journey. Audio remains the original 120 BPM arrangement,
extended naturally by two bars, without time stretching; measured loudness
and true peak are recorded in that same result.

The exported video is visually reviewed across every scene and played fully
at normal speed with audio unmuted. Playback results, including decoded frames
and any stalls/errors, are in `source/playback-review.json`.

The editable project, original card, new public-profile capture, raw recording,
music source, fonts with licence, timeline, caption and SRT are included.
Unused Safety footage is excluded from the corrected editable ZIP. There are
no missing Share Card or public-profile assets. A physical-phone scan recording
would only be needed if that specific filming style is requested later.
