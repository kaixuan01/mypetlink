// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentVideoPlayer } from "@/components/moments/MomentVideoPlayer";

/**
 * When a Moment video is allowed to start by itself, and when it must not.
 *
 * The rules are the familiar ones, and each exists because the alternative is
 * unpleasant: it never makes a sound unasked, it stops the moment it scrolls
 * away, only one video in a page is ever playing, and somebody who presses pause
 * stays paused. A feed that ignores any one of those is a feed people mute at
 * the operating system.
 *
 * jsdom implements no playback, so `play` and `pause` are observed rather than
 * performed. That is the right level: what is under test is which instructions
 * the component gives the element, which is the part it controls.
 */

type ObserverEntry = { isIntersecting: boolean; intersectionRatio: number };
type ObserverCallback = (entries: ObserverEntry[]) => void;

const observers: { callback: ObserverCallback; element: Element }[] = [];

class TestIntersectionObserver {
  constructor(private readonly callback: ObserverCallback) {}

  observe(element: Element) {
    observers.push({ callback: this.callback, element });
  }

  disconnect() {
    for (let index = observers.length - 1; index >= 0; index -= 1) {
      if (observers[index].callback === this.callback) observers.splice(index, 1);
    }
  }

  unobserve() {}
}

/** Reports the visibility of one player to its own observer. */
function reveal(index: number, ratio: number) {
  act(() => {
    observers[index]?.callback([
      { isIntersecting: ratio > 0, intersectionRatio: ratio },
    ]);
  });
}

let played: string[] = [];
let paused: string[] = [];

beforeEach(() => {
  observers.length = 0;
  played = [];
  paused = [];
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLVideoElement
  ) {
    played.push(this.src);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLVideoElement
  ) {
    paused.push(this.src);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const clipOne = "https://media.test/one.mp4";
const clipTwo = "https://media.test/two.mp4";

function videos() {
  return Array.from(document.querySelectorAll("video"));
}

describe("a video that may start by itself", () => {
  it("starts, silently, once most of it is on screen", () => {
    render(<MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />);

    expect(played).toEqual([]);

    reveal(0, 0.8);

    expect(played).toEqual([clipOne]);
    expect(videos()[0].muted).toBe(true);
  });

  it("stays still while it is only partly on screen", () => {
    render(<MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />);

    // Half in view is somebody scrolling past, not somebody watching.
    reveal(0, 0.4);

    expect(played).toEqual([]);
  });

  it("stops when it is scrolled away", () => {
    render(<MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />);

    reveal(0, 0.8);
    reveal(0, 0);

    expect(paused).toContain(clipOne);
  });

  it("stays paused once somebody has paused it", () => {
    render(<MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />);

    reveal(0, 0.8);
    played = [];

    fireEvent.click(screen.getByRole("button", { name: /pause buddy swims/i }));
    fireEvent.pause(videos()[0]);

    // Scrolling away and back must not overrule the person watching.
    reveal(0, 0);
    reveal(0, 0.9);

    expect(played).toEqual([]);
  });

  it("lets one video play at a time", () => {
    render(
      <>
        <MomentVideoPlayer alt="First" autoplayWhenVisible url={clipOne} />
        <MomentVideoPlayer alt="Second" autoplayWhenVisible url={clipTwo} />
      </>
    );

    reveal(0, 0.9);
    reveal(1, 0.9);

    // Two videos talking over each other is the failure mode this prevents.
    expect(played).toEqual([clipOne, clipTwo]);
    expect(paused).toContain(clipOne);
  });
});

describe("a video that may not start by itself", () => {
  it("does nothing however much of it is on screen", () => {
    render(<MomentVideoPlayer alt="Buddy swims" url={clipOne} />);

    reveal(0, 1);

    expect(played).toEqual([]);
  });

  it("still stops when it scrolls away, whatever started it", () => {
    render(<MomentVideoPlayer alt="Buddy swims" url={clipOne} />);

    fireEvent.click(screen.getByRole("button", { name: /play buddy swims/i }));
    reveal(0, 0);

    expect(paused).toContain(clipOne);
  });

  it("never carries the autoplay attribute, in either mode", () => {
    const { rerender } = render(
      <MomentVideoPlayer alt="Buddy swims" url={clipOne} />
    );
    expect(videos()[0].hasAttribute("autoplay")).toBe(false);

    rerender(
      <MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />
    );

    // Autoplay is a decision this component makes from visibility, never a
    // standing instruction handed to the browser.
    expect(videos()[0].hasAttribute("autoplay")).toBe(false);
  });
});

describe("sound", () => {
  it("is off wherever a video can start on its own", () => {
    render(<MomentVideoPlayer alt="Buddy swims" autoplayWhenVisible url={clipOne} />);

    reveal(0, 0.9);

    expect(videos()[0].muted).toBe(true);
  });

  it("is available in the full-screen viewer, where a person asked for it", () => {
    render(<MomentVideoPlayer alt="Buddy swims" mode="viewer" url={clipOne} />);

    const video = videos()[0];

    // The lightbox is reached by choosing to open it, and it hands over the
    // browser's own controls — including volume. It is deliberately not on the
    // autoplay path, so nothing here can make a sound unasked.
    expect(video.muted).toBe(false);
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("autoplay")).toBe(false);
  });
});
