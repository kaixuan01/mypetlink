import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The canonical user-facing vocabulary, guarded at the surfaces that carry it.
 *
 * MyPetLink had four names for `/p/{slug}-{publicCode}` ("Public Profile",
 * "Public Share Profile", "Pet Profile", "public profile"), two for a
 * `PetMemory` ("Moment" and "Memory"), and two for the community half ("Social"
 * and "Community") — often within one screen.
 * docs/architecture/product-model.md settles each of them; this file stops the
 * settled ones drifting back.
 *
 * These read source text on purpose. A rendering test proves one screen; this
 * proves a phrase is absent from a whole file, which is what actually regresses
 * when somebody adds a button next year.
 *
 * <b>Phrases, not words.</b> An earlier draft of this file banned the word
 * "memor" and immediately failed on "In memory of {pet}" — the memorial line,
 * which is correct English and nothing to do with the Moments feature. The list
 * below is therefore specific, and the things it deliberately permits are:
 *
 *   - `"Memory"` as a MomentType category, a stored value alongside "Vet Visit";
 *   - "memorial" and "In memory of";
 *   - every identifier: `PetMemory`, `maxMemoriesPerPet`, `publicProfileEnabled`,
 *     `OwnerSocialProfile`, `socialEnabled`, `useMemo`. Internal names are out
 *     of scope by design.
 */

const SRC = join(__dirname, "..");
const read = (relative: string) => readFileSync(join(SRC, relative), "utf8");

/**
 * What a reader of the running app could actually see.
 *
 * Comments go, because explaining why a word was retired necessarily quotes it.
 * Compound identifiers go too — anything with an internal lower-to-upper
 * transition, which is every `maxMemoriesPerPet`, `publicProfileEnabled` and
 * `OwnerSocialProfile` in the tree, and none of the plain English words the
 * list below is about.
 */
/** A slash-star comment, spanning any number of lines. */
const BLOCK_COMMENT = /[/][*][^]*?[*][/]/g;
/** `// ...` to the end of its line. */
const LINE_COMMENT = /[/][/][^\r\n]*/g;
/** camelCase and PascalCase: an internal lower-to-upper transition. */
const COMPOUND_IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*[a-z0-9][A-Za-z0-9_$]*[A-Z][A-Za-z0-9_$]*/g;

/**
 * A reader sees a sentence, not the lines it was typed on.
 *
 * JSX wraps prose wherever the formatter decides, so
 * `the Public Share\n  Profile.` renders as "the Public Share Profile" and
 * matched nothing while this compared raw source. Three retired names shipped
 * that way, on a file this list already named. Collapsing runs of whitespace to
 * one space compares what the screen shows instead of how it was indented.
 */
const WHITESPACE_RUN = /\s+/g;

function visibleCopy(source: string) {
  return source
    .replace(BLOCK_COMMENT, " ")
    .replace(LINE_COMMENT, " ")
    .replace(COMPOUND_IDENTIFIER, " ")
    .replace(WHITESPACE_RUN, " ");
}

/** Owner- and visitor-facing surfaces that name one of the three concepts. */
const surfaces = [
  "components/portal/petForm/SharingPrivacySection.tsx",
  "components/portal/petForm/ContactSafetySection.tsx",
  "components/portal/petForm/BasicInfoSection.tsx",
  "components/portal/petForm/AppearanceSection.tsx",
  // The shared form controls carry their own prose — the theme preview caption
  // named the page it previews, and nothing was watching this file.
  "components/portal/petForm/PetFormControls.tsx",
  // The Share Profile itself, including the copy a visitor meets when the link
  // is broken.
  "components/marketing/PublicSharePetProfile.tsx",
  "components/portal/PetManagementTabs.tsx",
  "components/portal/PetCard.tsx",
  "components/portal/PetMomentsManager.tsx",
  "components/portal/MomentEditorDialog.tsx",
  "components/portal/PetDetailHeader.tsx",
  "components/portal/DashboardClient.tsx",
  "components/portal/SocialProfileSettings.tsx",
  "components/portal/PetSocialSettingsList.tsx",
  "components/portal/CommunityProfileSettingsLink.tsx",
  "components/portal/SettingsPanel.tsx",
  "components/share/ShareCenter.tsx",
  "components/marketing/QrSafetyPageView.tsx",
  "components/marketing/PetProfilesSection.tsx",
  "components/social/SocialExploreView.tsx",
  "lib/planLimits.ts",
  "lib/pageTitles.ts",
];

