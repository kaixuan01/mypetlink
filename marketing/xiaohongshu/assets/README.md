# Xiaohongshu asset library

- `shared/` — approved footage reusable by multiple posts.
- `phone/` — real phone-in-hand, scanning, and talking-head footage.
- `pet/` — real pet/home/archive footage, grouped by post or session.
- `product/` — automated MyPetLink screenshots, recordings, cards, and QR files.
- `brand/` — campaign-only brand exports. Prefer references to `apps/web/public/` over copies.

Never store browser auth state, secrets, customer data, copyrighted music, or unapproved
faces here. A post manifest references an asset once; do not duplicate it into each post.
