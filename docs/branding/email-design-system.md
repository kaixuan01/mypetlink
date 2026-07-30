# MyPetLink transactional email design system

Every customer-facing transactional email must use
`TransactionalEmailLayout` and its shared components. Individual renderers
provide only template-specific content and must not recreate the HTML document
shell, header, CTA, support block, footer, or plain-text frame.

## Brand sources

The authoritative Web sources are:

- tokens and card styles: `apps/web/src/app/globals.css`;
- logo usage: `apps/web/src/components/brand/BrandLogo.tsx`;
- official horizontal assets:
  `apps/web/public/logo-horizontal.png` and
  `apps/web/public/logo-horizontal.svg`;
- shared landing-page card and CTA patterns: `apps/web/src/app/page.tsx`;
- Owner Portal shell and card patterns: `apps/web/src/components/portal`;
- public-profile styling: `apps/web/src/components/marketing`.

Email uses the production URL configured by `Email:BrandLogoUrl`. The current
approved value is `https://mypetlink.com.my/logo-horizontal.png`, which must
remain publicly accessible over HTTPS. Delivered HTML must never reference an
API-local asset path.

Email-safe brand values translated from the Web tokens:

| Purpose | Web token | Email value |
| --- | --- | --- |
| Outer background | `pet-cream` | `#fff8f2` |
| Card/header | `pet-vanilla` | `#ffffff` |
| Primary action | `pet-teal` | `#1570ef` |
| Primary text | `pet-ink` | `#0d1b3d` |
| Secondary text | `pet-muted` | `#44506a` |
| Border | `pet-border` | `#f0dcd0` |
| Warm accent | `pet-coral` | `#ff7a6e` |
| Warm surface | `pet-apricot` | `#ffe9de` |
| Information surface | `brand-blue-section` | `#f1f9ff` |

Do not create a separate email-only palette. Changes to these values must be
reviewed against the current Web design system first.

## Email icon system

Compact instructional icons follow the rounded outline language in
`apps/web/src/components/ui/Icon.tsx`:

- navy `#0d1b3d` outlines with rounded line caps and joins;
- consistent medium stroke weight;
- a light blue `#f1f9ff` rounded tile with a subtle `#d8eaff` border;
- one restrained `#1570ef` accent dot;
- 56px rendered size on desktop and 48px on narrow mobile, supplied as
  optimized 88px PNGs.

The editable source references live in
`docs/branding/assets/email-icons/`. Delivered emails must use the optimized
PNG copies in `apps/web/public/email-assets/` through the configured
`Email:BrandAssetBaseUrl`; the renderer must never read Web files at runtime.
Source SVGs are design/build references only and must not be linked from email
HTML.

Every instructional icon requires meaningful alt text, fixed width and height,
and adjacent numbered text that communicates the complete meaning when images
are blocked. Icons are optional visual reinforcement, never the only label for
an action or status. Do not use emoji, Base64 images, signed URLs, expiring
URLs, mixed illustration styles, or large packaging artwork.

New step icons must match the shipped set before they ship: the `x=5 y=5 78×78
rx=22` tile filling the 88px canvas, an inner `rx=9` rounded frame on the same
`y=20 height=48` baseline, `#0d1b3d` strokes at 3.5 with round caps and joins,
and the `#1570ef` accent dot at `(68,20) r=7`. An illustration that merely
depicts the right subject is not a match. Author the icon as an SVG in
`docs/branding/assets/email-icons/`, export the 88px PNG from it, then compare
against the shipped set at 88px and the rendered 56px/48px sizes; reject it if
the tile, stroke weight, or content scale differs. The current set is
`welcome-profile`, `welcome-contact`, `welcome-preview`, and `welcome-ready`.

## Approved mascot exception

Linko may appear in Welcome and onboarding emails only:

- **one** mascot hero illustration in the hero area, placed after the heading
  and introductory copy and before the onboarding steps;
- optionally **one** small Linko support or completion illustration, only where
  the layout stays clean at 320px;
- numbered onboarding steps keep the flat outline/tile icon language above —
  never a mascot, and never a second illustration style in the same template.

