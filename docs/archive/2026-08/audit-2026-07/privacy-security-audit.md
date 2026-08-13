Audit status: PARTIAL
Code inspection only. No privacy/authorization automated or live tests were executed in this phase. "✅" and matrix marks below mean CODE-TRACED, not runtime-verified. IDOR, privacy-combination, and hardening checks remain LIVE-TEST REQUIRED. Do not read this as "zero privacy defects".

# Privacy & Security Audit

## Visibility matrix (intended vs enforced)
| Field | Owner Portal | Public Profile | Safety Profile | Setting | Enforced where |
|---|---|---|---|---|---|
| Owner display name | ✅ | ⚠️ | ⚠️ | `ShowOwnerName` | `PublicProfileService`, `QrSafetyService` |
| General area | ✅ | ⚠️ | ⚠️ | `ShowGeneralArea` | both services |
| Phone | ✅ | ❌ never | ⚠️ | `ShowPhone` | `QrSafetyService`; not in public DTO |
| WhatsApp | ✅ | ❌ never | ⚠️ | `ShowWhatsapp` | `QrSafetyService`; not in public DTO |
| Emergency contact | ✅ | ❌ never | ⚠️ | `ShowPhone` | `QrSafetyService` |
| Emergency note | ✅ | ❌ | ⚠️ | `ShowEmergencyNote` | `QrSafetyService` |
| Safety note | ✅ | ❌ | ✅ always | — | `QrSafetyService` |
| Care records | ✅ | ⚠️ badge/details | ➖ | `ShowCareBadges`/`ShowHealthSummary` + record `PublicVisibility` | `PublicProfileService` |
| Moments | ✅ | ⚠️ | ➖ | `ShowMoments` + moment `Public`/`showOnPublicProfile` | `PublicProfileService` |
| Memorial | ✅ | ⚠️ | state only | `ShowMemorialOnPublicProfile` | both services |

Key strength: **private contact fields (phone/WhatsApp/emergency) are absent from the public-profile DTO entirely** — hiding is not merely front-end. ✅

## Server-side authorization (verified in code)
- Admin endpoints: `[Authorize(Policy = Admin)]`; the frontend access cache is UI-only and never replaces backend checks. ✅
- Owner pet endpoints scope every query by `OwnerUserId == currentUserId` (see `PetService.LoadOwnedPetAsync`, media `LoadOwnedMediaAsync`). Ownership is derived from the authenticated session, not the request body. ✅

## Must LIVE-TEST (IDOR / spoofing / hardening)
1. Fetch/update another owner's pet, media, care record, tag by changing the ID → must be 403/404.
2. Owner ID cannot be spoofed via payload (server ignores any client-supplied owner id).
3. Public slug does not expose internal sequential IDs (uses `publicCode`/`safetyCode`, not row ids). ✅ by design — confirm no numeric leak.
4. API errors return the friendly envelope only — no stack traces / SQL text (confirm the 500 handler).
5. Uploaded filenames: object keys are server-generated (`pets/{petId}/profile/{uuid}.jpg`) and the storage layer rejects `..`/leading-slash/backslash keys (`EnsureSafeObjectRequest`). ✅ — confirm no path traversal via original filename.
6. Bio/rich-text XSS: confirm React escaping everywhere the bio/notes render (no `dangerouslySetInnerHTML` on user text; the only such usage found is the homepage JSON-LD, which is escaped).
7. WhatsApp/phone/social links generated safely (E.164 validated; `getWhatsAppLink`/`getCallLink`).
8. Expired/deactivated accounts stop exposing owner info; refresh-token rotation is single-flight (verified) and refresh failure → login.

## No sensitive data in URLs
Public/safety codes are opaque; no PII in query strings. ✅
