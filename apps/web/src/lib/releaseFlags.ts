// Build-time guard for the switches that decide what the public site sells
// and what it asks search engines to index.
//
// Each of these flags defaults to OFF in `features.ts`, which is the right
// default for local work and the wrong one for a release: a production build
// that simply forgot a variable would quietly relabel the Smart Tag "Coming
// Soon", hide every "Get a Smart Tag" button, drop /where-to-buy from the
// sitemap and noindex /explore — and nothing would fail. A release has to state
// every one of them, "true" or "false", so an omission stops the build instead
// of changing the product.

export const statedReleaseFlags = [
  "NEXT_PUBLIC_SMART_TAGS_ENABLED",
  "NEXT_PUBLIC_TAG_ORDERS_ENABLED",
  "NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED",
  "NEXT_PUBLIC_SOCIAL_ENABLED",
] as const;

type ReleaseFlagEnvironment = Partial<
  Record<(typeof statedReleaseFlags)[number], string | undefined>
>;

export function findReleaseFlagProblems(env: ReleaseFlagEnvironment) {
  const problems: string[] = [];

  for (const key of statedReleaseFlags) {
    const value = env[key];
    if (value !== "true" && value !== "false") {
      problems.push(`${key} must be explicitly set to "true" or "false".`);
    }
  }

  // Ordering without the order pages would advertise a purchase whose button
  // lands on "Smart Tags coming soon".
  if (
    env.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED === "true" &&
    (env.NEXT_PUBLIC_SMART_TAGS_ENABLED !== "true" ||
      env.NEXT_PUBLIC_TAG_ORDERS_ENABLED !== "true")
  ) {
    problems.push(
      "NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED=true also requires NEXT_PUBLIC_SMART_TAGS_ENABLED=true and NEXT_PUBLIC_TAG_ORDERS_ENABLED=true."
    );
  }

  return problems;
}

export function assertProductionReleaseFlags(
  environment = process.env.NODE_ENV,
  env: ReleaseFlagEnvironment = {
    NEXT_PUBLIC_SMART_TAGS_ENABLED: process.env.NEXT_PUBLIC_SMART_TAGS_ENABLED,
    NEXT_PUBLIC_TAG_ORDERS_ENABLED: process.env.NEXT_PUBLIC_TAG_ORDERS_ENABLED,
    NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED:
      process.env.NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED,
    NEXT_PUBLIC_SOCIAL_ENABLED: process.env.NEXT_PUBLIC_SOCIAL_ENABLED,
  }
) {
  if (environment !== "production") {
    return;
  }

  const problems = findReleaseFlagProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Production builds must state the Smart Tag and Community release flags.\n${problems.join("\n")}`
    );
  }
}
