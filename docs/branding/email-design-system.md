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

## Layout rules

- Use a full-width cream outer table and a centred white content table.
- Maximum content width is 600px.
- Use a white/light header with the approved horizontal logo at a readable
  size. Do not add another large MyPetLink heading below it.
- The horizontal logo includes the tagline
  “A safe and shareable profile for your pet.” Its alt text is `MyPetLink`.
- Keep one prominent brand-blue primary CTA.
- Use blue information cards with the shared border and an 18px corner radius.
- Keep supporting information below the primary content hierarchy.
- Use the shared support block and cream footer on every template.
- Footer copy must explain why the transactional message was sent.
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
- numbered steps;
- detail rows and status badges;
- primary CTA;
- divider and support block;
- footer and the shared plain-text frame.

Existing customer templates are:

- `OwnerWelcomeEmailTemplateRenderer`;
- `PaymentConfirmedEmailTemplateRenderer`.

New renderers must be added to `EmailTemplateRenderer` and compose the shared
layout rather than copying an existing renderer's HTML.

## Safe local previews

Development exposes a loopback-only, no-send preview:

```text
GET /api/v1/dev/email-previews/welcome/normal
GET /api/v1/dev/email-previews/welcome/long-name
GET /api/v1/dev/email-previews/welcome/missing-name
GET /api/v1/dev/email-previews/welcome/logo-blocked
GET /api/v1/dev/email-previews/payment-confirmed/normal
```

Append `?width=375` or `?width=320` to exercise the responsive HTML in a
fixed-width mobile preview frame. Append `?format=text` for the plain-text
counterpart. The endpoint is not mapped outside the Development environment,
does not access SMTP, and uses only representative `.test` data. Store generated
local artifacts under `artifacts/email-previews/`, which is gitignored.

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
- Gmail, Outlook, and Apple Mail receive real-client checks before claiming
  complete client compatibility.
