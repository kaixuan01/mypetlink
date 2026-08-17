# Product analytics

MyPetLink has a provider-neutral product analytics layer with an optional GA4
adapter. Analytics is disabled when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset or
invalid. Because the value is included in the static frontend bundle, enabling
or changing it requires a rebuild and redeploy.

## Privacy contract

Only event names and the fixed metadata below may leave the browser. The
runtime adapter enforces the allowlist even if a caller bypasses TypeScript.
It never sends pet or owner names, email addresses, phone numbers, locations,
profile slugs, safety codes, tag codes, order numbers, database identifiers,
free text, query strings, or authentication data. Dynamic routes are reported
as templates such as `/p/[profile]`, `/q/[safety-profile]`, `/t/[tag]`,
`/pets/[pet]`; order identifiers are query values and are discarded.

Automatic GA page views, Google Signals, and ad-personalization signals are
disabled. Page views are emitted by the App Router integration after client
navigation, without autocapture.

## Event contract

| Event | Emission point | Allowed metadata |
| --- | --- | --- |
| `page_view` | Initial route and each distinct App Router pathname | Sanitized page context only |
| `pet_create_started` | First change in the create-pet form | `source=owner_portal` |
| `pet_created` | Pet create request succeeds | `source=owner_portal` |
| `public_profile_viewed` | A valid Public Share Profile finishes loading | `surface=public_profile` |
| `moment_created` | Moment create request succeeds | `source=owner_portal` |
| `share_clicked` | Explicit Share Profile action | `surface=public_profile|owner_portal` |
| `share_link_copied` | Clipboard write succeeds | `surface=public_profile|owner_portal` |
| `share_card_viewed` | The generated owner Share Card preview loads successfully | `card_variant=profile|birthday|adoption` |
| `share_card_shared` | A native Share Card share request resolves without cancellation or rejection | `card_variant=profile|birthday|adoption` |
| `share_card_action` | An owner completes a direct Share Card action: the image download starts, the profile link reaches the clipboard, or the image is opened | `card_variant=profile|birthday|adoption`, `card_action=save|copy_link|open_image` |
| `create_profile_cta_clicked` | A visitor uses the closing "Create a profile for your pet" invitation on a shared public profile | `surface=public_profile` |
| `care_record_created` | Care-record create request succeeds; edits excluded | `source=owner_portal`, controlled `record_type` |
| `smart_tag_viewed` | Owner or pet Smart Tags screen opens | `surface=owner_tags|pet_tags` |
| `order_started` | Smart Tag order flow opens | `source=owner_portal`, `tag_type=qr|qr_nfc` |
| `order_submitted` | Order create request succeeds | `source=owner_portal`, `tag_type=qr|qr_nfc|mixed`, bounded `item_count` |

Share Card events keep their meanings separate on purpose. `share_card_shared`
means the owner handed the card to the system share sheet and the sheet accepted
it — it never claims the card was delivered to anyone, and a cancelled sheet
records nothing. `share_card_action` covers the three outcomes the app can
observe itself, each at its own success boundary: `save` only once a validated
JPEG has been fetched and the download has started, `copy_link` only once the
clipboard write succeeds, and `open_image` when the owner opens the image in a
new tab. A failed fetch, a rejected file type, or a failed clipboard write
records nothing, so the funnel never reports work that did not happen.

`copy_link` is also recorded when the Share button falls back to copying —
on a browser without Web Share, or when the share sheet cannot open. The owner
pressed Share, but the measurable outcome is the same: this pet's profile link
is on their clipboard. Recording it is what keeps desktop distribution visible
instead of appearing inactive.

`create_profile_cta_clicked` is emitted only where the create-profile control is
a measured acquisition step. It carries the surface and nothing else, so a click
arriving from a shared pet profile can be told apart from the same control on
the marketing pages without ever identifying the pet, the profile, or the owner.
Attributing a completed signup back to that click is deliberately not attempted
yet; it needs the signup events below.

`signup_started` and `signup_completed` are intentionally absent. The current
Google sign-in response does not distinguish a newly created account from a
returning owner, so emitting those events would make the acquisition funnel
unreliable. `share_whatsapp_clicked` is also absent because the app has no
dedicated WhatsApp profile-share action and the native share sheet does not
report the selected destination.

Share Card saves and failed or cancelled native share requests do not emit a
share event. The controlled `card_variant` dimension contains only `profile`,
`birthday`, or `adoption`; it never includes dates, ages, pet identifiers,
filenames, URLs, or free text.

## Operations

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to the GA4 web stream id in the production
frontend build environment, rebuild, and redeploy. Leave it unset in local,
preview, or production environments where analytics should remain disabled.
No API, database migration, cookie, or Admin Portal configuration is required.
Before enabling GA4 in production, Operations must confirm the production
privacy notice and any consent mechanism required for the intended audience and
jurisdictions. Provider delivery can only be verified with the real production
measurement id and the GA4 DebugView or Realtime report.
