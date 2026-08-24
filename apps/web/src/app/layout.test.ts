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

it("enables safe-area insets through the supported Next.js viewport export", () => {
  expect(viewport).toEqual({ viewportFit: "cover" });
});
