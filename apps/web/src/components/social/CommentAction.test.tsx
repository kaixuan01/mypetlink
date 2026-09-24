// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommentAction } from "@/components/social/CommentAction";

const scrolled: Element[] = [];

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
  window.history.replaceState({}, "", "/moments/moment-1");
});

afterEach(() => cleanup());

describe("CommentAction", () => {
  it("links a card to the Moment's Comments", () => {
    render(<CommentAction commentCount={3} momentId="moment-1" momentTitle="Beach day" />);
    const link = screen.getByRole("link", { name: "Comments on Beach day. 3 comments." });

    expect(link.getAttribute("href")).toBe("/moments/moment-1#comments");
    expect(fireEvent.click(link)).toBe(true);
  });

  it("scrolls to the thread on the Moment's own page without a fragment entry", () => {
    render(
      <>
        <CommentAction commentCount={1} inPage momentId="moment-1" momentTitle="Beach day" />
        <section id="comments">
          <h2 id="comments-heading" tabIndex={-1}>
            Comments · 1
          </h2>
        </section>
      </>
    );
    const link = screen.getByRole("link", { name: "Comments on Beach day. 1 comment." });

    expect(fireEvent.click(link)).toBe(false);
    expect(scrolled).toContain(document.getElementById("comments"));
    expect(document.activeElement?.id).toBe("comments-heading");
    expect(window.location.hash).toBe("");
  });

  it("falls back to the link when the thread is not on the page", () => {
    render(<CommentAction commentCount={0} inPage momentId="moment-1" momentTitle="Beach day" />);

    expect(fireEvent.click(screen.getByRole("link"))).toBe(true);
  });
});
