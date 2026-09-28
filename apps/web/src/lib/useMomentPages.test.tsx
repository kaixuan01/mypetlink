// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceMomentCreated } from "@/lib/momentChanges";
import { useMomentPages } from "@/lib/useMomentPages";
import type {
  PublicMomentListItem,
  PublicMomentPage,
} from "@/services/publicSocialService";

function item(id: string, likeCount = 0) {
  return { id, title: id, likeCount, viewerHasLiked: false } as unknown as PublicMomentListItem;
}

function page(ids: string[], nextCursor: string | null = null): PublicMomentPage {
  return { items: ids.map((id) => item(id)), nextCursor } as PublicMomentPage;
}

afterEach(cleanup);

describe("useMomentPages after a Moment is shared", () => {
  it("adds the new Moment at the top and keeps every page already loaded", async () => {
    const load = vi
      .fn<(cursor?: string) => Promise<PublicMomentPage>>()
      .mockResolvedValueOnce(page(["b", "c"], "cursor-1"))
      .mockResolvedValueOnce(page(["d", "e"]))
      .mockResolvedValueOnce(page(["a", "b", "c"], "cursor-1"));

    const { result } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    await act(() => result.current.loadMore());

    // A like the reader already gave must survive the refresh.
    act(() => result.current.onLikeChange("d", { likeCount: 4, viewerHasLiked: true }));

    act(() => announceMomentCreated());

    await waitFor(() =>
      expect(result.current.moments.map((moment) => moment.id)).toEqual([
        "a",
        "b",
        "c",
        "d",
        "e",
      ])
    );
    // No skeleton, no reset to page one, and the next page is untouched.
    expect(result.current.state).toBe("ready");
    expect(result.current.moments.find((moment) => moment.id === "d")?.likeCount).toBe(4);
    expect(load).toHaveBeenLastCalledWith();
  });

  it("changes nothing when the server does not put the Moment in this listing", async () => {
    // A Moment kept to "Only me" is in no public listing's answer.
    const load = vi
      .fn<(cursor?: string) => Promise<PublicMomentPage>>()
      .mockResolvedValue(page(["b", "c"]));

    const { result } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    const before = result.current.moments;

    act(() => announceMomentCreated());

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.moments).toBe(before);
  });

  it("tries again when the listing had failed to load", async () => {
    const load = vi
      .fn<(cursor?: string) => Promise<PublicMomentPage>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(["a"]));

    const { result } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("error"));

    act(() => announceMomentCreated());

    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.moments.map((moment) => moment.id)).toEqual(["a"]);
  });

  it("keeps the listing when the refresh itself fails", async () => {
    const load = vi
      .fn<(cursor?: string) => Promise<PublicMomentPage>>()
      .mockResolvedValueOnce(page(["b"]))
      .mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    act(() => announceMomentCreated());

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(result.current.state).toBe("ready");
    expect(result.current.moments.map((moment) => moment.id)).toEqual(["b"]);
  });

  it("stops listening once the listing is gone", async () => {
    const load = vi
      .fn<(cursor?: string) => Promise<PublicMomentPage>>()
      .mockResolvedValue(page(["b"]));

    const { result, unmount } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    unmount();

    announceMomentCreated();

    expect(load).toHaveBeenCalledTimes(1);
  });
});
