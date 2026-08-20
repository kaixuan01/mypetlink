import { describe, expect, it } from "vitest";
import { assertProductionApiConfiguration } from "./apiConfig";

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
