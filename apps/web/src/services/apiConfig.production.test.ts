import { describe, expect, it } from "vitest";
import {
  assertProductionApiConfiguration,
  assertProductionSafetyProfileOwnerUiConfiguration,
} from "./apiConfig";

describe("production API configuration", () => {
  it("rejects a production build without an API base URL", () => {
    expect(() => assertProductionApiConfiguration("production", "  ")).toThrow(
      /NEXT_PUBLIC_API_BASE_URL is required/
    );
  });

  it("allows intentional local preview mode outside production", () => {
    expect(() =>
      assertProductionApiConfiguration("development", "")
    ).not.toThrow();
  });

  it("allows production when the API base URL is configured", () => {
    expect(() =>
      assertProductionApiConfiguration(
        "production",
        "https://api.mypetlink.com.my"
      )
    ).not.toThrow();
  });
});

describe("production Safety Profile owner UI configuration", () => {
  it.each([undefined, "", "false", "TRUE"])(
    "rejects a production build when the launch flag is %s",
    (configured) => {
      expect(() =>
        assertProductionSafetyProfileOwnerUiConfiguration(
          "production",
          configured
        )
      ).toThrow(/must be explicitly set to true/);
    }
  );

  it("allows production only when the launch flag is explicitly true", () => {
    expect(() =>
      assertProductionSafetyProfileOwnerUiConfiguration("production", "true")
    ).not.toThrow();
  });

  it("preserves the disabled default outside production", () => {
    expect(() =>
      assertProductionSafetyProfileOwnerUiConfiguration("development", "false")
    ).not.toThrow();
  });
});
