const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

function parseMalaysiaDateTime(value: string) {
  const trimmed = value.trim();

  // datetime-local values intentionally have no offset. Treat them as the
  // Malaysia wall time the owner entered instead of the runtime's timezone.
  const malaysiaLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(
    trimmed
  )
    ? `${trimmed}+08:00`
    : trimmed;

  const parsed = new Date(malaysiaLocal);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatFinderDateTime(value?: string | null) {
  if (!value?.trim()) {
    return "";
  }

  const parsed = parseMalaysiaDateTime(value);
  if (!parsed) {
    return "";
  }

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(parsed)
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}
