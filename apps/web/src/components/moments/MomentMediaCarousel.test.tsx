// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import type { MomentMedia, PetMoment } from "@/types";
import { MomentMediaCarousel } from "./MomentMediaCarousel";

const photoOne: MomentMedia = {
  id: "photo-one",
  type: "image",
  url: "https://media.mypetlink.com.my/moments/photo-one.jpg",
  altText: "First photo",
  sortOrder: 0,
};

const photoTwo: MomentMedia = {
  id: "photo-two",
  type: "image",
  url: "https://media.mypetlink.com.my/moments/photo-two.jpg",
  altText: "Second photo",
  sortOrder: 1,
};

const video: MomentMedia = {
  id: "video-one",
  type: "video",
  url: "https://media.mypetlink.com.my/moments/video-one.mp4",
  altText: "First video",
  sortOrder: 0,
};

const videoTwo: MomentMedia = {
  id: "video-two",
  type: "video",
  url: "https://media.mypetlink.com.my/moments/video-two.mp4",
  altText: "Second video",
  sortOrder: 0,
};

function makeMoment(media: MomentMedia[], id = "moment-one"): PetMoment {
  return {
    id,
    petId: "pet-one",
    title: id === "moment-one" ? "Beach day" : "Park day",
    date: "11 Jul 2026",
    type: "Outdoor / Trip",
    caption: "A bright afternoon by the water.",
    media,
    coverMediaId: media[0]?.id,
    visibility: "Public",
    showOnPublicProfile: true,
    showInLifeTimeline: true,
    timelineNote: "First beach trip.",
  };
}

