namespace MyPetLink.Api.Common;

/// <summary>
/// What a Community search box is asking for, once the typing is taken away.
///
/// Handles are shown everywhere as <c>@handle</c>, so people type them that
/// way. The stored handle never holds the "@" (<see cref="OwnerHandleRules"/>),
/// which means a search for "@tanfamily" used to match nothing at all.
///
/// Exactly one leading "@" is removed, with any space typed after it. That is
/// the whole of the change: the
/// search box does not become a handle validator, it does not strip anything
/// else, and "@@x" stays a search that matches nothing rather than being
/// quietly rewritten. The web search box applies the same rule
/// (<c>normalizeSocialSearchQuery</c>) so its "type at least two letters" hint
/// agrees with what is actually searched.
/// </summary>
public static class SocialSearchQuery
{
    public static string Normalize(string? query)
    {
        var term = (query ?? "").Trim();

        if (term.StartsWith('@'))
        {
            term = term[1..].TrimStart();
        }

        return term;
    }
}
