# Enhancement Opportunities (optional, roadmap — not bugs)

Separate from defects. Each needs a product decision; several require additive DB columns/tables (defer per the "no migration in this task" rule).

## New pet fields requested but not yet in the product
| Enhancement | Benefit | Complexity | Priority | Notes |
|---|---|---|---|---|
| Weight | Health context on safety page | Medium | Later | new column + UI |
| Microchip / identification number | Aids reunification | Medium | Soon | new column; treat as sensitive (privacy-gated) |
| Vet details | Emergency vet contact | Medium | Later | new column(s) |
| Feeding instructions | Boarding/finder help | Small–Medium | Later | new column |
| Behaviour / handling notes | Finder safety | Small–Medium | Soon | overlaps existing safety note — consider structuring |
| Health conditions / structured Allergies & Medication | Safety-relevant detail | Medium–Large | Later | likely a related table |
| Multiple emergency contacts | Redundancy | Medium | Later | related table |

## Product/UX enhancements
Profile-completeness indicator · Preview Public Profile before publishing · Preview Safety Profile before tag activation · Unsaved-changes warning · Autosave drafts · Change history/activity log · Owner-default prefill when creating a pet · Better country-code selector · Emergency-info templates · Scan analytics + better found-location reports · Expiring/revocable share links · QR download options · Better social-share preview · Image crop/reposition (partly present via cover position) · Video compression + upload retry · Offline-safe draft forms · Data export · Account deletion workflow · Pet ownership transfer · Family-member access.

## Priority guidance
- **Soon:** Microchip number, behaviour notes, profile-completeness, preview-before-publish, unsaved-changes warning.
- **Later:** everything requiring new related tables or media processing (video compression), analytics, transfers/family access.

Do not implement automatically — prioritise with the product owner first.