Mascots are supporting visuals and must never be required for understanding.
The adjacent real text carries the full message, so an image-blocked or
plain-text reader loses nothing. Hero illustrations keep both `width` and
`height` attributes so Outlook cannot render them at their natural size; the
reserved space when images are blocked is an accepted trade-off.

Every other transactional template — payment, receipt, OTP, authentication, and
security — continues to use the restrained shared layout with no mascot
artwork. Full reference screenshots must never be used as email content, and
screenshot crops must never be used as production assets.

Approved production mascot assets live alongside the icons in
`apps/web/public/email-assets/`; editable masters live in
`docs/branding/assets/mascots/`.

| Asset | File | Rendered | Supplied |
| --- | --- | --- | --- |
| Welcome hero | `linko-hero.png` | 258×258 desktop; 210px wide mobile | 440×440 |
| Support illustration | `linko-support-sit.png` | 72×72 desktop; hidden at 620px and below | 240×240 |
| Completion illustration | `linko-celebrate.png` | 120×120 | 240×240 |

The support illustration is hidden below 620px through the shared
`email-support-mascot` class, because a mascot column and an unbroken
`support@mypetlink.com.my` cannot both fit at 320px. When the `<style>` block is
stripped the block degrades to the readable two-column layout.

## Welcome decorative assets

The illustrated Welcome hero may use these small, optional decorations:

| Asset | Production PNG | Editable master | Typical rendered size |
| --- | --- | --- | --- |
| Pale paw | `welcome-paw-decoration.png` | `welcome-paw-decoration.svg` | 38px hero / 20px CTA |
| Sparkles | `welcome-sparkles.png` | `welcome-sparkles.svg` | 42px |
| Yellow accent marks | `welcome-wave-accent.png` | `welcome-wave-accent.svg` | 34px |

Production PNGs live in `apps/web/public/email-assets/`. Editable SVG masters
live in `docs/branding/assets/email-decorations/` and are never referenced by
delivered email HTML. Decorations use the existing navy, blue, pale-blue, and
yellow brand accents with simple rounded shapes. They must have `alt=""`,
`role="presentation"`, explicit dimensions, and no semantic role. Hide them on
narrow mobile where they compete with text.

Decorations are optional when images are blocked and must never reserve space
that interrupts reading order. Serve them from the configured public HTTPS
asset base; do not use Base64 data, signed/expiring URLs, CSS backgrounds, or
local filesystem paths. Before enabling a new production asset, verify a `200`
response from its final public URL. Keep individual decorative PNGs below 5KB
where practical and review the unique remote-image payload for the complete
template.

## Layout rules

- Use a full-width cream outer table and a centred white content table.
- Maximum content width is 600px.
- Use a white/light header with the approved horizontal logo at a readable
  size. Do not add another large MyPetLink heading below it.
- The horizontal logo includes the tagline
  “A safe and shareable profile for your pet.” Its alt text is `MyPetLink`.
- Keep one prominent brand-blue primary CTA.
- Use blue information cards with the shared border and an 18px corner radius.
- In numbered onboarding rows, keep the number badge, 56px desktop/48px mobile
  icon, title, and description aligned horizontally. Separate rows with a
  subtle border; never stack the number underneath the icon.
- Welcome emails may use the approved two-column Linko hero: personalized
  heading, introduction, and real speech copy on the left with the mascot on
  the right at desktop widths. Stack into one readable column on mobile. Keep
  the hero on the light-blue brand surface and do not make decorative symbols
  carry meaning.
- Place welcome onboarding rows on a white inner card within the light-blue
  section so the steps remain easy to scan without introducing a new palette.
- The Welcome CTA may use the wide button treatment on desktop and must expand
  to the available content width on narrow mobile.
- Keep supporting information below the primary content hierarchy.
- Use the shared support block and cream footer on every template.
- Footer copy must explain why the transactional message was sent.
- The Owner Welcome footer says the recipient received the email after signing
  in to MyPetLink for the first time. This provider-neutral wording applies to
  Google, Apple, and Email OTP entry flows.
- Layout must remain understandable if border radius, media queries, or the
  logo image are unsupported.

