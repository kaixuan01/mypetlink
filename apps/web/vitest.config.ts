import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * The flag values production is built with (verified from the live bundle and
 * enforced for releases by `src/lib/releaseFlags.ts`). Feature flags default to
 * OFF in code, so a suite that only ever runs on the defaults tests a site that
 * is not the one customers see: it would call the Smart Tag "Coming Soon",
 * hide checkout, and never notice /explore. The directory remains indexable.
 */
const productionReleaseFlags = {
  NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED: "true",
  NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED: "true",
  NEXT_PUBLIC_SMART_TAGS_ENABLED: "true",
  NEXT_PUBLIC_TAG_ORDERS_ENABLED: "true",
  NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED: "true",
  NEXT_PUBLIC_SOCIAL_ENABLED: "true",
};

/**
 * Public, search-facing and commerce-messaging tests, run a second time with
 * the production flags. These assert against the flag values they run with
 * rather than hard-coding one configuration. Owner Portal tests are not in this
 * list: they describe the default (pre-launch) configuration on purpose.
 */
const productionFlagSuites = [
  "src/lib/seo.test.ts",
  "src/lib/seoRoutes.test.ts",
  "src/lib/publicCommerceAvailability.test.ts",
  "src/lib/productTerminology.test.ts",
  "src/app/page.test.tsx",
  "src/app/pricing/**/*.test.tsx",
  "src/components/layouts/PublicLayout.seo.test.tsx",
  "src/components/layouts/PublicNav.test.tsx",
  "src/components/layouts/ContextualSocialShell.test.tsx",
  "src/components/layouts/SocialLayoutVisitorShell.test.tsx",
  "src/components/marketing/**/*.test.tsx",
  "src/components/social/ExploreIntro.test.tsx",
  "src/components/social/PublicCommunityAccess.test.tsx",
  "src/components/auth/OwnerLoginExperience.test.tsx",
  "edge/**/*.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // These scripts use node:test and retain their separate runner.
    exclude: [...configDefaults.exclude, "scripts/**/*.test.mjs"],
    projects: [
      {
        extends: true,
        test: { name: "default-flags" },
      },
      {
        extends: true,
        test: {
          name: "production-flags",
          include: productionFlagSuites,
          env: productionReleaseFlags,
        },
      },
    ],
  },
});
