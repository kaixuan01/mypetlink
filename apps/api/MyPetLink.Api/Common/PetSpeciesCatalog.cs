using System.Text;
using System.Text.RegularExpressions;

namespace MyPetLink.Api.Common;

/// <summary>
/// The pet types the apps offer, and the normalisation rules for the free-text
/// fields that sit beside them.
///
/// This list mirrors PET_TYPE_GROUPS in apps/web/src/lib/petDisplay.ts. Keep
/// the two in step; the web list decides what an owner can pick, and this one
/// decides what the API will accept for a newly chosen species.
///
/// It is deliberately NOT applied to every write. The API accepted arbitrary
/// species strings for most of its life, so production may hold values that
/// are not here. Rejecting those would lock an owner out of editing their own
/// pet over a field they never touched, so the rule is: validate a species the
/// caller is actually changing, and leave a stored value alone otherwise.
/// </summary>
public static class PetSpeciesCatalog
{
    /// <summary>The escape hatch. Requires a CustomSpecies value alongside it.</summary>
    public const string Other = "Other";

    public const int BreedMaxLength = 160;
    public const int CustomSpeciesMaxLength = 60;

    private static readonly HashSet<string> Supported = new(StringComparer.Ordinal)
    {
        "Dog",
        "Cat",
        "Rabbit",
        "Guinea Pig",
        "Hamster",
        "Rat",
        "Mouse",
        "Gerbil",
        "Chinchilla",
        "Ferret",
        "Hedgehog",
        "Sugar Glider",
        "Bird",
        "Fish",
        "Turtle",
        "Tortoise",
        "Snake",
        "Lizard",
        "Reptile",
        "Horse",
        Other,
    };

    /// <summary>Control characters, which never belong in a displayed name.</summary>
    private static readonly Regex ControlCharacters =
        new(@"\p{Cc}|\p{Cf}", RegexOptions.Compiled);

    private static readonly Regex WhitespaceRuns =
        new(@"\s+", RegexOptions.Compiled);

    public static IReadOnlyCollection<string> SupportedSpecies => Supported;

    public static bool IsSupported(string? species) =>
        species is not null && Supported.Contains(species.Trim());

    public static bool IsOther(string? species) =>
        string.Equals(species?.Trim(), Other, StringComparison.Ordinal);

    /// <summary>
    /// Trims, collapses whitespace runs, and drops control and formatting
    /// characters. Everything else survives, so accented and non-Latin names
    /// are preserved exactly. Returns null for a value that normalises empty.
    /// </summary>
    public static string? NormalizeFreeText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var stripped = ControlCharacters.Replace(value.Normalize(NormalizationForm.FormC), " ");
        var collapsed = WhitespaceRuns.Replace(stripped, " ").Trim();

        return collapsed.Length == 0 ? null : collapsed;
    }
}