## Typography

- Font stack: `Arial, Helvetica, sans-serif`; do not load Web fonts.
- Main heading: 29px desktop, 26px narrow mobile, 1.25 line height.
- Body: 16px with 1.65 line height.
- Detail and step text: 14–15px with at least 1.5 line height.
- CTA: 16px bold.
- Footer minimum: 14px with 1.65 line height.
- Long names and references must wrap; never force horizontal scrolling.

## Copy principles

- Write friendly, clear customer language in short paragraphs.
- Use customer-facing feature names, never internal enums or system wording.
- Do not mention backend, API, payload, provider IDs, or implementation details.
- Do not advertise unreleased or disabled features.
- Feature-dependent copy must use the authoritative feature snapshot or flag.
- Keep security-sensitive messages concise and transactional.
- Use one primary action.
- Do not add marketing subscription language or an unsubscribe link to a
  strictly transactional message unless policy requirements change.

## Technical constraints

- Use table-based layout and inline styles for the required presentation.
- A small `<style>` block may provide progressive mobile and dark-mode
  enhancements; the email must remain usable when it is stripped.
- Do not use JavaScript, CSS Grid, complex Flexbox, external fonts, required
  background images, Base64 hero images, or tracking pixels.
- HTML-encode every customer or order value.
- Images must use public HTTPS URLs, meaningful dimensions, and alt text.
- CTA URLs must be absolute, use the normal authenticated portal flow, and
  contain no bearer token, JWT, OTP, internal ID, or provider credential.
- Provide an equivalent plain-text body for every template.
- Never infer business data by parsing display copy.

## Shared implementation

`apps/api/MyPetLink.Api/Services/TransactionalEmailLayout.cs` owns:

- the document shell and responsive/dark-mode enhancements;
- header and official logo;
- title and optional eyebrow;
- paragraphs and information cards;
- the cohesive illustrated Welcome hero and optional support mascot;
- numbered steps;
- detail rows and status badges;
- primary CTA;
- divider and support block;
- footer and the shared plain-text frame.

Existing customer templates are:

- `OwnerWelcomeEmailTemplateRenderer`;
- `PaymentConfirmedEmailTemplateRenderer`;
- `OrderShippedEmailTemplateRenderer`.

New renderers must be added to `EmailTemplateRenderer` and compose the shared
layout rather than copying an existing renderer's HTML.

## Safe local previews

Development exposes a loopback-only, no-send preview:

```text
GET /api/v1/dev/email-previews/welcome/normal
GET /api/v1/dev/email-previews/welcome/long-name
GET /api/v1/dev/email-previews/welcome/missing-name
GET /api/v1/dev/email-previews/welcome/images-blocked
GET /api/v1/dev/email-previews/payment-confirmed/normal
GET /api/v1/dev/email-previews/order-shipped/normal
```

Append `?width=375` or `?width=320` to exercise the responsive HTML in a
fixed-width mobile preview frame. Append `?format=text` for the plain-text
counterpart. Before the public site deploys new icon assets, append
`?localAssets=true` to substitute a loopback-only development asset route for
visual review. This substitution never appears in delivered email HTML. The
endpoint is not mapped outside the Development environment, does not access
SMTP, and uses only representative `.test` data. Store generated local artifacts
under `artifacts/email-previews/`, which is gitignored.

## Template checklist

Every new or changed email must verify:

- shared layout, header, footer, CTA, typography, spacing, and tokens are used;
- official HTTPS logo and `MyPetLink` alt text are present;
- mobile 320px and 375px rendering has no clipping or horizontal overflow;
- image-blocked rendering retains readable brand and message context;
- dark-mode text and actions retain useful contrast;
- plain-text content has the same core information and action;
- all dynamic values are HTML encoded;
- CTA route and URL safety are tested;
- no private/internal data, secret, tracking pixel, or external font is present;
- disabled or unreleased features are not promoted;
- structural/content tests and local previews cover representative variants;
- any mascot follows the approved exception above and is not load-bearing;
- Gmail, Outlook, and Apple Mail receive real-client checks before claiming
  complete client compatibility.
