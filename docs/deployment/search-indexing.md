# Production search indexing runbook

Canonical origin: `https://mypetlink.com.my`

The Web app is a static Next.js export on Cloudflare Pages. Page metadata,
`robots.txt`, and `sitemap.xml` are version-controlled; hostname redirects are
an edge concern and must be configured in Cloudflare.

## Audit baseline — 28 July 2026

Normal Chrome and Googlebot Smartphone user agents returned the same status,
headers, metadata, and initial HTML.

| Requested URL | Initial | Final | Redirects | Result |
| --- | ---: | ---: | ---: | --- |
| `/how-it-works` | 200 | 200 | 0 | Indexable, self-canonical |
| `/pet-profile` | 200 | 200 | 0 | Indexable, self-canonical |
| `/pricing` | 200 | 200 | 0 | Indexable, self-canonical |
| `/privacy` | 200 | 200 | 0 | Indexable, self-canonical |
| `/sample` | 200 | 200 | 0 | Indexable, self-canonical |
| `/smart-pet-tags` | 200 | 200 | 0 | Indexable, self-canonical |
| `/terms` | 200 | 200 | 0 | Indexable, self-canonical |
| `https://www.mypetlink.com.my/` | 200 | 200 | 0 | **Incorrect duplicate host; edge redirect required** |
| `http://mypetlink.com.my/` | 301 | 200 | 1 | Correct HTTPS redirect |
| `https://api.mypetlink.com.my/` | 404 | 404 | 0 | Expected real API-root 404 |
| `https://media.mypetlink.com.my/` | 404 | 404 | 0 | Expected real media-root 404 |

All seven marketing/legal pages had:

- `text/html; charset=utf-8`;
- a unique title and meta description;
- `index, follow` robots metadata;
- no `X-Robots-Tag`;
- one exact self-referencing canonical;
- substantial meaningful content in the initial HTML;
- anonymous access with no authentication, rate-limit, WAF, or crawler
  difference observed.

`robots.txt` returned `200 text/plain`, allowed public crawling, and declared
`https://mypetlink.com.my/sitemap.xml`. Cloudflare's managed content-signal
block was prepended to the application output but continued to allow search
indexing. `sitemap.xml` returned `200 application/xml` with only approved
canonical public URLs.

## Required Cloudflare canonical-host redirect

Cloudflare Pages currently serves `www.mypetlink.com.my` as a duplicate 200
host. Repository code cannot reliably correct this before a static file is
served. Create a **Single Redirect** in the `mypetlink.com.my` Cloudflare zone:

- Rule name: `Canonicalize MyPetLink www host`
- Match type: Custom filter expression
- Expression:

  ```text
  (http.host eq "www.mypetlink.com.my")
  ```

- Target type: Dynamic
- Target expression:

  ```text
  concat("https://mypetlink.com.my", http.request.uri.path)
  ```

- Status: `301` permanent redirect
- Preserve query string: **Enabled**
- Priority: place before broader hostname or protocol redirects

The `www` DNS record must remain proxied so Cloudflare can apply the rule. This
single rule covers both HTTP and HTTPS `www` requests while preserving nested
paths and query strings.

Expected verification:

```text
http://www.mypetlink.com.my/how-it-works?source=a
  301 -> https://mypetlink.com.my/how-it-works?source=a

https://www.mypetlink.com.my/how-it-works?source=a
  301 -> https://mypetlink.com.my/how-it-works?source=a
```

Both should use one redirect hop. The existing apex HTTP redirect remains:

```text
http://mypetlink.com.my/how-it-works?source=a
  301 -> https://mypetlink.com.my/how-it-works?source=a
```

Do not redirect `api.mypetlink.com.my` or `media.mypetlink.com.my` to the
website. Their unknown/root requests should remain genuine 404 responses.

Cloudflare reference:
<https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/>

## Sitemap maintenance

`apps/web/src/lib/seo.ts` owns the approved sitemap entries and stable
`lastModified` dates. Update a date only when the corresponding page content or
its authoritative data changes. Never use build time or request time.

The approved URL set is:

```text
https://mypetlink.com.my/
https://mypetlink.com.my/pricing
https://mypetlink.com.my/how-it-works
https://mypetlink.com.my/smart-pet-tags
https://mypetlink.com.my/pet-profile
https://mypetlink.com.my/sample
https://mypetlink.com.my/privacy
https://mypetlink.com.my/terms
https://mypetlink.com.my/p/topu-pnpr4ipnr6ppelnsn
```

After a frontend production build, run:

```bash
npm run verify:seo
```

This inspects exported HTML, canonicals, robots metadata, crawlable homepage
links, sitemap URLs and dates, `robots.txt`, and the static `404.html`
artifact. A production smoke test must still confirm that an unknown URL
returns HTTP 404 because that status is supplied by Cloudflare Pages.

## Search Console after deployment

1. Open and verify `https://mypetlink.com.my/sitemap.xml`.
2. Resubmit that sitemap in the canonical domain property.
3. For each important public page, use URL Inspection and **Test Live URL**.
4. Confirm the live test reports crawling allowed and indexing allowed.
5. Request indexing once for each affected public page.
6. Confirm Google-selected canonical matches the declared non-www canonical.
7. Inspect the `www` homepage and a nested `www` URL to confirm Google sees
   the permanent redirect.
8. Monitor the Page indexing report. Do not repeatedly request the same
   unchanged URL; sitemap submission and indexing requests do not guarantee or
   immediately force indexing.
