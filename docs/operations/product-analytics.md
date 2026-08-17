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
| `share_card_viewed` | The generated owner Share Card preview loads successfully | `card_variant=profile` |
| `share_card_shared` | A native Share Card share request resolves without cancellation or rejection | `card_variant=profile` |
| `care_record_created` | Care-record create request succeeds; edits excluded | `source=owner_portal`, controlled `record_type` |
| `smart_tag_viewed` | Owner or pet Smart Tags screen opens | `surface=owner_tags|pet_tags` |
| `order_started` | Smart Tag order flow opens | `source=owner_portal`, `tag_type=qr|qr_nfc` |
| `order_submitted` | Order create request succeeds | `source=owner_portal`, `tag_type=qr|qr_nfc|mixed`, bounded `item_count` |

`signup_started` and `signup_completed` are intentionally absent. The current
Google sign-in response does not distinguish a newly created account from a
returning owner, so emitting those events would make the acquisition funnel
unreliable. `share_whatsapp_clicked` is also absent because the app has no
dedicated WhatsApp profile-share action and the native share sheet does not
report the selected destination.

Share Card saves and failed or cancelled native share requests do not emit a
share event. The controlled `card_variant` dimension reserves `birthday` and
`adoption` for their approved future work package; this release emits only
`profile`.

## Operations

Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to the GA4 web stream id in the production
frontend build environment, rebuild, and redeploy. Leave it unset in local,
preview, or production environments where analytics should remain disabled.
No API, database migration, cookie, or Admin Portal configuration is required.
Before enabling GA4 in production, Operations must confirm the production
privacy notice and any consent mechanism required for the intended audience and
jurisdictions. Provider delivery can only be verified with the real production
measurement id and the GA4 DebugView or Realtime report.
