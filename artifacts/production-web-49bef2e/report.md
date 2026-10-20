# Production web deployment — Consignment Phase 1A + Phase 1B

**DEPLOYED SUCCESSFULLY, with the existing warnings and verification limits below.**

19 October 2026. Production deployment completed at **17:40:50 Malaysia time** (09:40:50 UTC).

| Item | Result |
|---|---|
| Release commit | `49bef2e6045e9b2b7528cfa1024209e67931bb3f` |
| Git status | Original branch `main`; freshly fetched origin/main exactly matches the release commit; zero commits ahead/behind; no push needed |
| Build isolation | Clean detached worktree at `C:\Project\MyPetLink-web-release-49bef2e-20261019`, created directly from the accepted commit |
| Production build | PASS: established build:web-release process, production export and built-in artifact/SEO validation |
| Pages project | Existing `mypetlink`, production branch `main` |
| Deployment ID | `ff6055b0-a3c0-462d-a0fb-c549e864618b` |
| Deployment URL | [ff6055b0.mypetlink.pages.dev](https://ff6055b0.mypetlink.pages.dev) |
| Live website | [mypetlink.com.my](https://mypetlink.com.my) |
| Cloudflare state | Successful canonical **production** deployment, branch main, exact release commit, custom-domain alias assigned |
| Apex custom domain | Active before and after deployment; HTTPS page requests succeeded |

The manual deployment used the installed, lockfile-pinned Wrangler 4.110.0 from the isolated checkout, explicitly specifying the existing project, main branch, exact commit and a clean commit state. It did not depend on Git auto-deployment. The commit's CF-Pages-Skip marker was retained as deployment metadata. Functions, static assets, _headers and _routes.json were uploaded successfully.

The user had already applied the Production migrations and published the API. **This task did not deploy the API, connect to the Production database, run migrations or change Production business data.** API checks were read-only HTTP requests. No stock, order, tag, sales-report, consignment, settlement or Phase 2 action was performed.

Production configuration was read from Cloudflare rather than copied from local development. The existing settings were preserved:

- API origin: `https://api.mypetlink.com.my`.
- Site and application origin: `https://mypetlink.com.my`.
- Smart Tags, tag orders, ordering and Community release flags: all explicitly `true`, matching the pre-deployment platform settings and live metadata. No feature was newly enabled.
- Public Profile sharing and Safety Profile owner UI remain enabled. Existing Google and analytics public identifiers were used without printing their values in the report.
- Existing database-wake settings remain six attempts and 45 seconds.
- Production noindex and development authentication overrides were absent. No local .env.local file existed in the isolated checkout.
- Existing Pages build settings remain root apps/web, npm run build, output out. Node 22.13.1 was used locally, satisfying the repository engine and app runtime requirement.
- Existing Functions runtime compatibility date remains 2026-06-24. The repository's separate build:functions validation uses its established 2026-07-13 command; the deployment did not change the platform date or flags.
- PUBLIC_API_BASE_URL is not separately configured in Production. The existing supported NEXT_PUBLIC_API_BASE_URL runtime fallback is present and was retained. Successful dynamic profile/card checks confirm that the Functions can reach the production API.

The post-deployment Cloudflare check found **no production environment-value changes**. No DNS, domain, role or infrastructure setting was edited. Authentication material was used only for Cloudflare management and was not printed or included in deployment artifacts.

Validation on the exact isolated checkout:

| Check | Result |
|---|---|
| Fresh lockfile dependency installation | PASS |
| App and Pages Functions TypeScript checks | PASS |
| Lint | PASS |
| Release-flag tests | 15 passed, zero failed |
| Pages Functions compilation | PASS |
| Next production build/static generation | PASS; 160 generated route entries |
| Export release metadata and rendered Smart Tag availability | PASS; all four selected flags verified |
| Community artifact verification | PASS; expected entry points and routes retained |
| SEO artifact check | PASS; 12 sitemap URLs and 104 unlisted pages checked; existing thin-text sample warning retained |
| Required assets | PASS; 118 HTML files and 1,231 files in the pre-deployment export manifest |
| Isolated source checkout after build | Clean; no source changes |

The output includes Owner login/dashboard, Admin login and Merchant Sales, existing owner functionality, Community routes, and the Consignment Phase 1A/1B workspace. The generated Consignment chunk contains Stocktake & reconciliation, stocktake endpoint calls and the new late-report linking UI. Routing still includes /p, /q, /t, /n, /u, /moments and /social/pets Functions. Static _headers and robots/sitemap assets are present.

The live Consignment chunk and API-client chunk were fetched from **both the apex domain and the deployment URL**. Their SHA256 hashes exactly match the verified local export:

- Consignment: `D39BEDDF274160A4A2DF75BE1882150BD6BCD32F3B2057FF9382260ADEB29B56`.
- API client: `0B17CD8AFF5A9467DE0F421176CC0D9FBB0C1C00FE8D94A095B7FC4DD526D78B`; includes the production API origin.

Live verification:

| Area | Observed result |
|---|---|
| API health | 200; service reports ok |
| Production-origin CORS | Exact https://mypetlink.com.my allowed on sampled health/admin requests |
| Protected stocktake/discrepancy endpoints | 401 without credentials, with production-origin CORS; no private data returned |
| Main site, pricing, directory, sample | 200; production canonicals and unchanged release markers |
| Login, dashboard, Admin login, Merchant Sales entry | Static pages 200 and noindex; browser guards work when signed out |
| Community feed, Explore and search routes | 200; feature remains enabled and expected indexing policy retained |
| Invalid Share Profile, Community profile, Moment and social-card paths | Expected safe 404 responses, noindex |
| Invalid QR, NFC and legacy tag paths | Safe branded GET shells, 200, noindex |
| Approved featured sample Share Profile HEAD | 200; X-MyPetLink-Metadata: dynamic-public-profile |
| Approved featured sample social-card HEAD | 200 image/jpeg; template social-card-v3 |
| Approved featured sample Safety Profile GET | 200; X-MyPetLink-Metadata: dynamic-finder-profile |
| Sampled browser console | No error or warning entries observed on homepage, owner login/guard and Admin entry/guard |

The browser loaded the deployed homepage, including the configured public sample; owner login finished rendering its Google sign-in button. A signed-out visit to /dashboard returned to owner login with the return destination. A signed-out Merchant Sales/Consignment visit returned to Admin login with the Merchant Sales destination. No Google login was submitted and no existing account session was used. The live screenshot is retained as [live-homepage.png](C:/Project/MyPetLink/artifacts/production-web-49bef2e/live-homepage.png).

**Warnings and failed checks:**

1. **Existing Safety Profile HEAD failure.** The additional approved-sample HEAD probe returned 500. A focused comparison confirmed the same behavior on the immediately previous deployment `d12a3aae-5007-46b6-8bab-9313b1d4ce06` from 2ff3b79: **GET 200 / HEAD 500 on both deployments**. Finder Function code and routing have no changes between those commits. This is a genuine outstanding method-handling defect, not a newly introduced API/UI incompatibility. It can affect HEAD-based monitoring or clients. It was not fixed or relabeled as passing; normal GET page serving and dynamic metadata were verified independently. See safety-head-comparison.json. No rollback was performed because the prior deployment has the same failure.
2. **Existing www certificate validation error.** Cloudflare reports www.mypetlink.com.my validation error with an expired/replaced certificate-pack explanation. This was present before deployment and remains afterward. The requested apex mypetlink.com.my is active and works. DNS/domain settings were left untouched.
3. **Authenticated workflows not exercised.** Actual Google account sign-in, authenticated Owner data, Admin Consignment navigation inside a signed-in workspace and production ledger/report operations were not tested. Their assets and signed-out guards were verified. No claim is made that a 401 response proves the full authenticated API contract or live database contents.
4. The build emitted nonblocking Node experimental/module-format notices and the existing low-text sample-profile SEO warning. Build and validation commands exited successfully. No complete browser network trace was captured; sampled browser logs were clear and the required HTTP routes and key deployed resources were checked directly.

Only build/deployment evidence was added to the original project. The final preservation check found **zero changes among 2,023 tracked/untracked non-artifact files**, no change to the original Git status outside this evidence directory, and a clean isolated checkout. Existing Marketing Demo, Community test and development-configuration work remains untouched. No new source commit was created. The isolated checkout and build are retained for reproducibility.

Evidence in this directory: cloudflare-before.json, cloudflare-after.json, domains-before.json, release-validation.json, production-build.log, deployment.log, artifact-validation.json, export-manifest.json, api-read-only-checks.json, live-http-smoke.json, live-asset-proof.json, live-functions-sample.json, safety-head-comparison.json, source-preservation.json and live-homepage.png. production-build-public-env.json contains only public build values, not credentials. The initial sample HEAD failure is retained alongside the comparison rather than overwritten by the successful GET check.

**Final state: the accepted Consignment web release is live on the existing Production project and apex domain. API/database deployment and all business records were left unchanged.**
