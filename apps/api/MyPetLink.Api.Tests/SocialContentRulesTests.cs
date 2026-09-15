using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The shared text rules: what a general area may contain, and what a handle,
/// display name and bio may contain.
///
/// The general-area rules matter most. That field is published to finders and to
/// visitors, and before this work it was 200 characters of unconstrained free
/// text — comfortably enough for a full postal address, on a field labelled as a
/// rough area.
/// </summary>
public sealed class SocialContentRulesTests
{
    /// <summary>
    /// Numbers are ordinary in Malaysian place names. Rejecting an area because
    /// it contains a digit would reject a large share of the country, so none of
    /// these may be refused.
    /// </summary>
    [Theory]
    [InlineData("Bangsar, Kuala Lumpur")]
    [InlineData("Petaling Jaya")]
    [InlineData("SS2")]
    [InlineData("SS15")]
    [InlineData("SS15, Subang Jaya")]
    [InlineData("USJ 9")]
    [InlineData("USJ 9, Subang Jaya")]
    [InlineData("Section 17")]
    [InlineData("Section 17, Petaling Jaya")]
    [InlineData("Bandar Kinrara 5")]
    [InlineData("Taman Melawati")]
    [InlineData("Taman Melawati 2")]
    [InlineData("Desa ParkCity")]
    [InlineData("Bangsar South")]
    [InlineData("Taman Tun Dr Ismail, Kuala Lumpur")]
    [InlineData("Mont Kiara")]
    [InlineData("Puchong Jaya")]
    [InlineData("Setia Alam, Shah Alam")]
    [InlineData("Kota Damansara, PJ")]
    [InlineData("59100 Kuala Lumpur")]
    [InlineData("Jalan Bangsar area")]
    [InlineData("Off Jalan Ipoh")]
    [InlineData("Cheras, Selangor")]
    [InlineData("Ampang Jaya")]
    public void GeneralArea_AcceptsARealMalaysianNeighbourhood(string value)
    {
        var normalized = GeneralAreaRules.Normalize(value);

        Assert.False(
            GeneralAreaRules.LooksLikePreciseAddress(normalized!),
            $"'{value}' is an ordinary Malaysian area and must not be treated as an address.");
        Assert.Null(GeneralAreaRules.Validate(normalized));
    }

