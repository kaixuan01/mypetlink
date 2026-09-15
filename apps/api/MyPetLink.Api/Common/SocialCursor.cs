using System.Buffers.Text;
using System.Globalization;
using System.Text;

namespace MyPetLink.Api.Common;

/// <summary>
/// One page boundary in a social listing, as an opaque token.
///
/// Every social list is ordered <c>PublishedAt DESC, Id DESC</c> and paged by
/// this cursor rather than by an offset. Offset paging is wrong for a live list:
/// a Moment published while someone is scrolling shifts every later row, so they
/// see a duplicate, and an unpublished one makes them skip an item they never
/// saw. A cursor names a position in the ordering instead of a count from the
/// start, so neither happens.
///
/// The token is opaque to clients on purpose — it is a position, not an API —
/// but it is deliberately NOT a secret: it encodes only a timestamp and an id
/// the caller has already been shown. It is base64url so it survives a query
/// string without escaping.
/// </summary>
public sealed record SocialCursor(DateTimeOffset PublishedAt, Guid Id)
{
    /// <summary>A page size that fills a phone screen without over-fetching.</summary>
    public const int DefaultPageSize = 12;

    /// <summary>
    /// The feed's default. Larger than a grid page because feed cards are read
    /// one after another rather than scanned, so a page is consumed faster.
    /// Still bounded by <see cref="MaxPageSize"/> like every other listing.
    /// </summary>
    public const int FeedPageSize = 15;

    /// <summary>
    /// Upper bound on what a caller may request. Without it, `limit=100000`
    /// turns a paginated endpoint back into an unbounded one.
    /// </summary>
    public const int MaxPageSize = 30;

    public static int ClampPageSize(int? requested, int? fallback = null)
    {
        if (!requested.HasValue || requested.Value <= 0)
        {
            return fallback ?? DefaultPageSize;
        }

        return Math.Min(requested.Value, MaxPageSize);
    }

    public string Encode()
    {
        var raw = $"{PublishedAt.UtcTicks.ToString(CultureInfo.InvariantCulture)}:{Id:N}";
        return Base64Url(Encoding.UTF8.GetBytes(raw));
    }

    /// <summary>
    /// Reads a cursor, or returns <c>null</c> for anything malformed.
    ///
    /// A bad cursor is treated as "start from the beginning" rather than as an
    /// error: cursors end up in shared URLs and browser history, and a stale one
    /// should show the first page instead of an error screen.
    /// </summary>
    public static SocialCursor? TryDecode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            var normalized = value.Trim().Replace('-', '+').Replace('_', '/');
            var padding = normalized.Length % 4;
            if (padding is 2 or 3)
            {
                normalized = normalized.PadRight(normalized.Length + (4 - padding), '=');
            }
            else if (padding == 1)
            {
                return null;
            }

            var raw = Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
            var separator = raw.IndexOf(':');

            if (separator <= 0)
            {
                return null;
            }

            if (!long.TryParse(
                    raw[..separator],
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out var ticks)
                || !Guid.TryParseExact(raw[(separator + 1)..], "N", out var id))
            {
                return null;
            }

            if (ticks < DateTimeOffset.MinValue.UtcTicks || ticks > DateTimeOffset.MaxValue.UtcTicks)
            {
                return null;
            }

            return new SocialCursor(new DateTimeOffset(ticks, TimeSpan.Zero), id);
        }
        catch (Exception exception) when (
            exception is FormatException or ArgumentException or DecoderFallbackException)
        {
            return null;
        }
    }

    private static string Base64Url(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
