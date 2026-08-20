// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getAllTags: vi.fn(),
  getOrders: vi.fn(),
}));

vi.mock("@/components/layouts/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/features", () => ({
  smartTagsEnabled: false,
  tagOrdersEnabled: false,
  smartTagOrderingEnabled: false,
}));

vi.mock("@/services/petService", () => ({
  getPets: mocks.getPets,
}));

vi.mock("@/services/tagService", () => ({
  getAllTags: mocks.getAllTags,
  getOrders: mocks.getOrders,
}));

const { default: TagsPage } = await import("./tags/page");
const { default: OrdersPage } = await import("./orders/page");
const { default: OrderViewPage } = await import("./orders/view/page");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  ["Smart Tags", TagsPage],
  ["Orders", OrdersPage],
  ["Order detail", OrderViewPage],
])("gates the disabled %s owner route before loading management data", async (_label, page) => {
  render(await page());

  expect(screen.getByText("Smart Tags coming soon")).toBeTruthy();
  expect(mocks.getPets).not.toHaveBeenCalled();
  expect(mocks.getAllTags).not.toHaveBeenCalled();
  expect(mocks.getOrders).not.toHaveBeenCalled();
});