/** Wording that means a concept has picked up a second name again. */
const stalePhrases = [
  // /p/ is the Share Profile.
  "Public Share Profile",
  "Public Profile",
  "public profile",
  "Public profiles",
  "MyPetLink Pet Profile",
  // A missing /p/ is a missing Share Profile, not a missing pet.
  "Pet profile not found",
  // A PetMemory is a Moment.
  "Memories",
  "memories",
  "Memory Limit",
  "Memory Usage",
  "Memory note",
  "Pet Memory",
  "Delete memory",
  "this memory",
  // The social half is Community.
  "MyPetLink Social",
  "social profile",
  "Social profile",
  "Community & Social",
  // One page identity for the discovery surface.
  "Explore pets",
];

describe("no surface carries a second name for a settled concept", () => {
  it.each(surfaces)("%s", (file) => {
    const copy = visibleCopy(read(file));
    const found = stalePhrases.filter((phrase) => copy.includes(phrase));

    expect(found).toEqual([]);
  });

  it("sees a phrase the way it renders, not the way it was indented", () => {
    // The reason three names survived a guard that already named their file.
    const wrapped = `<p>
      Adjust the cover that appears on the Public Share
      Profile.
    </p>`;

    expect(wrapped).not.toContain("Public Share Profile");
    expect(visibleCopy(wrapped)).toContain("Public Share Profile");
  });

  it("still lets legitimate English and identifiers through", () => {
    const legitimate = `
      // A retired name in a comment: Public Profile.
      const maxMemoriesPerPet = plan.maxMemoriesPerPet;
      const type: MomentType = "Memory";
      <p>In memory of {pet.name}</p>
      <p>This profile only shows owner-approved public information.</p>
    `;
    const copy = visibleCopy(legitimate);

    expect(stalePhrases.filter((phrase) => copy.includes(phrase))).toEqual([]);
  });
});

/**
 * The exact strings that reached an owner's screen after Stage 2 said they were
 * gone. Pinned individually, because a list that only says "these phrases are
 * absent" cannot say what should be there instead.
 */
describe("the leaks the final audit found stay fixed", () => {
  it("names the page the cover preview belongs to", () => {
    const copy = visibleCopy(read("components/portal/petForm/AppearanceSection.tsx"));

    expect(copy).toContain("appears on the Share Profile");
    expect(copy).toContain("Share Profile and Safety Profile");
  });

  it("names the page the theme preview is previewing", () => {
    const copy = visibleCopy(read("components/portal/petForm/PetFormControls.tsx"));

    expect(copy).toContain("Share Profile will look");
  });

  it("tells a visitor which page is missing, not that the pet is", () => {
    const copy = visibleCopy(read("components/marketing/PublicSharePetProfile.tsx"));

    // "MyPetLink" is a compound identifier, so visibleCopy strips it out of
    // the prose along with every camelCase name; the sentence it leaves behind
    // is what this asserts on.
    expect(copy).toContain("Share Profile not found");
    expect(copy).not.toContain("Pet profile not found");
    expect(copy).toContain("Share Profile for this link");
    // The eyebrow above the card names the same page, not the umbrella.
    expect(copy).not.toContain("Pet profile");
  });
});

describe("Share Profile is the one name for /p/", () => {
  it("names the browser tab and share title after the page, not the umbrella", () => {
    const titles = read("lib/pageTitles.ts");

    expect(titles).toContain("Share Profile`");
    expect(titles).not.toContain("Pet Profile`");
  });

  it("keeps Pet Profile as the umbrella concept where it belongs", () => {
    // The product page is about everything a pet gets, so it keeps the name,
    // and so does the owner's management hub.
    expect(read("lib/routes.ts")).toContain('petProfile: "/pet-profile"');
    expect(read("components/layouts/PublicNav.tsx")).toContain('label: "Pet Profiles"');
  });

  it("switches the page on and off by its own name", () => {
    const sharing = read("components/portal/petForm/SharingPrivacySection.tsx");

    expect(sharing).toContain('label="Share Profile enabled"');
    expect(sharing).toContain('title="What appears on the Share Profile"');
  });

  it("offers the finder bridge by that name", () => {
    const safety = read("components/marketing/QrSafetyPageView.tsx");

    expect(safety).toContain("Share Profile");
    expect(safety).toContain("View Share Profile");
  });
});

