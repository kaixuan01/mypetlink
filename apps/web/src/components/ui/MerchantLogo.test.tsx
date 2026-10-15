// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MerchantLogo } from "./MerchantLogo";

afterEach(cleanup);
describe("MerchantLogo", () => {
  it("reserves responsive square space and contains the entire image", () => {
    render(<MerchantLogo name="Happy Pets" src="https://media.example.test/wide-logo.png" />);
    const image = screen.getByAltText("Happy Pets logo");
    expect(image.getAttribute("width")).toBe("72");
    expect(image.className).toContain("object-contain");
    expect(image.parentElement?.className).toContain("h-14 w-14");
    expect(image.parentElement?.className).toContain("sm:h-[72px]");
    expect(image.parentElement?.className).toContain("shrink-0");
  });
  it("shows an initial for absent or failed images and accepts a replacement URL", () => {
    const { rerender } = render(<MerchantLogo name="Happy Pets" />);
    expect(screen.getByRole("img", { name: "Happy Pets logo placeholder" }).textContent).toBe("H");
    rerender(<MerchantLogo name="Happy Pets" src="https://media.example.test/broken.png" />);
    fireEvent.error(screen.getByAltText("Happy Pets logo"));
    expect(screen.queryByAltText("Happy Pets logo")).toBeNull();
    expect(screen.getByRole("img", { name: "Happy Pets logo placeholder" })).toBeTruthy();
    rerender(<MerchantLogo name="Happy Pets" src="https://media.example.test/new.png" />);
    expect(screen.getByAltText("Happy Pets logo")).toBeTruthy();
  });
});
