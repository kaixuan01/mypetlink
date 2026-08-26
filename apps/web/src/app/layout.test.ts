import { expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Noto_Sans: () => ({ variable: "--font-noto-sans" }),
  Poppins: () => ({ variable: "--font-poppins" }),
}));

vi.mock("@/components/analytics/AnalyticsProvider", () => ({
  AnalyticsProvider: () => null,
}));

vi.mock("@/components/ui/ServiceWakeUpState", () => ({
  ServiceWakeUpState: () => null,
}));

const { viewport } = await import("./layout");

it("uses one supported viewport export for safe areas and keyboard resizing", () => {
  expect(viewport).toEqual({
    interactiveWidget: "resizes-content",
    viewportFit: "cover",
  });
});