describe("Moment is the one name for a PetMemory", () => {
  it("states plan allowances in Moments", () => {
    const limits = read("lib/planLimits.ts");

    expect(limits).toContain("Moments used");
    expect(limits).toContain("Free Moment limit");
  });

  it("keeps Memory as a category value, which is a stored thing and not a name", () => {
    // Renaming it would be a data change, and in that list it means something
    // specific: a keepsake, beside "Vet Visit" and "Achievement".
    expect(read("components/portal/MomentEditorDialog.tsx")).toContain('"Memory",');
  });

  it("leaves memorial wording alone", () => {
    expect(read("components/portal/PetDetailHeader.tsx")).toContain("In memory of");
  });
});

describe("Community is the one name for the social half", () => {
  it("names the owner's identity after the area it belongs to", () => {
    const settings = read("components/portal/SocialProfileSettings.tsx");

    expect(settings).toContain('label="Turn on my Community Profile"');
    expect(settings).toContain('title="Community Profile"');
  });

  it("asks about a pet's participation in terms of the area", () => {
    expect(read("components/portal/PetSocialSettingsList.tsx")).toContain("in Community`");
  });

  it("makes Explore an action inside Community, not the page's identity", () => {
    const explore = read("components/social/SocialExploreView.tsx");

    // The page is the Community discovery surface, so its heading is the area;
    // "Explore" survives as the navigation item and as the way back to it.
    expect(explore).toContain("Community");
    expect(read("lib/socialNavigation.ts")).toContain('label: "Explore"');
  });
});

describe("the two owner names say whose audience they are", () => {
  it("names the finder-facing one after finders", () => {
    expect(read("components/portal/SettingsPanel.tsx")).toContain('label="Name finders see"');
    expect(read("components/portal/petForm/ContactSafetySection.tsx")).toContain(
      'label="Name finders see"'
    );
  });

  it("names the Community one after Community", () => {
    expect(read("components/portal/SocialProfileSettings.tsx")).toContain(
      'label="Community name"'
    );
  });

  it("keeps them as two separate fields", () => {
    // Merging them, or copying one into the other, is the collapse the three
    // identities exist to prevent. See docs/architecture/product-model.md.
    expect(read("components/portal/SocialProfileSettings.tsx")).not.toContain(
      "ownerDisplayName"
    );
  });
});

describe("one action, one label", () => {
  it("defines the profile-creation CTA once", () => {
    const cta = read("components/marketing/CreateProfileCTA.tsx");

    expect(cta).toContain('export const PRIMARY_CTA_LABEL = "Create Free Pet Profile"');
    expect(cta).toContain("children = PRIMARY_CTA_LABEL");
  });

  it.each([
    "app/pricing/page.tsx",
    "app/pet-profile/page.tsx",
    "app/safety-profile/page.tsx",
    "app/how-it-works/page.tsx",
    "app/smart-pet-tags/page.tsx",
    "components/marketing/SampleExperience.tsx",
    "components/layouts/SocialLayout.tsx",
  ])("%s does not invent its own wording for it", (file) => {
    const source = read(file);

    for (const stale of [
      "Start Free Profile",
      "Get Started Free",
      "Get started",
      "Create Your Pet",
    ]) {
      expect(source).not.toContain(stale);
    }
  });

  it("uses one label for the one commerce action", () => {
    // Three buttons, one destination (ownerRoutes.tagOrder).
    for (const file of [
      "app/pricing/page.tsx",
      "app/where-to-buy/page.tsx",
      "components/marketing/SmartTagShowcase.tsx",
    ]) {
      expect(read(file)).not.toContain("Order a Smart Tag");
    }
  });

  it("says informational CTAs inform", () => {
    expect(read("components/marketing/SmartTagShowcase.tsx")).toContain(
      "Learn About Smart Tags"
    );
    expect(read("app/how-it-works/page.tsx")).toContain("Learn About Smart Tags");
  });
});
