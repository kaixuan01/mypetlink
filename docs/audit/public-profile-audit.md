Audit status: PARTIAL
This report includes static code inspection plus limited automated/local verification (F-01 public display only).
It is not a complete production runtime certification. Do not read it as "zero Public Profile defects".

# Public Pet Profile Audit (`/p/{slug}-{publicCode}`)

Source: `GET /api/v1/public/pets/{publicCode}` → `PublicProfileService` → `PublicPetProfileResponse` → `mapBackendPublicProfile` → `PublicSharePetProfile`. Real profiles resolve client-side via the runtime fallback (not baked); only the two mock demo pets and the intentional **Topu** marketing sample are statically generated.

Evidence per field: `CODE-TRACED` unless noted.

## Fields / behaviours
| Item | Public behaviour | Evidence | Status |
|---|---|---|---|
| Pet name | shown | CODE-TRACED | Partially verified |
| Profile photo | shown (public bucket URL) | CODE-TRACED | Partially verified |
| Cover photo (+ position) | shown | CODE-TRACED | Partially verified |
| Age | derived from birthday, else estimated year; neutral/hidden when unknown | CODE-TRACED, AUTOMATED-TEST (age calc) | Partially verified |
| Breed / gender / colour | shown | CODE-TRACED | Partially verified |
| Biography | shown | CODE-TRACED | Partially verified |
| Personality tags | shown | CODE-TRACED, AUTOMATED-TEST | Partially verified |
| Favourite food | shown only when set; `Not set` sentinel filtered | CODE-TRACED, AUTOMATED-TEST, LOCAL-LIVE | **Resolved (F-01)** |
| Favourite toy | shown only when set | CODE-TRACED, AUTOMATED-TEST, LOCAL-LIVE | **Resolved (F-01)** |
| Theme | applied | CODE-TRACED | Partially verified |
| Moments | only `Public` + `showOnPublicProfile`, gated by `showMoments` | CODE-TRACED | Partially verified |
| Video (in moments) | rendered via media gallery | CODE-TRACED | Not verified (duration/poster) |
| Contact actions (phone/WhatsApp) | **not** on public profile (share-first) — live on Safety page | CODE-TRACED | Partially verified |
| Privacy filtering | owner name/general area gated by flags; private contact absent from DTO | CODE-TRACED | Partially verified |
| Lost Mode display | banner when active | CODE-TRACED | Not verified (runtime) |
| Empty / hidden fields | omitted (no blank labels) | CODE-TRACED, AUTOMATED-TEST (favourite empty) | Partially verified |
| Invalid slug | runtime fallback → not-found | CODE-TRACED | Not verified (runtime) |
| Private / archived / memorial-private | dedicated not-available states | CODE-TRACED | Not verified (runtime) |
| Deleted pet | not resolvable | CODE-TRACED | Not verified |
| Social preview / Open Graph | `generateMetadata` from fetched name | CODE-TRACED | NOT-TESTED (crawlers/OG image) |
| Loading / error states | branded loader; friendly error (no mock rows) | CODE-TRACED | Not verified (runtime) |

## F-01 public verification (from the implementation phase)
Local browser showed multilingual values (`Nasi ayam 猫 🐾`, `Bola merah 🎾`), hid both labels after the API values were cleared to `NULL`, and re-showed them after restoration. Backend public mapping + frontend populated/empty rendering are `AUTOMATED-TEST` verified. QR/Safety contracts were deliberately not changed.

## Evidence limits
This phase does not support "zero Public Profile defects". Name/age/media/privacy/static-fallback observations remain **code-level** unless separately automated or live-tested. Metadata/OG, deleted/archived/private states, cache behaviour, production media URLs, and the full route matrix are **runtime verification still required**.