describe("MomentMediaCarousel", () => {
  let pauseMock: ReturnType<typeof vi.spyOn>;
  let playMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pauseMock = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    pauseMock.mockRestore();
    playMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("renders a photo-only moment with its counter", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne])} />);

    expect(screen.getByAltText("First photo")).toBeTruthy();
    expect(screen.getByLabelText("Media 1 of 1").textContent).toBe("1 / 1");
  });

  it("shows a centered Play button and duration before inline video playback", () => {
    render(<MomentMediaCarousel moment={makeMoment([video])} />);

    const preview = screen.getByLabelText("First video") as HTMLVideoElement;
    Object.defineProperty(preview, "duration", {
      configurable: true,
      value: 11,
    });
    fireEvent.loadedMetadata(preview);

    const playButton = screen.getByRole("button", { name: "Play First video" });
    expect(playButton.className).toContain("h-16");
    expect(preview.preload).toBe("metadata");
    expect(preview.autoplay).toBe(false);
    expect(preview.controls).toBe(false);
    expect(screen.getByText("0:11")).toBeTruthy();
  });

  it("starts and pauses inline playback without opening the viewer", () => {
    render(<MomentMediaCarousel moment={makeMoment([video])} />);

    fireEvent.click(screen.getByRole("button", { name: "Play First video" }));
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause First video" })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("First video"));
    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play First video" })).toBeTruthy();
  });

  it("opens the viewer only from Expand for a video and at the correct index", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([photoOne, { ...video, sortOrder: 1 }])}
      />
    );
    fireEvent.click(screen.getByLabelText("Next media"));
    fireEvent.click(screen.getByRole("button", { name: "Expand video 2 of 2" }));

    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    expect(within(dialog).getByLabelText("Media 2 of 2").textContent).toBe("2 / 2");
    expect(within(dialog).getByLabelText("First video")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Play First video" })).toBeTruthy();
  });

  it("opens the viewer when a photo is selected", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne])} />);

    fireEvent.click(screen.getByLabelText("Open Beach day photo 1 of 1"));
    expect(screen.getByRole("dialog", { name: "Beach day media viewer" })).toBeTruthy();
  });

  it("keeps mixed video and photo media in SortOrder", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([
          { ...photoOne, sortOrder: 2 },
          { ...video, sortOrder: 1 },
        ])}
      />
    );

    expect(screen.getByLabelText("First video")).toBeTruthy();
    expect(screen.queryByAltText("First photo")).toBeNull();
  });

  it("changes slides with a horizontal swipe while preserving vertical pan", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);
    const carousel = screen.getByRole("region", {
      name: "Beach day media carousel",
    });

    expect(carousel.style.touchAction).toBe("pan-y");
    fireEvent.pointerDown(carousel, { clientX: 220, clientY: 150 });
    fireEvent.pointerUp(carousel, { clientX: 110, clientY: 156 });

    expect(screen.getByAltText("Second photo")).toBeTruthy();
    expect(screen.getByLabelText("Media 2 of 2").textContent).toBe("2 / 2");
  });

  it("changes slides with wrapping desktop arrow and pagination controls", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);

    fireEvent.click(screen.getByLabelText("Next media"));
    expect(screen.getByAltText("Second photo")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next media"));
    expect(screen.getByAltText("First photo")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show image 2 of 2"));
    expect(screen.getByAltText("Second photo")).toBeTruthy();
  });

  it("pauses video when carousel navigation changes the active media", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([video, { ...photoOne, sortOrder: 1 }])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Play First video" }));
    pauseMock.mockClear();
    fireEvent.click(screen.getByLabelText("Next media"));

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByAltText("First photo")).toBeTruthy();
  });

  it("pauses the previously playing video when another Moment starts", () => {
    render(
      <>
        <MomentMediaCarousel moment={makeMoment([video])} />
        <MomentMediaCarousel moment={makeMoment([videoTwo], "moment-two")} />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Play First video" }));
    pauseMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Play Second video" }));

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play First video" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause Second video" })).toBeTruthy();
  });

  it("pauses viewer video, restores scroll, and returns focus on close", () => {
    render(<MomentMediaCarousel moment={makeMoment([video])} />);
    const trigger = screen.getByRole("button", { name: "Expand video 1 of 1" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Play First video" }));
    pauseMock.mockClear();

    fireEvent.click(within(dialog).getByLabelText("Close media viewer"));

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.position).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("supports viewer swipe, arrow keys, and Escape without changing the card index", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand image 1 of 2" }));
    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    const slide = within(dialog).getByRole("group", { name: "Media slide" });

    fireEvent.pointerDown(slide, { clientX: 220, clientY: 150 });
    fireEvent.pointerUp(slide, { clientX: 100, clientY: 154 });
    expect(within(dialog).getByAltText("Second photo")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(within(dialog).getByAltText("First photo")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(within(dialog).getByAltText("Second photo")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByAltText("First photo")).toBeTruthy();
  });

  it("traps focus in the viewer and closes on the outer backdrop only", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);
    const trigger = screen.getByRole("button", { name: "Expand image 1 of 2" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    const close = within(dialog).getByLabelText("Close media viewer");

    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByAltText("First photo"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Play, arrows, dots, and Expand from invoking photo selection", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([video, { ...photoOne, sortOrder: 1 }])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Play First video" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText("Next media"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText("Show video 1 of 2"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand video 1 of 2" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("pauses a playing preview when its Moment leaves the viewport", () => {
    let observerCallback: IntersectionObserverCallback = () => undefined;
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
      root = null;
      rootMargin = "0px";
      thresholds = [0.15];
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    render(<MomentMediaCarousel moment={makeMoment([video])} />);
    fireEvent.click(screen.getByRole("button", { name: "Play First video" }));
    pauseMock.mockClear();

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play First video" })).toBeTruthy();
  });

  it("keeps Moment details and public/owner card actions intact", () => {
    const moment = makeMoment([photoOne]);
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <PetMomentCard
        moment={moment}
        onDelete={onDelete}
        onEdit={onEdit}
        publicView
      />
    );

    expect(screen.getByText("Beach day")).toBeTruthy();
    expect(screen.getByText("11 Jul 2026")).toBeTruthy();
    expect(screen.getByText("A bright afternoon by the water.")).toBeTruthy();
    expect(screen.getByLabelText("Media 1 of 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    rerender(
      <PetMomentCard moment={moment} onDelete={onDelete} onEdit={onEdit} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("keeps the mobile media width stable without horizontal overflow", () => {
    render(<MomentMediaCarousel moment={makeMoment([video, photoOne])} />);
    const carousel = screen.getByRole("region", {
      name: "Beach day media carousel",
    });

    expect(carousel.style.maxWidth).toBe("100%");
    expect(carousel.className).toContain("overflow-hidden");
    expect(carousel.className).toContain("w-full");
    expect(screen.getByRole("button", { name: "Play First video" }).className).toContain(
      "h-16"
    );
  });
});
