Audit status: PARTIAL
This report includes static code inspection plus limited automated and local verification (F-01/F-02 only).
It is not a complete production runtime certification.

# Owner Portal Field Audit

Evidence levels: `CODE-TRACED` · `AUTOMATED-TEST` · `LOCAL-LIVE` · `PRODUCTION-LIVE` · `NOT-TESTED` · `FAILED`.
Full per-field detail is in `field-mapping-matrix.md`; this report is organised by module.

## Evidence separation (whole report)
- **Code-level:** every module/field below was traced through source (form → payload → DTO → service → entity → column → response).
- **Automated-test:** Favourite Food/Toy, age, personality tags, cover position, dashboard/admin initialization.
- **Local-live:** Favourite Food/Toy only. **F-01 was verified through local API and database round-trip testing, and through Public Profile browser rendering. The signed-in Owner Portal Edit Pet form save/reload flow was not verified and remains LIVE-TEST REQUIRED.**
- **Production:** none.
- **Not tested:** the signed-in Edit Pet browser round-trip (incl. F-01), and every other module's runtime save/reload/logout-login, privacy combinations, media lifecycle, and error states.

---

## Module: Settings / Owner profile — `/settings` (`SettingsPanel`) → `PUT /api/v1/owner/profile`
- **Editable fields:** owner display name, phone, WhatsApp (both via `PhoneNumberInput` incl. country code), default general area, 11 privacy defaults, notification/reminder preferences.
- **Read-only:** Email (`disabled={apiMode}`; not in `UpdateOwnerProfileRequest`) — sourced from auth.
- **Not implemented (but sometimes expected):** owner profile **image** (avatar is a generated initial only), postal **address** (by design only "general area"), owner-level **emergency contact** (exists per-pet only).
- **Persistence path:** `UpdateOwnerProfileRequest` → owner profile service → `OwnerProfiles`/`Users` columns → `OwnerProfileResponse`.
- **Evidence:** `CODE-TRACED`. **Automated tests:** none specific. **Live:** `NOT-TESTED`.
- **Gaps:** save → reload → logout/login round-trip; email truly immutable server-side; notification JSON schema. **Issue refs:** none open; S9 (add E2E test).

## Module: Pet basic info — `/pets/new`, `/pets/:id/edit` (`PetProfileForm`) → `POST/PUT /api/v1/pets`
- **Fields:** name, species, custom species, breed, gender, colour, birthday, estimated birth year, age mode, adoption day, bio, personality tags, **favourite food, favourite toy**, profile theme.
- **Persistence:** all map to `Pets.*` columns / `PersonalityTagsJson`; partial-update safety via `if (request.X is not null)`.
- **Evidence:** `CODE-TRACED`; age & personality tags also `AUTOMATED-TEST`; **Favourite Food/Toy** `CODE-TRACED`+`AUTOMATED-TEST`+`LOCAL-LIVE` (**F-01 resolved**).
- **Missing:** weight, microchip/identification.
- **Gaps:** live save/reload for the non-F-01 fields; browser Edit-form pass for F-01.

## Module: Media & theme — `PetProfileForm` + media upload
- Profile photo, cover photo, cover position X/Y (0–100), profile theme. Direct FKs `Pets.ProfileMediaFileId`/`CoverMediaFileId`; `MediaFiles` canonical; category→public bucket.
- **Evidence:** `CODE-TRACED`; cover position `AUTOMATED-TEST`. **Live:** media replace/delete/orphan `NOT-TESTED` (see `media-audit.md`).

## Module: Contact & safety — `PetProfileForm` (tab)
- Per-pet contact override (use-owner-defaults, display name, phone, WhatsApp, emergency contact, general-area override), safety note, emergency note, 11 visibility flags.
- **Evidence:** `CODE-TRACED`. Private phone/WhatsApp/emergency are absent from the public DTO (hiding is server-side). **Live:** privacy combinations `NOT-TESTED`.
- **Product decisions:** emergency-contact independent visibility; safety-note always-public (see `issues-found.md` D).

## Module: Lost Mode — Manage Lost Mode → `PUT /api/v1/pets/:id`
- Enabled, message, last-seen area, last-seen datetime, reward note, extra contact instruction → `Pets.Lost*`. **Evidence:** `CODE-TRACED`. **Live:** Lost-Mode-on safety access `NOT-TESTED`.

## Module: Lifecycle & memorial — dedicated endpoints
- Lifecycle status (`/archive`, `/restore-active`), memorial date/message + show-on-public (`/mark-memorial`). **Evidence:** `CODE-TRACED` (+ existing lifecycle tests). **Live:** `NOT-TESTED`.

## Module: Care records — `/pets/:id/records` (`RecordsManager`)
- Type (enum incl. Vaccine/Deworming/Grooming/VetVisit/Medication/Allergy/Surgery/LabTest/Other), title, date, due date, provider, notes, public visibility, attachments. **Missing:** health conditions, feeding instructions, behaviour notes.
- **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`.

## Module: Moments / memories — `/pets/:id/moments` (`PetMomentForm`)
- Title, date, type, caption, visibility, show-on-public, show-in-timeline, timeline note, media (photos/videos), cover media, media ordering. **Evidence:** `CODE-TRACED`. **Live:** video duration/poster, ordering `NOT-TESTED`.

## Module: Smart tags — `/pets/:id/tags`, `/tags`
- Tag code, assignment, status, variant, QR status (derived), NFC (`HasNfc`), archive, found-location, scan history. **Evidence:** `CODE-TRACED`. **Live:** reassignment/cache, found-flow `NOT-TESTED`.

## Module: Orders — `/orders`
- Order number, status, payment status (display); payment proof upload. **Evidence:** `CODE-TRACED`. **Live:** `NOT-TESTED`.

## Known gaps for this report
Runtime persistence, privacy combinations, media lifecycle, and error/empty states across all modules except F-01/F-02 remain **LIVE-TEST REQUIRED**.
