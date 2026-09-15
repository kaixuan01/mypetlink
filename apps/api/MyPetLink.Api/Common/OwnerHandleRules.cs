using System.Text;

namespace MyPetLink.Api.Common;

/// <summary>
/// Everything that decides whether a social handle is well formed and allowed.
///
/// A handle is an address, never an authorization: holding <c>@support</c> would
/// let someone look official, which is why the reserved list below exists and
/// why it covers application routes as well as brand terms.
///
/// Normalization is lower-casing only. Nothing clever — no accent folding, no
/// homoglyph mapping — because the allowed character set is already restricted
/// to ASCII letters, digits, underscore and a single dot, so there is nothing
/// left to fold.
/// </summary>
public static class OwnerHandleRules
{
    public const int MinLength = 3;
    public const int MaxLength = 30;

    /// <summary>
    /// Route segments an owner must never be able to occupy. A handle equal to
    /// one of these could sit at a URL people read as ours.
    /// </summary>
    private static readonly string[] RouteReservations =
    [
        "p", "q", "n", "t", "u", "admin", "api", "activate", "dashboard", "pets",
        "pet", "pet-profile", "moments", "records", "tags", "orders", "order",
        "settings", "login", "logout", "signup", "register", "auth", "sample",
        "pricing", "privacy", "terms", "how-it-works", "smart-pet-tags",
        "where-to-buy", "static", "assets", "media", "public", "well-known",
        "sitemap", "robots", "favicon", "images", "img", "css", "js", "fonts"
    ];

    /// <summary>
    /// Identities that would let an account pass itself off as MyPetLink or as
    /// someone acting on our behalf.
    /// </summary>
    private static readonly string[] BrandReservations =
    [
        "mypetlink", "my-pet-link", "mypetlinkofficial", "mypetlink_official",
        "official", "support", "help", "helpdesk", "customercare", "customer_care",
        "admin", "administrator", "moderator", "mod", "staff", "team", "system",
        "root", "security", "billing", "payments", "payment", "finance", "sales",
        "info", "contact", "noreply", "no-reply", "postmaster", "webmaster",
        "linko", "mypetlinkhelp", "mypetlinksupport", "safety", "lostpet",
        "lost-pet", "smarttag", "smart-tag"
    ];

    /// <summary>
    /// Deliberately small. This is a shape check for obviously unacceptable
    /// names, not a content-moderation system — reporting and admin review in a
    /// later phase are what actually handle abuse. Substring matching is used on
    /// purpose here, so separators cannot be used to slip a term through.
    /// </summary>
    private static readonly string[] BlockedSubstrings =
    [
        "fuck", "shit", "cunt", "nigger", "nigga", "faggot", "rape", "rapist",
        "paedo", "pedo", "childporn", "chldporn"
    ];

    public static IReadOnlyCollection<string> SystemReservations { get; } =
        RouteReservations
            .Concat(BrandReservations)
            .Select(value => value.ToLowerInvariant())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToArray();

