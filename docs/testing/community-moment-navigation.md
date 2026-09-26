# Community Moment return navigation

Internal Moment links use `momentNavigationPath(id, returnTo)`. The shared
validator accepts only Community Home, Explore, Search, Activity, My profile,
public Community Profiles and pet Share Profiles. It rebuilds recognized query
parameters (`q` for Search and `species` for Explore), stripping all others.
External URLs, encoded path escapes, traversal, arbitrary routes and labels
cannot become a back destination. There is no browser-history dependency.

Moment Detail derives the destination and label together. Household labels come
from currently visible author/collaborator identities, never URL text. A direct
link falls back to the visible author's Community Profile, otherwise Explore.
A profile origin without a matching visible identity also falls back to Explore.
Share/copy URLs still use canonical `momentPath(id)` without browsing context.

## Entry point audit

| Entry point | Return destination |
| --- | --- |
| Home feed cards: media, title, caption, Comments | Home (`/feed`) |
| Explore cards: media, title, caption, Comments | Explore, including selected pet type |
| Public Community Profile tiles and Comments | That profile; author or collaborator name from the Moment |
| My profile tiles and Comments | My profile (`/community/profile`) |
| Pet Share Profile Moments and Comments | The pet's Share Profile |
| Activity: likes, comments, mentions, collaboration invitations/acceptances | Activity; existing Comment anchors retained |
| Search | Currently links to pet/household profiles, not Moments; validated Search context supports `q` if supplied |
| Owner Moments manager, pet management Moments, Timeline, legacy embedded public Moments | Inline media/edit controls; no Moment Detail links |
| Shared links, direct links, Comment sign-in return | Canonical Moment path; deterministic visible-author/Explore fallback |

No API, database, privacy, reporting, moderation or attribution contract changes.

## Verification

Regression tests cover origin generation, matching destinations and labels,
Search queries, Explore filters, anonymous viewing, unavailable identities,
collaborator origins, canonical share URLs and malicious context.

With local web/API running, execute:

```powershell
node apps/web/scripts/moment-navigation-qa.mjs
```

The read-only runner prefers “My Big Boss”, or uses an available real Explore
Moment and reports the substitution. It checks Explore and profile journeys at
1280px and 390px, plus new tabs, refresh, Comments, Search context, pet filter,
direct links and malicious context. No production deployment is performed.

On 2026-09-27, both widths passed with the seeded “Muddy again” Moment from
the Teoh household. “My Big Boss” was absent from the local data.
