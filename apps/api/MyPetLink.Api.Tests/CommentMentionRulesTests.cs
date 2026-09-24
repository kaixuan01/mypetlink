using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Where "@handle" candidates start and end in running text. Whether a
/// candidate names a household is decided later, against the database.
/// </summary>
public sealed class CommentMentionRulesTests
{
    private static string[] Handles(string body) =>
        CommentMentionRules.Parse(body).Select(candidate => candidate.NormalizedHandle).ToArray();

    [Theory]
    [InlineData("@rahmanpets Milo looks so happy 😂", "rahmanpets")]
    [InlineData("Beach day with @teoh.family", "teoh.family")]
    [InlineData("hi @abc_123!", "abc_123")]
    [InlineData("(@abc_123)", "abc_123")]
    [InlineData("Thanks @teoh.", "teoh")]
    [InlineData("Thanks @teoh...", "teoh")]
    [InlineData("cc @Teoh_", "teoh")]
    [InlineData("so cute,@milohome", "milohome")]
    [InlineData("🐶@milohome", "milohome")]
    [InlineData("line one\n@milohome", "milohome")]
    public void FindsAHandleInRunningText(string body, string handle)
    {
        Assert.Equal([handle], Handles(body));
    }

    [Theory]
    [InlineData("mail kai@teoh.family please")]
    [InlineData("see x.com/@teohfamily")]
    [InlineData("@@teohfamily")]
    [InlineData("@teohfamily@example.com")]
    [InlineData("@teohé")]
    [InlineData("@teoh..family")]
    [InlineData("@teoh._family")]
    [InlineData("@ab")]
    [InlineData("@1teoh")]
    [InlineData("@_teoh")]
    [InlineData("@")]
    [InlineData("@ hello")]
    [InlineData("a-@teohfamily")]
    [InlineData("#@teohfamily")]
    public void RefusesAnythingThatIsNotCleanlyAHandle(string body)
    {
        Assert.Empty(Handles(body));
    }

    [Fact]
    public void RefusesReservedNamesAndNamesTheGrammarBlocks()
    {
        Assert.Empty(Handles("@support @mypetlink @admin"));
        Assert.Empty(Handles("@" + new string('a', 31)));
        Assert.Equal([new string('a', 30)], Handles("@" + new string('a', 30)));
    }

    [Fact]
    public void ReportsSpansAsUtf16OffsetsIncludingTheAt()
    {
        const string body = "😂 hi @TeohFamily and @milohome.";
        var candidates = CommentMentionRules.Parse(body);

        Assert.Equal(2, candidates.Count);
        Assert.Equal("@TeohFamily", body.Substring(candidates[0].Start, candidates[0].Length));
        Assert.Equal("teohfamily", candidates[0].NormalizedHandle);
        Assert.Equal("@milohome", body.Substring(candidates[1].Start, candidates[1].Length));
        // The emoji is two UTF-16 units, as a browser counts it.
        Assert.Equal(6, candidates[0].Start);
    }

    [Fact]
    public void KeepsEveryCandidateInBodyOrderIncludingRepeats()
    {
        Assert.Equal(
            ["one1", "two2", "one1", "three"],
            Handles("@one1 @two2 @one1 @three"));
    }
}
