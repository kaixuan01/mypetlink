/**
 * Content for the October 2026 Instagram / Threads / TikTok posts.
 *
 * Each post is a list of frames. A frame renders twice from the same template:
 * as a 4:5 carousel slide (static, final state) and as a 9:16 video scene
 * (animated, `seconds` long). `carousel: false` or `video: false` drops a frame
 * from one format.
 *
 * Every product claim here was checked against the live site on 2026-10-15
 * (Free plan: up to 3 pets; QR + NFC Smart Tag: RM39.90 one-time, available now).
 * Re-check on posting day.
 */

// Background removed from the official mascot renders in marketing/demo/assets.
const linkoCat = "marketing/social/2026-10-posts/assets/linko-profile-cutout.png";
const linkyDog = "marketing/social/2026-10-posts/assets/linky-profile-cutout.png";
const linkoTag = "marketing/demo/assets/moment-05-smart-tag.jpg";
// Real Safety Profile capture of the Linko demo account, cropped above the
// development badge that sits in the bottom corner of the original.
const safetyProfile = "marketing/social/2026-10-posts/assets/safety-profile-linko-demo-top.png";

export const posts = [
  {
    id: "01-lost-pet-72-hours",
    title: "Lost pet? Your first 72 hours",
    frames: [
      {
        layout: "hook",
        tone: "coral",
        seconds: 3.6,
        kicker: "Save this · Malaysia edition",
        title: "Lost pet?<br>Your first<br>72 hours.",
        sub: "A calm checklist.<br>We hope you never need it.",
        art: [linkoCat, linkyDog],
      },
      {
        layout: "list",
        seconds: 6.2,
        chip: "Hour 0–2",
        title: "Search close to home",
        items: [
          "Walk the area slowly and call their name in a calm voice.",
          "Check stairwells, under cars, drains, bushes and the bin area.",
          "Many cats hide quietly nearby. Go back after dark with a torch.",
          "Leave their bedding at your door. Familiar smells help.",
        ],
      },
      {
        layout: "list",
        seconds: 5.2,
        chip: "Hour 0–2",
        title: "Tell the people nearby",
        items: [
          "Your condo guard house and management office.",
          "Neighbours and your residents' WhatsApp group.",
          "Nearby shops, the mamak, the morning dog walkers.",
        ],
      },
      {
        layout: "list",
        seconds: 6.2,
        chip: "Hour 2–24",
        title: "Make the calls",
        items: [
          "Your local council's animal control (Majlis / DBKL). Impounded dogs may only be held a short time, so call early and visit in person.",
          "Vet clinics nearby. Finders often bring pets in to scan for a microchip.",
          "Shelters and rescuers in your area.",
        ],
      },
      {
        layout: "twoCol",
        seconds: 6.4,
        chip: "Hour 2–24",
        title: "Post a clear notice",
        left: {
          label: "Include",
          tone: "good",
          items: [
            "A clear face photo and a full-body photo",
            "Markings, collar colour, size",
            "General area and date last seen",
            "How to reach you",
          ],
        },
        right: {
          label: "Leave out",
          tone: "bad",
          items: [
            "Your full home address",
            "One private detail, so you can check real finders",
          ],
        },
        foot: "Where: local lost-pet Facebook groups, PetFinder.my Lost &amp; Found, neighbourhood WhatsApp groups.",
      },
      {
        layout: "list",
        seconds: 6.2,
        chip: "Hour 24–72",
        title: "Keep going",
        items: [
          "Put up printed flyers: a big photo, few words, your number.",
          "Visit the pound and shelters again. Don't rely on calls alone.",
          "Search again at dawn and late at night, when it's quiet.",
          "Never pay a “finder” before they send a current photo.",
        ],
      },
      {
        layout: "list",
        seconds: 6.6,
        chip: "Before it happens",
        tone: "mint",
        title: "5 minutes today",
        items: [
          "Save a clear face photo and a full-body photo.",
          "Note their markings and microchip number.",
          "Give them a Safety Profile: finders scan it and reach you on WhatsApp. No app needed.",
          "If they go missing, turn on Lost Mode: finders see where and when they were last seen.",
        ],
        foot: "Free on MyPetLink for up to 3 pets.",
      },
      {
        layout: "cta",
        seconds: 3.6,
        title: "Save this.<br>Share it with a pet parent you love.",
        sub: "Linko &amp; Linky are MyPetLink's mascots. They're safe at home.",
        art: [linkoCat, linkyDog],
      },
    ],
  },
  {
    id: "02-qr-nfc-airtag-gps",
    title: "QR, NFC, AirTag or GPS?",
    frames: [
      {
        layout: "hook",
        tone: "ink",
        seconds: 3.4,
        kicker: "Before you buy a pet tag",
        title: "QR, NFC,<br>AirTag or GPS?",
        sub: "They don't do the same job.",
        art: [linkoTag],
        artMode: "photo",
      },
      {
        layout: "twoCol",
        seconds: 6.0,
        chip: "Two different jobs",
        title: "Ask the right question",
        left: {
          label: "Where is my pet?",
          tone: "blue",
          items: ["That's tracking.", "AirTag, GPS trackers", "Helps <b>you</b> search"],
        },
        right: {
          label: "How does the finder reach me?",
          tone: "coral",
          items: ["That's ID.", "QR, NFC, engraved tags", "Helps <b>whoever finds them</b> contact you"],
        },
      },
      {
        layout: "option",
        seconds: 5.2,
        icon: "qr",
        name: "QR tag",
        what: "Any phone camera scans it and opens a page showing how to reach you.",
        pros: ["No battery, no charging", "Finder needs no app"],
        cons: ["Doesn't show location", "Someone has to find them first"],
      },
      {
        layout: "option",
        seconds: 5.2,
        icon: "nfc",
        name: "NFC tag",
        what: "Tap a phone on it and it opens the same kind of page. No aiming a camera.",
        pros: ["No battery, no charging", "Fast in the dark or in a hurry"],
        cons: ["Needs an NFC phone (most newer phones)", "Doesn't show location"],
      },
      {
        layout: "option",
        seconds: 5.6,
        icon: "airtag",
        name: "AirTag",
        what: "Shows you an approximate location using nearby Apple devices.",
        pros: ["Location, no monthly fee"],
        cons: [
          "Works best for iPhone owners, where many Apple devices pass",
          "Battery to replace",
          "A finder can only reach you if it's in Lost Mode",
        ],
      },
      {
        layout: "option",
        seconds: 5.4,
        icon: "gps",
        name: "GPS tracker",
        what: "Live location in an app, while the battery lasts.",
        pros: ["Best for active searching, like a dog that bolts"],
        cons: ["Usually a subscription", "Needs regular charging", "Bulky on a small cat", "Finders usually can't contact you"],
      },
      {
        layout: "table",
        seconds: 7.0,
        title: "Side by side",
        cols: ["", "Finder can reach you", "Shows location", "Power", "Subscription"],
        rows: [
          ["QR", "yes", "no", "None", "Not needed*"],
          ["NFC", "yes", "no", "None", "Not needed*"],
          ["AirTag", "Lost Mode only", "Approx.", "Battery", "No"],
          ["GPS", "Usually not", "Live", "Charging", "Usually"],
        ],
        foot: "*Some ID tag services charge a subscription. MyPetLink doesn't.",
      },
      {
        layout: "verdict",
        seconds: 5.0,
        title: "They're not rivals.",
        lines: [
          "A tracker helps <b>you</b> search.",
          "An ID tag helps <b>whoever finds them</b> reach you.",
          "Many owners use both.",
        ],
      },
      {
        layout: "product",
        seconds: 6.6,
        chip: "What we make",
        title: "QR + NFC Smart Tag",
        image: safetyProfile,
        points: [
          "Scan or tap: both open the same Safety Profile",
          "Finders tap <b>WhatsApp Owner</b> or send where they found them",
          "Shows a general area, never your address",
        ],
        price: "RM39.90 one-time<small>No subscription · Not GPS</small>",
      },
      {
        layout: "cta",
        seconds: 3.4,
        title: "Save this before<br>you buy a pet tag.",
        sub: "Start with a free Safety Profile at mypetlink.com.my",
        art: [linkoCat],
      },
    ],
  },
];
