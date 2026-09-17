/**
 * When a Moment was published, said three ways.
 *
 * One formatter, because a timestamp written twice is a timestamp that disagrees
 * with itself: the feed and Explore each had their own idea of how old "3h" was,
 * and Explore showed no time at all.
 *
 * **Always `publishedAt`, never `createdAt`.** They are different facts. A
 * Moment written in private and shared months later was published when it was
 * shared, and a Moment taken back into private keeps the date it first went out.
 * Showing the creation date would quietly rewrite both.
 *
 * **The viewer's timezone, the product's date order.** Those are two different
 * decisions and they were being made by one word. `undefined` as a locale hands
 * both to the browser, so a reader in a US locale saw "Aug 10, 2026" — the one
 * spelling the product never uses. Every other formatter in this app names its
 * locale (`en-MY` or `en-GB`); these three were the only ones that did not.
 *
 * So the locale is named and the timezone is not. `formatFinderDateTime` pins
 * Malaysia deliberately, because a finder's timestamp describes something that
 * happened in Malaysia; a Moment is read wherever the reader is, so it keeps
 * their clock while using the product's way of writing a date.
 *
 * **`now` is passed in, never read here.** A formatter that reads the clock is
 * impure: it makes a card re-time itself on every re-render and a test flaky by
 * construction. Callers capture the moment their list loaded and pass it down.
 */

/**
 * The product's date order: day, month, year. Named rather than inferred, so a
 * Moment reads the same way for everybody. No timezone is pinned — the clock
 * stays the reader's.
 */
const dateLocale = "en-MY";

/**
 * Relative age, in the shortest form that is still honest.
 *
 * Kept separate from the Moment-specific wrapper below because activity has
 * ages too — a notification is timed by when it happened — and one way of
 * saying "3h" across the product is the point. What must not be shared is which
 * field to read: that is a question about the thing, not about the clock.
 */
export function formatRelativeAge(
  instant: string | null | undefined,
  now: number
): string {
  const published = parsePublished(instant);

  if (published === null) {
    return "";
  }

  const seconds = Math.max(0, Math.round((now - published) / 1000));

  // Elapsed time answers the first day, the calendar answers the rest.
  //
  // The two overlap — something posted at 11pm is both "2h" and "yesterday" at
  // 1am — so one of them has to win, and it is the hours. A reader checking
  // back on a Moment they saw last night is asking how long it has been, not
  // which date it carries, and "Yesterday" for something two hours old reads as
  // older than it is. Past 24 hours the hour count stops being meaningful and
  // the calendar takes over, so "Yesterday" covers the day-old band.
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;

  // Calendar days from here, not 24-hour blocks, so the word and the date agree.
  const days = calendarDaysBetween(published, now);

  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days}d`;

  return shortDate(published);
}

/** A Moment's age, read from `publishedAt` and nothing else. */
export function formatMomentPublishedAge(
  publishedAt: string | null | undefined,
  now: number
): string {
  return formatRelativeAge(publishedAt, now);
}

/** "10 Aug 2026 · 8:42 PM" — the Moment's own page, where there is room. */
export function formatMomentPublishedExact(
  publishedAt: string | null | undefined
): string {
  const published = parsePublished(publishedAt);

  if (published === null) {
    return "";
  }

  const time = new Intl.DateTimeFormat(dateLocale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(published)
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());

  return `${shortDate(published)} · ${time}`;
}

/**
 * "Published 16 September 2026 at 2:35 PM".
 *
 * What a relative age means, spelled out, for anyone who cannot make use of
 * "3h" — and for anyone who simply wants to know.
 */
export function formatMomentPublishedLabel(
  publishedAt: string | null | undefined
): string {
  const published = parsePublished(publishedAt);

  if (published === null) {
    return "";
  }

  const full = new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(published)
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());

  return `Published ${full.replace(/,\s*(?=\d{1,2}:\d{2})/, " at ")}`;
}

/**
 * The value for a `<time dateTime>` attribute, or "" when there is none.
 *
 * Passed through unchanged: it is already an ISO instant, and reformatting it
 * would only risk losing the offset a machine reads it for.
 */
export function momentPublishedDateTime(
  publishedAt: string | null | undefined
): string {
  return parsePublished(publishedAt) === null ? "" : publishedAt!.trim();
}

/**
 * A socially visible Moment always has a publish date — the visibility
 * predicate requires `PublishedAt != null` before a Moment reaches any public
 * surface — so a missing one means something is wrong rather than something is
 * old. It renders as nothing, and deliberately does not fall back to the
 * creation date, which would put a date on screen that is not the one the API
 * is describing.
 */
function parsePublished(publishedAt: string | null | undefined): number | null {
  const trimmed = publishedAt?.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function shortDate(instant: number): string {
  return new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(instant);
}

function calendarDaysBetween(published: number, now: number): number {
  const startOfDay = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  return Math.max(
    0,
    Math.round((startOfDay(now) - startOfDay(published)) / 86_400_000)
  );
}
