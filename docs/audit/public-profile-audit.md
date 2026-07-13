# Public Pet Profile Audit (`/p/{slug}-{publicCode}`)

Source: `GET /api/v1/public/pets/{publicCode}` → `PublicProfileService` → `PublicPetProfileResponse` → frontend mapping → `PublicSharePetProfile`.

## F-01 public behavior

- `FavoriteFood` and `FavoriteToy` are now returned by the public API response.
- The frontend maps null values to its existing `Not set` sentinel.
- The About tab filters that sentinel and empty values, so it never renders blank Favourite Food/Toy labels.
- When values exist, both cards render as optional personality/profile information.
- The QR/Safety response and UI were deliberately not changed.

## Verification

| Check | Result |
|---|---|
| Backend public response mapping | Automated-test verified |
| Frontend populated rendering | Automated-test verified |
| Frontend empty conditional rendering | Automated-test verified |
| Local real API public response | Live-test verified |
| Local browser populated display | Live-test verified |
| Local browser clear-to-NULL hides both labels | Live-test verified |
| Production deployment/social crawlers/device matrix | Not tested; live test required |

The local browser displayed multilingual values (`Nasi ayam 猫 🐾`, `Bola merah 🎾`), hid both labels after the API values were cleared, and displayed them again after restoration.

## Evidence limits

This phase does not support a claim of “zero Public Profile defects.” Existing name/age/media/privacy/static-fallback observations remain code-level findings unless separately automated or live-tested. Metadata, Open Graph, deleted/archived/private states, cache behavior, and production media URLs remain outside this implementation verification.
