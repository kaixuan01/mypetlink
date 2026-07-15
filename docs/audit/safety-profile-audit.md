Audit status: PARTIAL
Code inspection only. No Safety-Profile automated, local-live, or production runtime verification was performed in this phase. "✅" below means CODE-TRACED, not runtime-verified. Do not read this as "zero Safety Profile defects".

# QR / Safety Profile Audit (`/q/{safetyCode}` and `/t/{tagCode}`)

Source: `GET /api/v1/public/safety/{safetyCode}` → `QrSafetyService.GetBySafetyCodeAsync` → `PublicSafetyPageResponse`; physical tags resolve through `TagScanService` (`/t/{tagCode}`). Rendered by `QrSafetyRouteView` / `QrSafetyPageView` / `TagFinderView`.

## Purpose & Lost Mode
- Safety page is **finder-first**: pet name, photo, contact actions, safety/emergency notes, general area, found-location action.
- **Lost Mode does NOT block access** — an active safety page stays reachable; Lost Mode adds a "pet is lost" banner + prioritises contact. ✅ (verified in service logic: lost fields returned only when `LostModeEnabled`).
- No "GPS/live tracking" wording is present in the safety views. ✅ Keep it that way.

## Privacy enforcement (server-side)
- Phone returned only when `ShowPhone`; WhatsApp only when `ShowWhatsapp`; emergency note only when `ShowEmergencyNote`; general area only when `ShowGeneralArea`; owner name only when `ShowOwnerName`. `Contact` is `null` when nothing is shareable. ✅
- Memorial pets: safety page returns a memorial state with **no** finder contact actions. ✅
- Safety note is always returned (intended as safe-handling info).

## Tag states (`TagScanService`)
`active` → safety profile; `unclaimed`/`pending` → activation/pending; `inactive` (lost/disabled/replaced/archived) → inactive card; `notFound` → not-found card. Scan is recorded (`TagScans`) with time/IP/referer. ✅

## Things to LIVE-TEST
- "QR Active" / "NFC Ready" must reflect **real** DB values; if a tag variant has no NFC, do not show a false NFC status.
- Found-location submission (`SubmitScanLocationConsentRequest`) validates lat/long ranges and stores consent. Confirm the found flow + scan-history creation live.
- Emergency info is not accidentally hidden when the owner enabled it for safety (`ShowEmergencyNote` true → must appear).
- Disabled/archived/unassigned tag copy; invalid tag code; access with Lost Mode ON.
- Age on Safety page matches the Public profile (same `Age` DTO).
