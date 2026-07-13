# MyPetLink SEO and Indexing Policy

The canonical production origin is `https://mypetlink.com.my`. Metadata,
canonical links, the sitemap, and robots output must never use localhost,
`mypetlink.pages.dev`, an Azure hostname, or the `www` hostname.

## Route policy

| Route family | Search policy | Reason |
| --- | --- | --- |
| Home, pricing, guides, privacy, terms, `/sample` | `index,follow` | Public marketing and legal content |
| Topu's intentional sample Public Share Profile | `index,follow` | Approved public sample |
| Other `/p/*` Public Share Profiles | `noindex,follow` | Owner-created profiles are private-by-default for search discovery |
| `/q/*`, `/t/*`, `/activate/*` | `noindex,follow` | Direct-access finder and tag flows |
| Login, Owner Portal, Admin Portal | `noindex,nofollow` | Private management surfaces; authentication remains the actual protection |

The code-level source of truth is `src/lib/seo.ts`. `robots.txt` allows
crawling because crawlers must be able to read page-level `noindex` metadata.
Robots rules are not an authorization mechanism.

## Public profile discovery (future option)

A future owner setting may be named **“Allow search engines to discover this
public profile”**. Do not implement it without product and privacy approval.
It needs explicit owner consent, clear consequences, safe defaults, API
authorization, public-projection review, and likely a persisted schema field.
Until that work is approved, normal owner-created profiles remain `noindex`.

## Cloudflare canonical-host rules

Repository metadata cannot enforce host redirects for a static Pages site.
Cloudflare should permanently redirect, preserving path and query string:

- `https://www.mypetlink.com.my/*` to `https://mypetlink.com.my/$1`
- the public `*.pages.dev` project hostname to the custom production domain

HTTP already redirects to HTTPS. Confirm the Pages project's custom-domain
redirect before adding another rule, and avoid redirect loops.

## Release checks

After every production deployment, inspect the rendered HTML for public and
private routes, verify `/robots.txt` and `/sitemap.xml`, then run Google Search
Console's live URL test. Canonical and robots metadata must be present in the
initial HTML without client-side JavaScript or API/database availability.
