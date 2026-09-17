import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatMomentPublishedAge,
  formatMomentPublishedExact,
  formatMomentPublishedLabel,
  formatRelativeAge,
  momentPublishedDateTime,
} from "@/lib/momentPublishedTime";

/**
 * How old a Moment is, and when exactly it went out.
 *
 * The clock is injected at every call, so nothing here depends on when the suite
 * happens to run. A formatter that read `Date.now()` itself would make these
 * tests flaky by construction and make a card silently re-time itself on every
 * re-render.
 *
 * Times are built from local-time components rather than ISO strings with a
 * fixed offset: "Yesterday" is a calendar question, and a test that hard-codes
 * UTC answers it differently depending on where it runs.
 */

const at = (
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0
) => new Date(year, month - 1, day, hour, minute).getTime();

const iso = (value: number) => new Date(value).toISOString();

const now = at(2026, 9, 16, 14, 35);

describe("how long ago a Moment was published", () => {
  it("says Just now inside the first minute", () => {
    expect(formatMomentPublishedAge(iso(now - 5_000), now)).toBe("Just now");
    expect(formatMomentPublishedAge(iso(now - 59_000), now)).toBe("Just now");
  });

  it("counts minutes up to the hour", () => {
    expect(formatMomentPublishedAge(iso(now - 60_000), now)).toBe("1m");
    expect(formatMomentPublishedAge(iso(now - 12 * 60_000), now)).toBe("12m");
    expect(formatMomentPublishedAge(iso(now - 59 * 60_000), now)).toBe("59m");
  });

  it("counts hours up to the day", () => {
    expect(formatMomentPublishedAge(iso(now - 3_600_000), now)).toBe("1h");
    expect(formatMomentPublishedAge(iso(now - 3 * 3_600_000), now)).toBe("3h");
    expect(formatMomentPublishedAge(iso(now - 23 * 3_600_000), now)).toBe("23h");
  });

  it("says Yesterday once the hours stop being useful", () => {
    // Past 24 hours it is the calendar that answers, not the stopwatch: both of
    // these are the day before, and neither is worth counting in hours.
    expect(formatMomentPublishedAge(iso(at(2026, 9, 15, 13, 0)), now)).toBe(
      "Yesterday"
    );
    expect(formatMomentPublishedAge(iso(at(2026, 9, 15, 0, 5)), now)).toBe(
      "Yesterday"
    );
  });

  it("still counts the hours inside the first day, across midnight", () => {
    // 11pm read at 1am is two hours old. Calling that "Yesterday" would make a
    // Moment sound older than it is, just because a date boundary went past.
    expect(
      formatMomentPublishedAge(
        iso(at(2026, 9, 15, 23, 0)),
        at(2026, 9, 16, 1, 0)
      )
    ).toBe("2h");
  });

  it("counts days up to a week", () => {
    expect(formatMomentPublishedAge(iso(at(2026, 9, 12)), now)).toBe("4d");
    expect(formatMomentPublishedAge(iso(at(2026, 9, 10)), now)).toBe("6d");
  });

  it("gives a date once it is a week old, in the product's order", () => {
    // Day, month, year — not the viewer's locale's guess. This used to read
    // "the rendering is the viewer's locale's business", which let an en-US
    // browser print "Aug 10, 2026" on every older card: the one spelling the
    // product never uses, and the defect this assertion now catches.
    expect(formatMomentPublishedAge(iso(at(2026, 8, 10)), now)).toBe(
      "10 Aug 2026"
    );
  });

  it("never reports a future Moment as negative", () => {
    expect(formatMomentPublishedAge(iso(now + 60_000), now)).toBe("Just now");
  });
});

describe("a Moment with no publish date", () => {
  it("says nothing at all", () => {
    // A socially visible Moment always has one — the visibility predicate
    // requires it — so a missing date means something is wrong, not something
    // is old. It is never quietly replaced with the creation date.
    for (const empty of [null, undefined, "", "   ", "not-a-date"]) {
      expect(formatMomentPublishedAge(empty, now)).toBe("");
      expect(formatMomentPublishedExact(empty)).toBe("");
      expect(formatMomentPublishedLabel(empty)).toBe("");
      expect(momentPublishedDateTime(empty)).toBe("");
    }
  });
});

describe("the exact time, for the Moment's own page", () => {
  it("names the day and the time of day", () => {
    // The format the Moment's own page is specified to show, exactly.
    expect(formatMomentPublishedExact(iso(at(2026, 8, 10, 20, 42)))).toBe(
      "10 Aug 2026 · 8:42 PM"
    );
  });

  it("writes the date the same way as the rest of the product", () => {
    // Every other formatter in the app names its locale; these three were the
    // only ones that let the browser choose, which is how the order drifted.
    const source = readFileSync(
      join(__dirname, "momentPublishedTime.ts"),
      "utf8"
    );

    expect(source).not.toContain("DateTimeFormat(undefined");
    expect(source).toContain('const dateLocale = "en-MY"');
    // And still no pinned timezone: the clock stays the reader's.
    expect(source).not.toContain("timeZone");
  });

  it("uppercases the meridiem, as the rest of the product does", () => {
    expect(formatMomentPublishedExact(iso(at(2026, 8, 10, 9, 5)))).toMatch(
      /9:05\s?AM/
    );
  });
});

describe("the spoken label", () => {
  it("spells out what a relative age means", () => {
    const label = formatMomentPublishedLabel(iso(at(2026, 9, 16, 14, 35)));

    expect(label).toMatch(/^Published /);
    expect(label).toContain("September");
    expect(label).toContain("2026");
    expect(label).toMatch(/2:35\s?PM/);
    expect(label).toContain(" at ");
  });
});

describe("the machine-readable value", () => {
  it("passes the instant through untouched", () => {
    // Reformatting it would only risk losing the offset a machine reads it for.
    expect(momentPublishedDateTime("2026-09-16T06:35:00Z")).toBe(
      "2026-09-16T06:35:00Z"
    );
    expect(momentPublishedDateTime("  2026-09-16T06:35:00+08:00  ")).toBe(
      "2026-09-16T06:35:00+08:00"
    );
  });
});

describe("activity ages", () => {
  it("share one way of saying how long ago", () => {
    // A notification is timed by when it happened, so it reads a different
    // field — but "3h" should look the same wherever it appears.
    expect(formatRelativeAge(iso(now - 3 * 3_600_000), now)).toBe("3h");
    expect(formatRelativeAge(iso(now - 30_000), now)).toBe("Just now");
  });
});
