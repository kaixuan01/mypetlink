using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Authorship, publication time, and which pets a Moment is about.
///
/// The authorship rule is the one with teeth: <c>AuthorUserId</c> records who
/// wrote a Moment and must survive the pet moving to a different household.
/// Getting that wrong would silently reattribute somebody's writing to a
/// stranger the first time a pet is rehomed.
/// </summary>
public sealed class MomentAuthorshipAndSubjectsTests
{
    private static readonly Guid AliceId = Guid.Parse("c1111111-1111-1111-1111-111111111111");
    private static readonly Guid BobId = Guid.Parse("c2222222-2222-2222-2222-222222222222");
    private static readonly Guid MochiId = Guid.Parse("c3333333-3333-3333-3333-333333333333");
    private static readonly Guid CocoId = Guid.Parse("c4444444-4444-4444-4444-444444444444");
    private static readonly Guid LuckyId = Guid.Parse("c5555555-5555-5555-5555-555555555555");
    private static readonly Guid BobsPetId = Guid.Parse("c6666666-6666-6666-6666-666666666666");

    [Fact]
    public async Task Author_ComesFromTheAuthenticatedSession()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == response.Id);
        Assert.Equal(AliceId, saved.AuthorUserId);
    }

    [Fact]
    public void Author_CannotBeSuppliedByTheClient()
    {
        // There is no author field on the request at all: the only way to state
        // an author is to be one. This test asserts the shape, because adding
        // such a field later is exactly the regression that would matter.
        var writableAuthorFields = typeof(CreateMemoryRequest)
            .GetProperties()
            .Where(property => property.Name.Contains("Author", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("UserId", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("OwnerId", StringComparison.OrdinalIgnoreCase))
            .Select(property => property.Name)
            .ToArray();

        Assert.Empty(writableAuthorFields);

        var updateAuthorFields = typeof(UpdateMemoryRequest)
            .GetProperties()
            .Where(property => property.Name.Contains("Author", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("UserId", StringComparison.OrdinalIgnoreCase)
                || property.Name.Contains("OwnerId", StringComparison.OrdinalIgnoreCase))
            .Select(property => property.Name)
            .ToArray();

        Assert.Empty(updateAuthorFields);
    }

    [Fact]
    public async Task Author_SurvivesTheTransferOfThePetToAnotherOwner()
    {
        using var harness = await Harness.CreateAsync();
        var response = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        // Mochi is rehomed. The Moment was still written by Alice.
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == MochiId);
        pet.OwnerUserId = BobId;
        await harness.Db.SaveChangesAsync();

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == response.Id);
        Assert.Equal(AliceId, saved.AuthorUserId);
        Assert.NotEqual(pet.OwnerUserId, saved.AuthorUserId);
    }

    [Fact]
    public async Task Author_IsNotRewrittenByAnOrdinaryEdit()
    {
        using var harness = await Harness.CreateAsync();
        var response = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == MochiId);
        pet.OwnerUserId = BobId;
        await harness.Db.SaveChangesAsync();

        await harness.Memories.UpdateAsync(BobId, response.Id, UpdateRequest(caption: "Edited by the new owner"));

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == response.Id);
        Assert.Equal(AliceId, saved.AuthorUserId);
    }

    [Fact]
    public async Task PublishedAt_IsSetWhenAMomentIsCreatedPublic()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));

        Assert.NotNull(response.PublishedAt);
    }

    [Fact]
    public async Task PublishedAt_StaysEmptyWhileAMomentIsPrivate()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Private));

        Assert.Null(response.PublishedAt);
    }

    [Fact]
    public async Task PublishedAt_IsSetOnTheFirstTransitionToPublic()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Private));

        var published = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Public));

        Assert.NotNull(published.PublishedAt);
    }

    [Fact]
    public async Task PublishedAt_IsNotBumpedByAnOrdinaryEdit()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));

        var firstPublishedAt = created.PublishedAt;
        harness.Clock.Advance(TimeSpan.FromDays(30));

        var edited = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(caption: "Fixed a typo"));

        // Otherwise correcting a typo would push an old Moment back to the top
        // of every feed.
        Assert.Equal(firstPublishedAt, edited.PublishedAt);
    }

    [Fact]
    public async Task PublishedAt_KeepsTheOriginalTimeWhenAMomentIsUnpublishedAndPublishedAgain()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));
        var firstPublishedAt = created.PublishedAt;

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Private));

        harness.Clock.Advance(TimeSpan.FromDays(30));

        var republished = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Public));

        // Re-publishing is not a new Moment, and allowing it to reset the clock
        // would be a way to resurface old content on demand.
        Assert.Equal(firstPublishedAt, republished.PublishedAt);
    }

    [Fact]
    public async Task EveryMoment_RecordsItsPrimaryPetAsASubject()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        var subjects = await harness.Db.MomentPets
            .Where(item => item.MomentId == response.Id)
            .ToListAsync();

        // The primary pet is the membership row matching PetMemory.PetId. There
        // is no stored flag saying so — that was a second source of truth.
        var primary = Assert.Single(subjects);
        Assert.Equal(MochiId, primary.PetId);
    }

    [Fact]
    public async Task AMomentAboutThreePets_RecordsThreeSubjectsWithOnePrimary()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId, LuckyId]));

        var subjects = await harness.Db.MomentPets
            .Where(item => item.MomentId == response.Id)
            .ToListAsync();

        Assert.Equal(3, subjects.Count);
        Assert.Contains(subjects, item => item.PetId == MochiId);
        Assert.Equal(
            new[] { CocoId, LuckyId }.OrderBy(id => id),
            response.AdditionalPetIds.OrderBy(id => id));
    }

    [Fact]
    public async Task PublicMoments_AreNotCappedByThePrivateArchiveAllowance()
    {
        // The whole point of the policy: a free account must be able to
        // contribute to the social network. Two private Moments exhaust the
        // allowance here; public posting carries on regardless.
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 2);

        await harness.Memories.CreateAsync(AliceId, MochiId, Request());
        await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        for (var index = 0; index < 10; index++)
        {
            await harness.Memories.CreateAsync(
                AliceId,
                MochiId,
                Request(visibility: MemoryVisibility.Public));
        }

        Assert.Equal(12, await harness.Db.PetMemories.CountAsync(item => item.PetId == MochiId));
    }

    [Fact]
    public async Task PrivateMoments_AreStillCappedByTheAllowance()
    {
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 1);
        await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.CreateAsync(AliceId, MochiId, Request()));

        Assert.Equal("plan_limit_reached", error.Code);
        Assert.Contains("private", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PublicMoments_DoNotCountTowardThePrivateAllowance()
    {
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 1);

        await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));

        // The public Moment above must not have consumed the single private slot.
        var priv = await harness.Memories.CreateAsync(AliceId, MochiId, Request());
        Assert.NotEqual(Guid.Empty, priv.Id);
    }

    [Fact]
    public async Task MakingAPublicMomentPrivate_IsChargedAgainstTheAllowance()
    {
        // Otherwise an owner could post publicly without limit and then flip
        // every Moment to private, reaching an unlimited private archive by
        // another route.
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 1);
        await harness.Memories.CreateAsync(AliceId, MochiId, Request());
        var published = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.UpdateAsync(
                AliceId,
                published.Id,
                UpdateRequest(visibility: MemoryVisibility.Private)));

        Assert.Equal("plan_limit_reached", error.Code);
    }

    [Fact]
    public async Task MakingAPrivateMomentPublic_FreesTheAllowanceSlot()
    {
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 1);
        var created = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Public));

        // Sharing it publicly returns the private slot.
        var another = await harness.Memories.CreateAsync(AliceId, MochiId, Request());
        Assert.NotEqual(Guid.Empty, another.Id);
    }

    [Fact]
    public async Task AMomentAboutThreePets_ConsumesExactlyOneAllowance()
    {
        // A Moment about three pets must cost one private slot, not three, or a
        // multi-pet household would be penalised for using the feature.
        using var harness = await Harness.CreateAsync(maxPrivateMemoriesPerPet: 2);

        await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId, LuckyId]));
        await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId, LuckyId]));

        Assert.Equal(2, await harness.Db.PetMemories.CountAsync(item => item.PetId == MochiId));

        // Coco and Lucky appear in both Moments but have spent none of their own
        // allowance, so each can still be the primary subject of its own.
        Assert.Equal(0, await harness.Db.PetMemories.CountAsync(item => item.PetId == CocoId));
        var cocoMoment = await harness.Memories.CreateAsync(AliceId, CocoId, Request());
        Assert.NotEqual(Guid.Empty, cocoMoment.Id);
    }

    [Fact]
    public async Task AdditionalPets_MustBelongToTheAuthenticatedUser()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.CreateAsync(
                AliceId,
                MochiId,
                Request(additionalPetIds: [BobsPetId])));

        Assert.Equal("pet_not_owned", error.Code);
        Assert.Equal(403, error.StatusCode);
    }

    [Fact]
    public async Task AdditionalPets_AreDeduplicatedAndNeverDuplicateThePrimary()
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId, CocoId, MochiId]));

        var subjects = await harness.Db.MomentPets
            .Where(item => item.MomentId == response.Id)
            .ToListAsync();

        // Mochi is already the primary subject and Coco was listed twice.
        Assert.Equal(2, subjects.Count);
        Assert.Equal(1, subjects.Count(item => item.PetId == MochiId));
        Assert.Equal(1, subjects.Count(item => item.PetId == CocoId));
    }

    [Fact]
    public async Task UpdatingASubjectList_ReplacesTheExtrasAndKeepsThePrimary()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId]));

        var updated = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: [LuckyId]));

        Assert.Equal(new[] { LuckyId }, updated.AdditionalPetIds);

        var subjects = await harness.Db.MomentPets
            .Where(item => item.MomentId == created.Id)
            .ToListAsync();

        Assert.Equal(2, subjects.Count);
        Assert.Contains(subjects, item => item.PetId == MochiId);
    }

    [Fact]
    public async Task ClearingTheSubjectList_LeavesOnlyThePrimaryPet()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId, LuckyId]));

        var updated = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: []));

        Assert.Empty(updated.AdditionalPetIds);

        var subject = Assert.Single(await harness.Db.MomentPets
            .Where(item => item.MomentId == created.Id)
            .ToListAsync());
        Assert.Equal(MochiId, subject.PetId);
    }

    [Fact]
    public async Task PublishedAt_SurvivesBeingMadePrivateAgain()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));
        var firstPublishedAt = created.PublishedAt;

        var hidden = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Private));

        // The historical publication time is evidence, not presentation state.
        // Destroying it would lose the only record of when this was first shared.
        Assert.Equal(firstPublishedAt, hidden.PublishedAt);
    }

    [Theory]
    [InlineData("caption")]
    [InlineData("title")]
    [InlineData("timeline")]
    [InlineData("pets")]
    public async Task PublishedAt_IsUntouchedByEveryOrdinaryEdit(string field)
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));
        var firstPublishedAt = created.PublishedAt;
        harness.Clock.Advance(TimeSpan.FromDays(30));

        var request = field switch
        {
            "caption" => UpdateRequest(caption: "New caption"),
            "title" => new UpdateMemoryRequest(
                "New title", null, null, null, null, null, null, null, null, null),
            "timeline" => new UpdateMemoryRequest(
                null, null, null, null, null, null, true, "A note", null, null),
            _ => UpdateRequest(additionalPetIds: [CocoId])
        };

        var edited = await harness.Memories.UpdateAsync(AliceId, created.Id, request);

        Assert.Equal(firstPublishedAt, edited.PublishedAt);
    }

    [Fact]
    public async Task ThePrimaryPet_StaysInTheMembershipListWhenTheExtrasAreReplaced()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId]));

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: [LuckyId]));

        var members = await harness.Db.MomentPets
            .Where(item => item.MomentId == created.Id)
            .Select(item => item.PetId)
            .ToListAsync();

        Assert.Contains(MochiId, members);
        Assert.Contains(LuckyId, members);
        Assert.DoesNotContain(CocoId, members);
    }

    [Fact]
    public async Task ThePrimaryPet_CannotBeRemovedByListingItAsAnExtra()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        // Clearing the extras must never clear the primary membership row.
        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: []));

        var member = Assert.Single(await harness.Db.MomentPets
            .Where(item => item.MomentId == created.Id)
            .ToListAsync());
        Assert.Equal(MochiId, member.PetId);
    }

    [Fact]
    public async Task AMomentMissingItsPrimaryMembership_IsRepairedOnTheNextWrite()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(AliceId, MochiId, Request());

        // Simulate a row written before MomentPets existed.
        harness.Db.MomentPets.RemoveRange(
            await harness.Db.MomentPets.Where(item => item.MomentId == created.Id).ToListAsync());
        await harness.Db.SaveChangesAsync();

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: [CocoId]));

        var members = await harness.Db.MomentPets
            .Where(item => item.MomentId == created.Id)
            .Select(item => item.PetId)
            .ToListAsync();

        Assert.Contains(MochiId, members);
        Assert.Contains(CocoId, members);
    }

    [Fact]
    public async Task TheCompatibilityFlag_AlwaysAgreesWithVisibility()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == created.Id);
        Assert.True(saved.ShowOnPublicProfile);

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(visibility: MemoryVisibility.Private));

        saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == created.Id);
        Assert.False(saved.ShowOnPublicProfile);
    }

    [Fact]
    public async Task TheCompatibilityFlag_CannotBeDesyncedByAnyWritePath()
    {
        // Written directly against the DbContext, bypassing every service. The
        // derivation lives on the SaveChanges boundary precisely so this state
        // cannot be persisted by future code either.
        using var harness = await Harness.CreateAsync();

        harness.Db.PetMemories.Add(new PetMemory
        {
            PetId = MochiId,
            AuthorUserId = AliceId,
            Title = "Contradictory",
            Visibility = MemoryVisibility.Private,
            ShowOnPublicProfile = true
        });
        await harness.Db.SaveChangesAsync();

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Title == "Contradictory");
        Assert.False(saved.ShowOnPublicProfile);
    }

    [Fact]
    public async Task APublicMultiPetMoment_AppearsOnEverySubjectProfileExactlyOnce()
    {
        using var harness = await Harness.CreateAsync();
        await harness.EnablePublicProfilesAsync();

        await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public, additionalPetIds: [CocoId]));

        var mochiProfile = await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        var cocoProfile = await harness.PublicProfiles.GetByPublicSlugAsync("coco-pubcoco");
        var luckyProfile = await harness.PublicProfiles.GetByPublicSlugAsync("lucky-publucky");

        // One Moment, on both subjects' profiles, once each.
        Assert.Single(mochiProfile.Memories);
        Assert.Single(cocoProfile.Memories);
        Assert.Empty(luckyProfile.Memories);
    }

    [Fact]
    public async Task APrivateMultiPetMoment_AppearsOnNoPublicProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.EnablePublicProfilesAsync();

        await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(additionalPetIds: [CocoId]));

        // Multi-pet support must not become an accidental publishing route.
        Assert.Empty((await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi")).Memories);
        Assert.Empty((await harness.PublicProfiles.GetByPublicSlugAsync("coco-pubcoco")).Memories);
    }

    [Fact]
    public async Task RemovingAPetFromAMoment_RemovesItFromThatPetProfileOnly()
    {
        using var harness = await Harness.CreateAsync();
        await harness.EnablePublicProfilesAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public, additionalPetIds: [CocoId]));

        await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: []));

        Assert.Single((await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi")).Memories);
        Assert.Empty((await harness.PublicProfiles.GetByPublicSlugAsync("coco-pubcoco")).Memories);
    }

    [Fact]
    public async Task ChangingTheSubjectPets_LeavesAuthorshipAndPublicationAlone()
    {
        using var harness = await Harness.CreateAsync();
        var created = await harness.Memories.CreateAsync(
            AliceId,
            MochiId,
            Request(visibility: MemoryVisibility.Public));
        var publishedAt = created.PublishedAt;
        harness.Clock.Advance(TimeSpan.FromDays(10));

        var updated = await harness.Memories.UpdateAsync(
            AliceId,
            created.Id,
            UpdateRequest(additionalPetIds: [CocoId, LuckyId]));

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == created.Id);
        Assert.Equal(AliceId, saved.AuthorUserId);
        Assert.Equal(publishedAt, updated.PublishedAt);
    }

    private static CreateMemoryRequest Request(
        MemoryVisibility visibility = MemoryVisibility.Private,
        IReadOnlyCollection<Guid>? additionalPetIds = null)
    {
        return new CreateMemoryRequest(
            Title: "Beach day",
            Date: new DateOnly(2026, 8, 21),
            Type: "Memory",
            Caption: "First swim",
            Visibility: visibility,
            ShowOnPublicProfile: null,
            ShowInLifeTimeline: false,
            TimelineNote: null,
            MediaFileIds: null,
            AdditionalPetIds: additionalPetIds);
    }

    private static UpdateMemoryRequest UpdateRequest(
        string? caption = null,
        MemoryVisibility? visibility = null,
        IReadOnlyCollection<Guid>? additionalPetIds = null)
    {
        return new UpdateMemoryRequest(
            Title: null,
            Date: null,
            Type: null,
            Caption: caption,
            Visibility: visibility,
            ShowOnPublicProfile: null,
            ShowInLifeTimeline: null,
            TimelineNote: null,
            MediaFileIds: null,
            AdditionalPetIds: additionalPetIds);
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 9, 15, 0, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan amount) => _now = _now.Add(amount);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, TestClock clock)
        {
            Db = db;
            Clock = clock;
            Memories = new MemoryService(db, Options.Create(new CloudflareR2Options()));
            PublicProfiles = new PublicProfileService(
                db,
                Options.Create(new CloudflareR2Options()),
                clock);
        }

        public MyPetLinkDbContext Db { get; }

        public TestClock Clock { get; }

        public MemoryService Memories { get; }

        public PublicProfileService PublicProfiles { get; }

        /// <summary>
        /// Gives Alice's pets shareable public profiles so the profile read path
        /// can be exercised. Deliberately separate from social participation.
        /// </summary>
        public async Task EnablePublicProfilesAsync()
        {
            foreach (var (petId, code, slug) in new[]
            {
                (MochiId, "pubmochi", "mochi-pubmochi"),
                (CocoId, "pubcoco", "coco-pubcoco"),
                (LuckyId, "publucky", "lucky-publucky")
            })
            {
                var pet = await Db.Pets.SingleAsync(item => item.Id == petId);
                pet.Slug = slug;
                Db.PetPublicProfiles.Add(new PetPublicProfile
                {
                    PetId = petId,
                    PublicCode = code,
                    SlugSnapshot = slug,
                    IsPublicProfileEnabled = true,
                    ShowMoments = true,
                    ShowTimeline = true
                });
            }

            await Db.SaveChangesAsync();
        }

        public static async Task<Harness> CreateAsync(int maxPrivateMemoriesPerPet = 20)
        {
            var clock = new TestClock();
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options, clock);

            db.Users.Add(BuildUser(AliceId, "alice@example.com", "Alice", maxPrivateMemoriesPerPet));
            db.Users.Add(BuildUser(BobId, "bob@example.com", "Bob", maxPrivateMemoriesPerPet));
            await db.SaveChangesAsync();

            db.Pets.Add(BuildPet(MochiId, AliceId, "Mochi"));
            db.Pets.Add(BuildPet(CocoId, AliceId, "Coco"));
            db.Pets.Add(BuildPet(LuckyId, AliceId, "Lucky"));
            db.Pets.Add(BuildPet(BobsPetId, BobId, "Bailey"));
            await db.SaveChangesAsync();

            return new Harness(db, clock);
        }

        private static User BuildUser(Guid id, string email, string displayName, int maxPrivateMemoriesPerPet)
        {
            return new User
            {
                Id = id,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = displayName,
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,
                    OwnerDisplayName = displayName,
                    Plan = new Plan
                    {
                        Code = $"Free-{id:N}",
                        Name = "Free",
                        PriceLabel = "RM0",
                        Limit = new PlanLimit
                        {
                            MaxPets = 10,
                            MaxPrivateMemoriesPerPet = maxPrivateMemoriesPerPet,
                            MaxMediaPerMemory = 5,
                            MaxFamilyMembers = 1,
                            MaxCareRecords = 100,
                            ScanHistoryDays = 0
                        }
                    }
                }
            };
        }

        private static Pet BuildPet(Guid id, Guid ownerId, string name)
        {
            return new Pet
            {
                Id = id,
                OwnerUserId = ownerId,
                Slug = $"{name.ToLowerInvariant()}-{id:N}"[..20],
                Name = name,
                Species = "Cat"
            };
        }

        public void Dispose() => Db.Dispose();
    }
}
