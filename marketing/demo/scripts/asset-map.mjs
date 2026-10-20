/**
 * Which official IP file becomes which demo asset.
 *
 * Written down rather than inferred at run time, because the IP folder holds two
 * characters and the difference matters:
 *
 *   Linko  orange tabby cat  "The Curious Connector"  (Malaysian Oyen)
 *   Linky  black-and-white dog "The Loyal Guardian"   (Malaysian kampung dog)
 *
 * `Linky_1_FirstMeet`, `Linky_2_Playdate` and `Linky_3_FirstDayHome` are Linky's
 * own story assets — his "Linky's Story" document names the same beats on the
 * same dates — and they must never be used for Linko. Everything under `Linko/`
 * is Linko's.
 *
 * Captions and personalities come from the official IP board
 * (`IP_Linko_Linky.png`) and the two story documents. They are reproduced in the
 * API seeder, not here; this file only decides which picture goes where.
 *
 * ## Why the two profile photos are crops of the board
 *
 * Linko and Linky appear side by side in the Pets row of the brand profile, so
 * their portraits have to look like a pair. The board is the only place both
 * characters are rendered in the same style, lighting and pose — sitting,
 * waving, wearing the navy collar and the round MyPetLink tag — so both come
 * from there. Linko's richer 3D art and Linky's illustrated story scenes are
 * used for the Moments instead, where each is shown on its own and has room for
 * the detail.
 */

/** Relative to the IP folder root passed on the command line. */
export const ipAssets = [
  // ---- profile photos: the matched official mascot pair --------------------
  {
    output: "linko-profile.jpg",
    source: "IP_Linko_Linky.png",
    purpose: "Linko's pet profile photo",
    note: "Official mascot render, cropped from the IP board. Paired with linky-profile.jpg.",
    // Tight around the character: the board's body copy sits just above and the
    // "Inspired by" panel just below, and neither may appear in a profile photo.
    crop: { left: 128, top: 385, width: 404, height: 462 },
    width: 900,
  },
  {
    output: "linky-profile.jpg",
    source: "IP_Linko_Linky.png",
    purpose: "Linky's pet profile photo",
    note: "Official mascot render, cropped from the IP board. Paired with linko-profile.jpg.",
    crop: { left: 648, top: 392, width: 444, height: 455 },
    width: 900,
  },

  // ---- cover photos --------------------------------------------------------
  {
    output: "linko-cover.jpg",
    source: "Linko/Moments/04 MyPetLink Tag/Linko_Ch04_05_CompletedPortrait_v8.png",
    purpose: "Linko's pet cover photo",
    note: "Full seated portrait with the navy collar and round MyPetLink tag clearly visible.",
    width: 1600,
  },
  {
    output: "linky-cover.jpg",
    source: "Linky_2_Playdate.png",
    purpose: "Linky's pet cover photo",
    note: "Landscape scene, which suits a banner. From Linky's own story set.",
    width: 1600,
  },

  // ---- Moment images -------------------------------------------------------
  {
    output: "moment-01-meet-linko.jpg",
    source: "Linko/Moments/03 Meet Linko/Linko_Ch03_04_MeetLinkoPortrait_v2.png",
    purpose: "Moment 1 — Meet Linko",
    note: "Close owner-perspective portrait; the warmest single image of Linko.",
    width: 1440,
  },
  {
    output: "moment-02-meet-linky.jpg",
    source: "Linky_1_FirstMeet.png",
    purpose: "Moment 2 — Meet Linky",
    note: "Linky's First Meet, 15 March 2025: found under a banana leaf. His origin image.",
    width: 1440,
  },
  {
    output: "moment-03-together.jpg",
    source: "IP_Linko_Linky.png",
    purpose: "Moment 3 — Together",
    note: "The official IP board, used whole. The one Moment that is about both mascots.",
    width: 1440,
  },
  {
    output: "moment-04-safe-at-home.jpg",
    source: "Linky_3_FirstDayHome.png",
    purpose: "Moment 4 — Every pet deserves identity, safety and connection",
    note: "Linky's First Day Home, 22 March 2025: his first meal, safe.",
    width: 1440,
  },
  {
    output: "moment-05-smart-tag.jpg",
    source: "Linko/Moments/04 MyPetLink Tag/Linko_Ch04_01_FirstTag_Cover_v9.png",
    purpose: "Moment 5 — Smart, modern tools for every pet family",
    note: "The one Moment that shows the product on the pet.",
    width: 1440,
  },
];

/**
 * The brand avatar comes from the repository, not the IP folder, so the demo
 * account wears exactly the mark the product already ships rather than a
 * marketing-only variant.
 *
 * `app-icon-512.png` rather than `logo-mark.png`: the mark is the same drawing,
 * but the icon is square and 512px, so it survives a circular avatar crop on a
 * 2x-DPR capture. `logo-mark.png` is 166x136 and would be both soft and
 * off-centre once cropped to a circle.
 */
export const repoAssets = [
  {
    output: "mypetlink-logo.png",
    source: "apps/web/public/app-icon-512.png",
    purpose: "MyPetLink owner avatar",
    note: "Official brand mark, square, copied unchanged.",
  },
];
