// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ suggestions: vi.fn(), submit: vi.fn() }));

vi.mock("@/services/momentCommentService", async () => {
  const actual = await vi.importActual<typeof import("@/services/momentCommentService")>(
    "@/services/momentCommentService"
  );
  return { ...actual, getCommentMentionSuggestions: (...args: unknown[]) => mocks.suggestions(...args) };
});

import {
  activeMentionToken,
  CommentMentionComposer,
  insertMention,
} from "@/components/social/CommentMentionComposer";

const ra = {
  household: {
    handle: "rahmanpets",
    displayName: "The Rahman Family",
    avatarUrl: null,
    avatarThumbnailUrl: null,
  },
  context: "following" as const,
};
const teoh = {
  household: {
    handle: "teohfamily",
    displayName: "The Teoh Family",
    avatarUrl: null,
    avatarThumbnailUrl: null,
  },
  context: "author" as const,
};

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <CommentMentionComposer
      disabled={false}
      hasError={false}
      inputRef={ref}
      momentId="moment-1"
      onChange={setValue}
      onSubmit={mocks.submit}
      value={value}
    />
  );
}

async function passDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.suggestions.mockResolvedValue({ query: "ra", items: [ra, teoh] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Comment mention token detection", () => {
  it.each([
    ["Hello @ra", 9, "ra"],
    ["@teoh", 5, "teoh"],
    ["Thanks @teoh.", 13, "teoh"],
  ])("finds a token at the caret in %s", (value, caret, query) => {
    expect(activeMentionToken(value, caret)?.query).toBe(query);
  });

  it.each(["kai@company.com", "https://x.com/@rahmanpets", "@@rah"])(
    "does not offer identity suggestions inside %s",
    (value) => expect(activeMentionToken(value, value.length)).toBeNull()
  );

  it("replaces only the active token and preserves multiline text around it", () => {
    const value = "Before\nHello @ra again\nAfter";
    const token = activeMentionToken(value, value.indexOf(" again"));
    expect(token).not.toBeNull();
    expect(insertMention(value, token!, "rahmanpets")).toEqual({
      value: "Before\nHello @rahmanpets  again\nAfter",
      caret: "Before\nHello @rahmanpets ".length,
    });
  });
});

describe("CommentMentionComposer", () => {
  it("debounces requests and preserves the backend's result order", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Hello @ra", selectionStart: 9 } });

    act(() => vi.advanceTimersByTime(249));
    expect(mocks.suggestions).not.toHaveBeenCalled();
    await passDebounce();

    expect(mocks.suggestions).toHaveBeenCalledWith("moment-1", "ra");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "The Rahman Family@rahmanpetsFollowing",
      "The Teoh Family@teohfamilyAuthor",
    ]);
  });

  it("ignores a stale response after the active token changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.suggestions
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ query: "te", items: [teoh] });
    render(<Harness />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "@ra", selectionStart: 3 } });
    await passDebounce();
    fireEvent.change(input, { target: { value: "@te", selectionStart: 3 } });
    await passDebounce();
    expect(screen.getByRole("option").textContent).toContain("Teoh");

    await act(async () => {
      resolveFirst({ query: "ra", items: [ra] });
      await Promise.resolve();
    });
    expect(screen.getByRole("option").textContent).toContain("Teoh");
  });

  it("supports arrow keys and Enter without submitting", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hi @ra", selectionStart: 6 } });
    await passDebounce();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toContain("option-1");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(input.value).toBe("Hi @teohfamily ");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("supports pointer selection and returns the caret after the inserted handle", async () => {
    render(<Harness initial={"Before @ra after"} />);
    const input = screen.getByRole("combobox") as HTMLTextAreaElement;
    input.setSelectionRange(10, 10);
    fireEvent.select(input);
    await passDebounce();

    fireEvent.mouseDown(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getAllByRole("option")[0]);
    await act(async () => vi.runAllTimers());

    expect(input.value).toBe("Before @rahmanpets  after");
    expect(input.selectionStart).toBe("Before @rahmanpets ".length);
  });

  it("never lets suggestion insertion exceed the 500-character Comment limit", async () => {
    const initial = `${"x".repeat(496)} @ra`;
    render(<Harness initial={initial} />);
    const input = screen.getByRole("combobox") as HTMLTextAreaElement;
    input.setSelectionRange(500, 500);
    fireEvent.select(input);
    await passDebounce();

    fireEvent.click(screen.getAllByRole("option")[0]);

    expect(input.value).toBe(initial);
    expect(screen.getByText("Shorten your comment to add this mention.")).toBeTruthy();
  });

  it("closes with Escape and does not trap Tab", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@ra", selectionStart: 3 } });
    await passDebounce();

    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyUp(input, { key: "Escape" });
    fireEvent.select(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.change(input, { target: { value: "@rah", selectionStart: 4 } });
    expect(input.getAttribute("aria-expanded")).toBe("true");

    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it("shows quiet empty, error, and rate-limit states without changing the text", async () => {
    for (const outcome of [
      { query: "ra", items: [] },
      new Error("offline"),
      { status: 429, code: "rate_limit_exceeded", message: "Slow down" },
    ]) {
      mocks.suggestions.mockReset();
      if (outcome instanceof Error || "status" in outcome) mocks.suggestions.mockRejectedValue(outcome);
      else mocks.suggestions.mockResolvedValue(outcome);
      const view = render(<Harness />);
      const input = view.getByRole("combobox") as HTMLTextAreaElement;
      fireEvent.change(input, { target: { value: "@ra", selectionStart: 3 } });
      await passDebounce();
      expect(
        view.getByText(
          outcome instanceof Error || "status" in outcome
            ? "Suggestions unavailable right now."
            : "No matching households."
        )
      ).toBeTruthy();
      expect(input.value).toBe("@ra");
      view.unmount();
    }
  });

  it("still submits when suggestions are unavailable", async () => {
    mocks.suggestions.mockRejectedValue(new Error("offline"));
    render(<Harness />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "@ra", selectionStart: 3 } });
    await passDebounce();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
