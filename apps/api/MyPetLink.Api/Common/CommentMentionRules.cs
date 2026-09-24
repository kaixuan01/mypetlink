namespace MyPetLink.Api.Common;

/// <summary>
/// Finds the "@handle" candidates in a Comment body.
///
/// There is one handle grammar and it lives in <see cref="OwnerHandleRules"/>;
/// this only decides where a candidate starts and ends in running text, then
/// asks that grammar whether what it found could be a handle at all. Whether a
/// candidate names a real household that may be mentioned is a database
/// question, answered when the Comment is saved.
///
/// <list type="bullet">
/// <item>An "@" starts a candidate only at the start of the text or after a
/// character that cannot sit inside an address, so "kai@teoh.family",
/// "x.com/@teoh" and "@@teoh" are not mentions.</item>
/// <item>The candidate is the longest run of handle characters (ASCII
/// letters, digits, "_" and ".") that follows. Trailing "." and "_" are
/// sentence punctuation, not handle, so "Thanks @teoh." mentions "teoh".</item>
/// <item>A run that runs straight into another "@" or into a letter the
/// grammar does not allow ("@teoh@x", "@teohé") is refused whole rather than
/// cut short, and so is a run the grammar rejects ("@ab", "@teoh..family",
/// a reserved name): nothing is ever quietly shortened into a different
/// handle.</item>
/// </list>
///
/// Offsets are UTF-16 code units into the body as stored, the same units a
/// browser's string indexes use, and include the "@".
/// </summary>
public static class CommentMentionRules
{
    /// <summary>Distinct households one Comment can mention.</summary>
    public const int MaxMentionsPerComment = 5;

    public readonly record struct Candidate(int Start, int Length, string NormalizedHandle);

    public static IReadOnlyList<Candidate> Parse(string? body)
    {
        var candidates = new List<Candidate>();
        if (string.IsNullOrEmpty(body))
        {
            return candidates;
        }

        var index = 0;
        while (index < body.Length)
        {
            if (body[index] != '@' || (index > 0 && CannotPrecedeMention(body[index - 1])))
            {
                index += 1;
                continue;
            }

            var runEnd = index + 1;
            while (runEnd < body.Length && IsHandleCharacter(body[runEnd]))
            {
                runEnd += 1;
            }

            var tokenEnd = runEnd;
            while (tokenEnd > index + 1 && body[tokenEnd - 1] is '.' or '_')
            {
                tokenEnd -= 1;
            }

            var runsOn = runEnd < body.Length
                && (body[runEnd] == '@' || char.IsLetterOrDigit(body[runEnd]));
            var normalized = body[(index + 1)..tokenEnd].ToLowerInvariant();

            if (!runsOn
                && OwnerHandleRules.ValidateShape(normalized) is null
                && !OwnerHandleRules.IsSystemReserved(normalized))
            {
                candidates.Add(new Candidate(index, tokenEnd - index, normalized));
            }

            index = Math.Max(runEnd, index + 1);
        }

        return candidates;
    }

    private static bool IsHandleCharacter(char character) =>
        char.IsAsciiLetterOrDigit(character) || character is '_' or '.';

    /// <summary>
    /// Characters that make an "@" part of something else — an email address,
    /// a URL path, a doubled "@" — rather than the start of a mention.
    /// </summary>
    private static bool CannotPrecedeMention(char character) =>
        char.IsLetterOrDigit(character)
        || character is '_' or '.' or '@' or '/' or '\\' or '-' or '+' or '=' or ':' or '%' or '&' or '#' or '~';
}
