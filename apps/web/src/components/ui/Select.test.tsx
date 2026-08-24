// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect, Select, type SelectOption } from "./Select";

const shortOptions = [
  { value: "cat", label: "Cat" },
  { value: "dog", label: "Dog" },
  { value: "rabbit", label: "Rabbit" },
] as const;

const longOptions: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: `option-${index + 1}`,
  label:
    index === 11
      ? "A deliberately long option label that must stay inside the menu"
      : `Option ${index + 1}`,
  keywords: [`choice-${index + 1}`],
}));

afterEach(cleanup);

describe("Select", () => {
  it("opens one accessible listbox without focusing its search input", () => {
    render(
      <Select
        aria-label="Pet type"
        onChange={vi.fn()}
        options={shortOptions}
        searchable
        value="dog"
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: /Dog/ }).getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(screen.getByRole("searchbox", { name: "Search options" })).toBeTruthy();
    expect(document.activeElement).toBe(trigger);
    expect(document.activeElement?.tagName).not.toMatch(/INPUT|TEXTAREA/);
  });

  it("supports Arrow keys, Home, End, Enter, Escape, and focus restoration", () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="Pet type"
        onChange={onChange}
        options={shortOptions}
        value={null}
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-activedescendant")).toContain("option-0");
    fireEvent.keyDown(trigger, { key: "End" });
    expect(trigger.getAttribute("aria-activedescendant")).toContain("option-2");
    fireEvent.keyDown(trigger, { key: "Home" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("dog", shortOptions[1]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("skips disabled options during keyboard navigation", () => {
    const onChange = vi.fn();
    const options = [
      { value: "cat", label: "Cat", disabled: true },
      { value: "dog", label: "Dog" },
    ] as const;
    render(
      <Select
        aria-label="Pet type"
        onChange={onChange}
        options={options}
        value={null}
      />
    );

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("dog", options[1]);
  });

  it("dismisses on an outside pointer interaction", () => {
    render(
      <Select
        aria-label="Pet type"
        onChange={vi.fn()}
        options={shortOptions}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Pet type" }));
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("omits search for short lists, enables it at ten options, and allows overrides", () => {
    const { rerender } = render(
      <Select
        aria-label="Short"
        key="short"
        onChange={vi.fn()}
        options={shortOptions}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Short" }));
    expect(screen.queryByRole("searchbox")).toBeNull();

    rerender(
      <Select
        aria-label="Long"
        key="long"
        onChange={vi.fn()}
        options={longOptions}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Long" }));
    expect(screen.getByRole("searchbox")).toBeTruthy();

    rerender(
      <Select
        aria-label="Long without search"
        key="long-without-search"
        onChange={vi.fn()}
        options={longOptions}
        searchable={false}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Long without search" }));
    expect(screen.queryByRole("searchbox")).toBeNull();

    rerender(
      <SearchableSelect
        aria-label="Short with search"
        key="short-with-search"
        onChange={vi.fn()}
        options={shortOptions}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Short with search" }));
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("filters only after explicit search focus and exposes an empty result", () => {
    render(
      <Select
        aria-label="Country"
        emptyMessage={(query) => `No result for ${query}`}
        onChange={vi.fn()}
        options={longOptions}
        value={null}
      />
    );
    const trigger = screen.getByRole("combobox", { name: "Country" });
    trigger.focus();
    fireEvent.click(trigger);
    const search = screen.getByRole("searchbox");

    expect(document.activeElement).toBe(trigger);
    search.focus();
    fireEvent.change(search, { target: { value: "missing" } });

    expect(document.activeElement).toBe(search);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("No result for missing");
  });

  it("renders disabled and long-option states without changing the interaction model", () => {
    const { rerender } = render(
      <Select
        aria-label="Disabled select"
        disabled
        onChange={vi.fn()}
        options={longOptions}
        value={null}
      />
    );
    const disabledTrigger = screen.getByRole("combobox", { name: "Disabled select" });
    expect(disabledTrigger).toHaveProperty("disabled", true);
    fireEvent.click(disabledTrigger);
    expect(screen.queryByRole("listbox")).toBeNull();

    rerender(
      <Select
        aria-label="Long option"
        onChange={vi.fn()}
        options={longOptions}
        value={null}
      />
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Long option" }));
    expect(
      screen
        .getByRole("option", { name: /deliberately long option label/ })
        .querySelector("span")?.className
    ).toContain("truncate");
  });
});