    /// <summary>
    /// Lower-cases and trims. Returns <c>null</c> when there is nothing left,
    /// so an all-whitespace handle is "not set" rather than blank.
    /// </summary>
    public static string? Normalize(string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle))
        {
            return null;
        }

        var trimmed = handle.Trim().TrimStart('@');
        return trimmed.Length == 0 ? null : trimmed.ToLowerInvariant();
    }

    /// <summary>
    /// Keeps the owner's casing for display while stripping a leading "@" and
    /// surrounding whitespace.
    /// </summary>
    public static string? NormalizeForDisplay(string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle))
        {
            return null;
        }

        var trimmed = handle.Trim().TrimStart('@');
        return trimmed.Length == 0 ? null : trimmed;
    }

    /// <summary>
    /// Validation message for a normalized handle, or <c>null</c> when the shape
    /// is acceptable. Does not consider uniqueness or reservations — those need
    /// the database.
    /// </summary>
    public static string? ValidateShape(string? normalizedHandle)
    {
        if (string.IsNullOrEmpty(normalizedHandle))
        {
            return "Choose a handle.";
        }

        if (normalizedHandle.Length < MinLength || normalizedHandle.Length > MaxLength)
        {
            return $"Handles are {MinLength} to {MaxLength} characters.";
        }

        if (!char.IsAsciiLetterLower(normalizedHandle[0]))
        {
            return "Handles start with a letter.";
        }

        if (!char.IsAsciiLetterOrDigit(normalizedHandle[^1]))
        {
            return "Handles end with a letter or a number.";
        }

        var previousWasSeparator = false;

        foreach (var character in normalizedHandle)
        {
            var isSeparator = character is '_' or '.';

            if (!char.IsAsciiLetterLower(character) && !char.IsAsciiDigit(character) && !isSeparator)
            {
                return "Handles use letters, numbers, underscores and dots.";
            }

            if (isSeparator && previousWasSeparator)
            {
                return "Handles cannot have two separators in a row.";
            }

            previousWasSeparator = isSeparator;
        }

        if (ContainsBlockedTerm(normalizedHandle))
        {
            return "Choose a different handle.";
        }

        return null;
    }

    public static bool IsSystemReserved(string? normalizedHandle)
    {
        return !string.IsNullOrEmpty(normalizedHandle)
            && SystemReservations.Contains(normalizedHandle, StringComparer.Ordinal);
    }

    public static bool ContainsBlockedTerm(string? normalizedValue)
    {
        if (string.IsNullOrEmpty(normalizedValue))
        {
            return false;
        }

        // Compare with separators removed so "f_u_c_k" is caught alongside the
        // plain spelling.
        var condensed = new string(normalizedValue
            .Where(char.IsAsciiLetterOrDigit)
            .ToArray());

        return BlockedSubstrings.Any(term =>
            normalizedValue.Contains(term, StringComparison.Ordinal)
            || condensed.Contains(term, StringComparison.Ordinal));
    }
}

/// <summary>
/// Rules for the owner's public social display name. Looser than a handle — it
/// is free text people read, not an address — but still bounded, single-line and
/// screened for the same small set of unacceptable terms.
/// </summary>
public static class OwnerSocialDisplayNameRules
{
    public const int MinLength = 2;
    public const int MaxLength = 60;

    public static string? Normalize(string? value)
    {
        return GeneralAreaRules.Normalize(value);
    }

    public static string? NormalizeForSearch(string? normalizedValue)
    {
        return string.IsNullOrEmpty(normalizedValue) ? null : normalizedValue.ToLowerInvariant();
    }

    public static string? Validate(string? normalizedValue)
    {
        if (string.IsNullOrEmpty(normalizedValue))
        {
            return "Choose a display name.";
        }

        if (normalizedValue.Length < MinLength || normalizedValue.Length > MaxLength)
        {
            return $"Display names are {MinLength} to {MaxLength} characters.";
        }

        if (OwnerHandleRules.ContainsBlockedTerm(normalizedValue.ToLowerInvariant()))
        {
            return "Choose a different display name.";
        }

        return null;
    }
}

/// <summary>
/// Rules for the owner's public social bio.
/// </summary>
public static class OwnerSocialBioRules
{
    public const int MaxLength = 300;

    /// <summary>
    /// Unlike a display name, a bio may contain line breaks — but at most one
    /// blank line in a row, and no other control characters.
    /// </summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var builder = new StringBuilder(value.Length);
        var consecutiveNewlines = 0;

        foreach (var character in value.Replace("\r\n", "\n", StringComparison.Ordinal))
        {
            if (character == '\n')
            {
                consecutiveNewlines++;

                if (consecutiveNewlines <= 2 && builder.Length > 0)
                {
                    builder.Append('\n');
                }

                continue;
            }

            if (char.IsControl(character) && character != '\t')
            {
                continue;
            }

            consecutiveNewlines = 0;
            builder.Append(character == '\t' ? ' ' : character);
        }

        var result = builder.ToString().Trim();
        return result.Length == 0 ? null : result;
    }

    public static string? Validate(string? normalizedValue)
    {
        if (string.IsNullOrEmpty(normalizedValue))
        {
            return null;
        }

        if (normalizedValue.Length > MaxLength)
        {
            return $"Bios are up to {MaxLength} characters.";
        }

        if (OwnerHandleRules.ContainsBlockedTerm(normalizedValue.ToLowerInvariant()))
        {
            return "Remove the highlighted wording from your bio.";
        }

        return null;
    }
}
