import type { PublicMomentListItem } from "@/services/publicSocialService";
import fixtureData from "@/testFixtures/communityMomentMedia.json";

/**
 * Development/test-only Moment media cases.
 *
 * Nothing imports these from production code. Browser QA serves the URLs from
 * this folder through request interception, which exercises the same public
 * DTO and media URL contract without inserting rows or uploading objects to R2.
 */
export const communityMomentMediaFixtures =
  fixtureData as PublicMomentListItem[];

export function communityMomentMediaFixture(id: string) {
  const fixture = communityMomentMediaFixtures.find((item) => item.id === id);

  if (!fixture) {
    throw new Error(`Unknown Community Moment fixture: ${id}`);
  }

  return fixture;
}
