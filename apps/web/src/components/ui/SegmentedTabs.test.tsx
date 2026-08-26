// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SegmentedTabs, type SegmentedTab } from "./SegmentedTabs";

const syntheticTabs: SegmentedTab[] = [
  { id: "first", label: "First destination" },
  { id: "second", label: "Second destination" },
  { id: "third", label: "Third destination" },
  { id: "archived", label: "Archived destination" },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(
    function (this: Element) {
      return this.getAttribute("role") === "tablist" ? 190 : 0;
    }
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this instanceof HTMLButtonElement
        ? (this.textContent?.trim().length ?? 0) * 8 + 32
        : 0;
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps genuine overflow functional and marks the selected item unambiguously", async () => {
  const onChange = vi.fn();
  const { container } = render(
    <SegmentedTabs
      activeId="archived"
      onChange={onChange}
      tabs={syntheticTabs}
    />
  );

  const more = await waitFor(() =>
    screen.getByRole("button", {
      name: "Archived destination, more filters",
    })
  );
  expect(more.textContent).toContain("Archived destination");
  fireEvent.click(more);

  const selectedItem = screen.getByRole("menuitem", {
    name: /Archived destination.*Selected/,
  });
  const selectedMarker = selectedItem.querySelector(
    "[data-segmented-tab-selected-marker]"
  );

  expect(selectedMarker?.textContent).toBe("Selected");
  expect(selectedItem.textContent).not.toContain("Active");
  expect(selectedItem.getAttribute("aria-current")).toBe("true");
  fireEvent.click(selectedItem);
  expect(onChange).toHaveBeenCalledWith("archived");
  expect(screen.queryByRole("menu")).toBeNull();

  const measurementRow = container.querySelector<HTMLElement>(
    '[aria-hidden="true"]'
  );
  expect(measurementRow).toBeTruthy();
  expect(measurementRow?.classList.contains("opacity-0")).toBe(true);
  expect(measurementRow?.querySelectorAll("button")).toHaveLength(
    syntheticTabs.length + 1
  );
  for (const button of measurementRow?.querySelectorAll("button") ?? []) {
    expect(button.tabIndex).toBe(-1);
  }
});
