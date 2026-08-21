import { describe, expect, it } from "vitest";
import { buildBackendMomentPayload } from "./momentService";

describe("Moment date request mapping", () => {
  it("maps Sep, Sept, and a normal three-letter month to ISO", () => {
    expect(buildBackendMomentPayload({ date: "02 Sept 2020" }).date).toBe(
      "2020-09-02"
    );
    expect(buildBackendMomentPayload({ date: "15 Sep 2021" }).date).toBe(
      "2021-09-15"
    );
    expect(buildBackendMomentPayload({ date: "12 Oct 2023" }).date).toBe(
      "2023-10-12"
    );
  });
});
