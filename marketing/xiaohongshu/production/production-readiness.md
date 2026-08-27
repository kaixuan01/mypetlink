# Production readiness audit

Reviewed against every existing file in `marketing/xiaohongshu/` and the current app
structure on 20 August 2026. This audit does not change application behavior.

## What the application can generate

| Material | Capture type | Notes |
| --- | --- | --- |
| Public Share Profile | Screenshot or controlled scroll recording | Anonymous route; use the approved public sample/QA pet only. |
| Safety Profile | Screenshot or short motion recording | Anonymous route; never capture real customer contact data. |
| `/sample` experience | Screenshot or motion | Safest no-login capture source. It is an intentional public sample. |
| Owner pet overview, Sharing & Safety, care records, Lost Mode | Motion recording | Requires normal owner authentication. Local/QA/staging only. No bypass. |
| Share Center and Share Pet Card preview | Screenshot or motion recording | Requires normal owner authentication. The rendered card is also available through the social-card route for an approved public pet. |
| Theme changes and five themed cards | Screenshots or card files | Use one QA pet and save each deterministic theme state. |
| Pricing and Coming Soon posture | Screenshot | Recheck on posting day. Smart Tag ordering is unavailable and no purchase CTA is allowed. |
| QR image and resulting profile page | File + app capture | The physical act of scanning still needs two real phones. Do not imply a purchasable tag. |

Application output can supply UI proof, cards, QR images, covers, captions, subtitles, and
editing placeholders. It cannot supply authentic pet behavior, a first-person story,
receipts, a finder scanning a phone, a founder, or social proof.

## Human, reusable, and capture-mode matrix

| Posts | Primary source | Screenshot or motion | Reuse opportunity |
| --- | --- | --- | --- |
| 1–6, 8 | Real pet/home/archive footage | Stills for 1, 2, 4, 5, 8; motion for 3 and 6 | Calm pet, carrier, clear identification photo, home cutaways |
| 7, 9, 23 | Designed utility slides | Screenshots/stills | Brand backgrounds, cover and CTA layouts |
| 10 | Human mess + app | Motion | Care-record scroll and overview can support 27–30 |
| 11 | App only | Screenshots | Public Share Profile/Safety Profile pair supports 12, 14, 20, 21 |
| 12 | Real two-phone scan + app | Motion | The same honest scanning clip can support 14 and 16 |
| 13–14 | Real objects/pet + app insert | Mostly stills | Moving-day objects and finder hands can be banked |
| 15 | App only | Motion | Onboarding can support 21, 27, and 29 |
| 16 | App/card + real two-phone scan | Stills plus one motion proof shot | Share Card and scan footage support 25 and 29 |
| 17 | App only | Screenshots/card files | Five theme cards can be reused in theme comparisons |
| 18 | App plus optional real pet | Screenshots/stills | Birthday/adoption variants support seasonal posts |
| 19 | App only | Motion | Lost Mode on/off and both public results support 20 and 27 |
| 20–21 | App only | Screenshots | Safety and pricing captures support FAQ posts |
| 22, 24, 30 | Real founder/talking head | Motion | One talking-head setup and neutral workspace cutaways |
| 25 | Real design history + current app | Screenshots | Current card is reusable; historical versions must be genuine artifacts |
| 26 | Real audience questions | Comment screenshots + answer slides | Questions may be reused in later FAQ videos |
| 27 | Real home/pet + app | Motion | Evening pet shots and completed profile support 29 |
| 28 | Genuine longitudinal data only | Screenshots | May reuse real, consented account history; QA seed data is not social proof |
| 29 | Real new-pet warmth + prior assets | Stills | Reuse Posts 7–9 and 15 assets |

## Corrections and blockers in the existing strategy

1. The asset guide says Playwright scripts already exist in a project scratchpad. No
   repository capture suite existed. This production toolkit is the first checked-in suite.
2. Post 26 is not fully automatable until real questions exist. The planned example
   questions must not be presented as questions users actually asked.
3. Post 28 cannot use three months of merely “plausible” QA data as longitudinal proof.
   It must use genuine owner-controlled history or be explicitly labelled a product
   walkthrough, not “used for three months.”
4. Post 25 may show only real historical card versions. Reconstructing old versions and
   describing them as actual shipped artifacts would fabricate design history.
5. Authenticated owner capture has a missing prerequisite: an approved local/QA owner
   session and safe test pet. The scripts stop rather than bypass authentication.
6. App capture can demonstrate a downloaded profile QR opening a Safety Profile. It must
   not suggest that physical QR/NFC Smart Tags can currently be ordered.
7. The current live `/sample` CTA says an owner can “add a Smart Tag only if you want one,”
   and the footer describes optional QR/NFC add-ons without an adjacent Coming Soon label.
   A full-page sample screenshot could therefore imply current availability. Crop those
   lines out, or add a truthful Coming Soon annotation in the edit. Do not use the raw
   sample capture as Smart Tag launch proof.

## Post 1–5 claim review

These posts do not make product-feature claims, but several scripts are written as factual
first-person stories. They are not production-ready unless the owner supplies evidence.

| Post | Risk | Required factual correction |
| --- | --- | --- |
| 1 | Exact five-hour hiding, 2am search, 6am emergence, and foot interaction read as a real personal account. | Publish only with a real first-night sequence and truthful timing. Otherwise remove exact times and write general guidance, not a personal story. |
| 2 | RM280 total and every category amount are asserted as actual spending. | Replace with real receipts/records, the actual period, and location context. Do not use the prototype numbers as claimed spend. |
| 3 | “Fourth day it ran away,” an open delivery gate, a 40-minute search, and reunion are an unverified lost-pet story. “Three warning signs” is also too causal. | Reframe as three behaviors that prompted a door/window safety check. Use a real consented near-miss only; never stage an escape or reunion. The prototype applies this correction. |
| 4 | One community cat is said to have five owners across five locations. | Observe the same real cat over time, obtain location/shop permission where needed, and describe only documented interactions. Avoid implying ownership. |
| 5 | RM600 and each treatment price are asserted as a real adoption history. | Use the actual pet’s records and receipts, or turn it into a clearly sourced cost checklist. Never manufacture a personal adoption narrative. |

## Posts 1–3 prototype readiness

- Post 1: application assets none; eight real stills required; internal placeholder preview available.
- Post 2: application assets none; four category flat-lays plus truthful cost evidence required; internal placeholder preview available.
- Post 3: application assets none; five real safety/behavior clips required; corrected non-causal script and internal placeholder preview available.

All three remain intentionally `MISSING ASSETS` until those files are supplied.
