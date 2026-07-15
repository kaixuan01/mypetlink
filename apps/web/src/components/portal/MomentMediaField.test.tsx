// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_MOMENT_MEDIA, type MomentMedia } from "@/types";
import { MomentMediaField } from "./MomentMediaField";

afterEach(cleanup);

describe("MomentMediaField limits", () => {
  it("preserves the shared five-item media limit for create and edit forms", () => {
    const items: MomentMedia[] = Array.from(
      { length: MAX_MOMENT_MEDIA },
      (_, index) => ({
        id: `media-${index}`,
        type: "image",
        url: `/media-${index}.jpg`,
        sortOrder: index,
      })
    );

    render(<MomentMediaField items={items} onChange={vi.fn()} />);

    expect(screen.getByText(`${MAX_MOMENT_MEDIA}/${MAX_MOMENT_MEDIA} media added`)).toBeTruthy();
    expect(screen.getByText(`You've reached the ${MAX_MOMENT_MEDIA} media limit for this memory.`)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add photo" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add video" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
