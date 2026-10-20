# Consignment agreement document — local verification (19 Oct 2026)

Synthetic data only. Disposable LocalDB `MyPetLinkAgreementDocQA` (built from root migration.sql, dropped afterwards).

- `pdf/MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1.pdf` — issued copy from the Admin flow (2 pages)
- `pdf/MyPetLink_Consignment_SYNPAWS-CONS-2026-001_v1_PREVIEW.pdf` — watermarked draft preview
- `pdf/MyPetLink_Consignment_SYN-CONS-2026-001_v1_multipage.pdf` — 4-page stress test (2,000-character terms)
- `pdf/*-page-N.png` — rendered pages used for visual inspection
- `screenshots/00–08` — wizard next step, incomplete company details, ready, issue confirmation, issued,
  share fallback, upload dialog, signed copy received, mobile (375 px)
- `api-tests-full.log` — full API suite before the last migration-test fixes (2949 passed, 4 head-list failures)
- `api-tests-consignment-rerun.log` — consignment subset after triggers (212/213; the remaining one fixed after)
- `web-tests-full.log` — full web suite (4438 passed, 7 skipped)
- `web-build.log` — local production build (smart-tags/tag-orders/ordering on, community off)
