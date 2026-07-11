// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentMediaCarousel } from "./MomentMediaCarousel";
import { PetMomentCard } from "@/components/portal/PetMomentCard";
import type { MomentMedia, PetMoment } from "@/types";

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

function makeMoment(media: MomentMedia[]): PetMoment {
  return {
    id: "moment-one",
    petId: "pet-one",
    title: "Beach day",
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

  beforeEach(() => {
    pauseMock = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
    pauseMock.mockRestore();
  });

  it("renders a photo-only moment", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne])} />);

    expect(screen.getByAltText("First photo")).toBeTruthy();
    expect(screen.getByLabelText("Media 1 of 1").textContent).toBe("1 / 1");
  });

  it("renders a real video preview with a play icon and duration", () => {
    render(<MomentMediaCarousel moment={makeMoment([video])} />);

    const preview = screen.getByLabelText("First video") as HTMLVideoElement;
    Object.defineProperty(preview, "duration", {
      configurable: true,
      value: 11,
    });
    fireEvent.loadedMetadata(preview);

    expect(preview.preload).toBe("metadata");
    expect(preview.autoplay).toBe(false);
    expect(screen.getByLabelText("Play video")).toBeTruthy();
    expect(screen.getByText("0:11")).toBeTruthy();
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

  it("changes slides with a horizontal swipe without disabling vertical pan", () => {
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

  it("changes slides with desktop arrow controls", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);

    fireEvent.click(screen.getByLabelText("Next media"));
    expect(screen.getByAltText("Second photo")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Previous media"));
    expect(screen.getByAltText("First photo")).toBeTruthy();
  });

  it("pauses video when leaving its slide", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([video, { ...photoOne, sortOrder: 1 }])}
      />
    );

    fireEvent.click(screen.getByLabelText("Next media"));
    expect(pauseMock).toHaveBeenCalled();
    expect(screen.getByAltText("First photo")).toBeTruthy();
  });

  it("opens the viewer when the active media is selected", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne])} />);

    fireEvent.click(screen.getByLabelText("Open Beach day photo 1 of 1"));
    expect(screen.getByRole("dialog", { name: "Beach day media viewer" })).toBeTruthy();
  });

  it("viewer supports image and video with next and previous navigation", () => {
    render(
      <MomentMediaCarousel
        moment={makeMoment([photoOne, { ...video, sortOrder: 1 }])}
      />
    );
    fireEvent.click(screen.getByLabelText("Open Beach day photo 1 of 2"));

    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    expect(within(dialog).getByAltText("First photo")).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText("Next media"));

    const viewerVideo = within(dialog).getByLabelText("First video") as HTMLVideoElement;
    expect(viewerVideo.controls).toBe(true);
    fireEvent.click(within(dialog).getByLabelText("Previous media"));
    expect(within(dialog).getByAltText("First photo")).toBeTruthy();
  });

  it("viewer supports swipe navigation and Escape to close", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);
    fireEvent.click(screen.getByLabelText("Open Beach day photo 1 of 2"));
    const dialog = screen.getByRole("dialog", { name: "Beach day media viewer" });
    const slide = within(dialog).getByRole("group", { name: "Media slide" });

    fireEvent.pointerDown(slide, { clientX: 220, clientY: 150 });
    fireEvent.pointerUp(slide, { clientX: 100, clientY: 154 });
    expect(within(dialog).getByAltText("Second photo")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pauses video and restores the page when the viewer closes", () => {
    render(<MomentMediaCarousel moment={makeMoment([video])} />);
    const trigger = screen.getByLabelText("Open Beach day video 1 of 1");
    trigger.focus();
    fireEvent.click(trigger);
    pauseMock.mockClear();

    fireEvent.click(screen.getByLabelText("Close media viewer"));
    expect(pauseMock).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.position).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps owner actions out of public cards", () => {
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

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    rerender(
      <PetMomentCard moment={moment} onDelete={onDelete} onEdit={onEdit} />
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("constrains the mobile carousel without horizontal overflow", () => {
    render(<MomentMediaCarousel moment={makeMoment([photoOne, photoTwo])} />);
    const carousel = screen.getByRole("region", {
      name: "Beach day media carousel",
    });

    expect(carousel.style.maxWidth).toBe("100%");
    expect(carousel.className).toContain("overflow-hidden");
    expect(carousel.className).toContain("w-full");
  });
});