    /// <summary>
    /// The shapes that only appear in a precise residential address.
    /// </summary>
    [Theory]
    [InlineData("No. 18, Jalan Example 2/3")]
    [InlineData("No 18, Jalan Example")]
    [InlineData("no.12 Jalan Maarof")]
    [InlineData("Unit A-12-3, Residensi Example")]
    [InlineData("12 Jalan ABC")]
    [InlineData("Block B, Unit 10-2")]
    [InlineData("Lot 5, Jalan Ampang")]
    [InlineData("Blok C, Tingkat 3")]
    [InlineData("Apartment 14, Mont Kiara")]
    [InlineData("A-12-3")]
    [InlineData("Jalan SS15/4A")]
    public void GeneralArea_RefusesAPreciseResidentialAddress(string value)
    {
        var normalized = GeneralAreaRules.Normalize(value);
        var error = GeneralAreaRules.Validate(normalized);

        Assert.True(
            GeneralAreaRules.LooksLikePreciseAddress(normalized!),
            $"'{value}' is a precise address and must be refused.");
        Assert.NotNull(error);
        Assert.Contains("general area", error!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GeneralArea_RefusesAValueLongerThanTheLimit()
    {
        var normalized = GeneralAreaRules.Normalize(new string('a', GeneralAreaRules.MaxLength + 1));
        Assert.NotNull(GeneralAreaRules.Validate(normalized));
    }

    [Fact]
    public void GeneralArea_CollapsesLineBreaksAndControlCharactersToOneLine()
    {
        // The shape a pasted postal address arrives in.
        var normalized = GeneralAreaRules.Normalize("Bangsar,\r\n\tKuala\u0000 Lumpur  ");

        Assert.Equal("Bangsar, Kuala Lumpur", normalized);
        Assert.DoesNotContain('\n', normalized!);
        Assert.DoesNotContain('\r', normalized!);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\r\n")]
    public void GeneralArea_TreatsAnEmptyValueAsNotSet(string? value)
    {
        Assert.Null(GeneralAreaRules.Normalize(value));
        Assert.Null(GeneralAreaRules.Validate(GeneralAreaRules.Normalize(value)));
    }

    [Theory]
    [InlineData("mochiandcoco")]
    [InlineData("the_tan_family")]
    [InlineData("mochi")]
    [InlineData("mochi.coco")]
    [InlineData("mochi_coco")]
    [InlineData("tanpets88")]
    [InlineData("bailey2026")]
    public void Handle_AcceptsAWellFormedName(string handle)
    {
        Assert.Null(OwnerHandleRules.ValidateShape(OwnerHandleRules.Normalize(handle)));
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("2mochi")]
    [InlineData("mochi coco")]
    [InlineData("mochi--coco")]
    [InlineData("mochi..coco")]
    [InlineData("mochi.")]
    [InlineData("mochi-coco")]
    // Punctuation at either end, or doubled anywhere, produces handles that read
    // ambiguously in a URL and in running text.
    [InlineData(".mochi")]
    [InlineData("_mochi")]
    [InlineData("__mochi")]
    [InlineData("mochi_")]
    [InlineData("mochi..")]
    [InlineData("mochi._coco")]
    [InlineData("...")]
    [InlineData("___")]
    [InlineData("MochiEmoji\U0001F408")]
    public void Handle_RefusesAMalformedName(string handle)
    {
        Assert.NotNull(OwnerHandleRules.ValidateShape(OwnerHandleRules.Normalize(handle)));
    }

    [Theory]
    [InlineData("MochiAndCoco", "mochiandcoco")]
    [InlineData("@MochiAndCoco", "mochiandcoco")]
    [InlineData("  MOCHI  ", "mochi")]
    public void Handle_NormalizesToLowercaseForUniqueness(string input, string expected)
    {
        Assert.Equal(expected, OwnerHandleRules.Normalize(input));
    }

    [Fact]
    public void Handle_StaysUrlSafe()
    {
        // The allowed set is a-z, 0-9, underscore and dot. Every one of those is
        // an unreserved URL character, so a handle never needs escaping in
        // /u/{handle} and can never change meaning when a client encodes it.
        const string allowed = "abcdefghijklmnopqrstuvwxyz0123456789._";

        var handle = OwnerHandleRules.Normalize("mochi.and_coco99")!;
        Assert.Null(OwnerHandleRules.ValidateShape(handle));
        Assert.All(handle, character => Assert.Contains(character, allowed));
        Assert.Equal(handle, Uri.EscapeDataString(handle));
    }

    [Fact]
    public void Handle_RefusesAnythingLongerThanTheLimit()
    {
        var tooLong = "a" + new string('b', OwnerHandleRules.MaxLength);
        Assert.NotNull(OwnerHandleRules.ValidateShape(OwnerHandleRules.Normalize(tooLong)));
    }

    [Fact]
    public void Handle_NormalizationIsCaseFoldingAndStripsALeadingAt()
    {
        Assert.Equal("mochiandcoco", OwnerHandleRules.Normalize("@MochiAndCoco"));
        Assert.Equal("MochiAndCoco", OwnerHandleRules.NormalizeForDisplay("@MochiAndCoco"));
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("support")]
    [InlineData("mypetlink")]
    [InlineData("help")]
    [InlineData("settings")]
    [InlineData("login")]
    [InlineData("dashboard")]
    [InlineData("linko")]
    [InlineData("noreply")]
    public void Handle_ReservesRoutesAndIdentitiesThatCouldImpersonateUs(string handle)
    {
        Assert.True(OwnerHandleRules.IsSystemReserved(handle));
    }

    [Fact]
    public void Handle_ReservesEverySingleLetterPublicRoute()
    {
        // /p /q /n /t are live public routes and /u is the owner profile
        // namespace. A handle equal to one of them would sit at a URL people
        // read as ours.
        foreach (var route in new[] { "p", "q", "n", "t", "u" })
        {
            Assert.True(OwnerHandleRules.IsSystemReserved(route), route);
        }
    }

    [Fact]
    public void Handle_ScreensBlockedTermsEvenWhenSeparatorsAreUsed()
    {
        Assert.True(OwnerHandleRules.ContainsBlockedTerm("f_u_c_k_it"));
        Assert.False(OwnerHandleRules.ContainsBlockedTerm("mochiandcoco"));
    }

    [Theory]
    [InlineData("Mochi & Coco's Family")]
    [InlineData("The Tan Family")]
    [InlineData("Bailey's humans")]
    public void DisplayName_AcceptsANormalHouseholdName(string value)
    {
        var normalized = OwnerSocialDisplayNameRules.Normalize(value);
        Assert.Null(OwnerSocialDisplayNameRules.Validate(normalized));
    }

    [Fact]
    public void DisplayName_RefusesAnEmptyOrOverlongValue()
    {
        Assert.NotNull(OwnerSocialDisplayNameRules.Validate(
            OwnerSocialDisplayNameRules.Normalize("  ")));
        Assert.NotNull(OwnerSocialDisplayNameRules.Validate(
            new string('a', OwnerSocialDisplayNameRules.MaxLength + 1)));
    }

    [Fact]
    public void DisplayName_IsSingleLine()
    {
        var normalized = OwnerSocialDisplayNameRules.Normalize("The Tan\r\nFamily");
        Assert.Equal("The Tan Family", normalized);
    }

    [Fact]
    public void Bio_KeepsParagraphBreaksButNotRunsOfBlankLines()
    {
        var normalized = OwnerSocialBioRules.Normalize("Two cats.\n\n\n\n\nOne sofa.");
        Assert.Equal("Two cats.\n\nOne sofa.", normalized);
    }

    [Fact]
    public void Bio_RefusesAnythingLongerThanTheLimit()
    {
        var tooLong = new string('a', OwnerSocialBioRules.MaxLength + 1);
        Assert.NotNull(OwnerSocialBioRules.Validate(OwnerSocialBioRules.Normalize(tooLong)));
    }

    [Fact]
    public void Bio_MayBeEmpty()
    {
        Assert.Null(OwnerSocialBioRules.Normalize("   "));
        Assert.Null(OwnerSocialBioRules.Validate(null));
    }
}
