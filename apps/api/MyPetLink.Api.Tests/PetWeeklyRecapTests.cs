using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
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
/// One pet's Weekly Recap: which week, which Moments and which care belong
/// to it, and who may ask.
///
/// "Now" is Thursday 22 October 2026, 10:00 in Malaysia, so the current week
/// is 19–25 October and the last complete week is 12–18 October, whose UTC
/// bounds are [11 Oct 16:00Z, 18 Oct 16:00Z).
/// </summary>
public sealed class PetWeeklyRecapTests
{
    private static readonly Guid OwnerId = Guid.Parse("71111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("72222222-2222-2222-2222-222222222222");
    private static readonly Guid MiloId = Guid.Parse("73333333-3333-3333-3333-333333333331");
    private static readonly Guid OyenId = Guid.Parse("73333333-3333-3333-3333-333333333332");
    private static readonly Guid RexId = Guid.Parse("73333333-3333-3333-3333-333333333333");

    private static readonly DateTimeOffset Now = new(2026, 10, 22, 2, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 22);
    private static readonly DateOnly LastWeek = new(2026, 10, 12);
    private static readonly DateOnly ThisWeek = new(2026, 10, 19);

    // ---- Weeks --------------------------------------------------------------

    [Fact]
    public async Task WithoutAWeek_ReturnsTheLastCompleteWeek_AndItsBounds()
    {
        using var harness = await Harness.CreateAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, null);

        Assert.Equal(LastWeek, recap.WeekStart);
        Assert.Equal(new DateOnly(2026, 10, 18), recap.WeekEnd);
        Assert.Equal(Today, recap.AsOfDate);
        Assert.False(recap.IsCurrentWeek);
        Assert.Equal(ThisWeek, recap.LatestWeekStart);
        Assert.Equal(ThisWeek.AddDays(-7 * PetWeeklyRecapService.WeeksOfHistory), recap.EarliestWeekStart);
        Assert.Equal("Milo", recap.PetName);
    }

    [Fact]
    public async Task APetAddedThisWeek_OpensOnThisWeek()
    {
        using var harness = await Harness.CreateAsync();
        // Monday 19 Oct, 00:30 in Malaysia — still Sunday in UTC.
        await harness.SetPetCreatedAtAsync(MiloId, new DateTimeOffset(2026, 10, 18, 16, 30, 0, TimeSpan.Zero));

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, null);

        Assert.Equal(ThisWeek, recap.WeekStart);
        Assert.True(recap.IsCurrentWeek);
    }

    [Fact]
    public async Task APetAddedJustBeforeThisWeek_OpensOnLastWeek()
    {
        using var harness = await Harness.CreateAsync();
        // Sunday 18 Oct, 23:59 in Malaysia.
        await harness.SetPetCreatedAtAsync(MiloId, new DateTimeOffset(2026, 10, 18, 15, 59, 0, TimeSpan.Zero));

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, null);

        Assert.Equal(LastWeek, recap.WeekStart);
    }

    [Theory]
    [InlineData("2026-10-13", "A week starts on a Monday.")]
    [InlineData("2026-10-26", "That week has not started yet.")]
    [InlineData("2026-07-20", "Weekly recaps go back 12 weeks.")]
    public async Task AWeekOutsideTheRules_IsAFieldError(string weekStart, string message)
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Recap.GetAsync(OwnerId, MiloId, DateOnly.Parse(weekStart)));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
        Assert.Equal(message, Assert.Single(error.Details!["weekStart"]));
    }

    [Fact]
    public async Task TheOldestAndNewestWeeks_CanBeOpened()
    {
        using var harness = await Harness.CreateAsync();

        var oldest = await harness.Recap.GetAsync(OwnerId, MiloId, new DateOnly(2026, 7, 27));
        var current = await harness.Recap.GetAsync(OwnerId, MiloId, ThisWeek);

        Assert.Equal(oldest.EarliestWeekStart, oldest.WeekStart);
        Assert.True(current.IsCurrentWeek);
    }

    [Theory]
    [InlineData("2026-10-19", "2026-10-19")]
    [InlineData("2026-10-22", "2026-10-19")]
    [InlineData("2026-10-25", "2026-10-19")]
    [InlineData("2026-10-26", "2026-10-26")]
    [InlineData("2027-01-01", "2026-12-28")]
    [InlineData("2028-02-29", "2028-02-28")]
    [InlineData("2028-03-05", "2028-02-28")]
    public void WeekStart_IsTheMondayOnOrBefore(string day, string monday)
    {
        Assert.Equal(DateOnly.Parse(monday), MalaysiaCalendar.WeekStart(DateOnly.Parse(day)));
    }

    [Theory]
    [InlineData("2026-10-18T15:59:59Z", "2026-10-18")]
    [InlineData("2026-10-18T16:00:00Z", "2026-10-19")]
    [InlineData("2026-12-31T16:00:00Z", "2027-01-01")]
    public void Today_IsMalaysiasCalendarDay(string utc, string expected)
    {
        var provider = new FixedTimeProvider(DateTimeOffset.Parse(utc));
        Assert.Equal(DateOnly.Parse(expected), MalaysiaCalendar.Today(provider));
    }

    // ---- Moments ------------------------------------------------------------

    [Fact]
    public async Task MomentsBelongToTheWeekTheyAreAbout_OnMalaysiasCalendar()
    {
        using var harness = await Harness.CreateAsync();
        harness.AddMoment(MiloId, "Sunday before", new DateOnly(2026, 10, 11));
        var monday = harness.AddMoment(MiloId, "Monday", new DateOnly(2026, 10, 12));
        var sunday = harness.AddMoment(MiloId, "Sunday", new DateOnly(2026, 10, 18));
        harness.AddMoment(MiloId, "Next Monday", new DateOnly(2026, 10, 19));
        // Written this week about last week: it stays in last week.
        var lateWrite = harness.AddMoment(MiloId, "Written later", new DateOnly(2026, 10, 16), createdAt: Now.AddHours(-1));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.Equal(3, recap.Moments.Total);
        Assert.Equal(
            [sunday.Id, lateWrite.Id, monday.Id],
            recap.Moments.Items.Select(item => item.Id).ToArray());
    }

    [Fact]
    public async Task AnUndatedOlderMoment_UsesTheMalaysiaDayItWasWritten()
    {
        using var harness = await Harness.CreateAsync();
        harness.AddMoment(MiloId, "Sunday 23:59:59 before", null, createdAt: new DateTimeOffset(2026, 10, 11, 15, 59, 59, TimeSpan.Zero));
        var first = harness.AddMoment(MiloId, "Monday 00:00", null, createdAt: new DateTimeOffset(2026, 10, 11, 16, 0, 0, TimeSpan.Zero));
        var last = harness.AddMoment(MiloId, "Sunday 23:59:59", null, createdAt: new DateTimeOffset(2026, 10, 18, 15, 59, 59, TimeSpan.Zero));
        harness.AddMoment(MiloId, "Next Monday 00:00", null, createdAt: new DateTimeOffset(2026, 10, 18, 16, 0, 0, TimeSpan.Zero));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.Equal(2, recap.Moments.Total);
        Assert.Equal([last.Id, first.Id], recap.Moments.Items.Select(item => item.Id).ToArray());
        Assert.Equal(new DateOnly(2026, 10, 12), recap.Moments.Items.Single(item => item.Id == first.Id).Date);
        Assert.Equal(new DateOnly(2026, 10, 18), recap.Moments.Items.Single(item => item.Id == last.Id).Date);
    }

    [Fact]
    public async Task MomentsOnTheSameDay_ListNewestWrittenFirst_DatedOrNot()
    {
        using var harness = await Harness.CreateAsync();
        var dated = harness.AddMoment(MiloId, "Dated", LastWeek, createdAt: new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero));
        var undated = harness.AddMoment(MiloId, "Undated", null, createdAt: new DateTimeOffset(2026, 10, 11, 16, 0, 0, TimeSpan.Zero));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.Equal([undated.Id, dated.Id], recap.Moments.Items.Select(item => item.Id).ToArray());
    }

    [Fact]
    public async Task TheCurrentWeek_CountsOnlyDaysUpToToday()
    {
        using var harness = await Harness.CreateAsync();
        var todays = harness.AddMoment(MiloId, "Today", Today);
        harness.AddMoment(MiloId, "Tomorrow", Today.AddDays(1));
        harness.AddMoment(MiloId, "Sunday", new DateOnly(2026, 10, 25));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, ThisWeek);

        Assert.True(recap.IsCurrentWeek);
        Assert.Equal(1, recap.Moments.Total);
        Assert.Equal(todays.Id, Assert.Single(recap.Moments.Items).Id);
    }

    [Fact]
    public async Task ArchivedAndDeletedMoments_AreLeftOut_AndHiddenOnesAreMarked()
    {
        using var harness = await Harness.CreateAsync();
        var shared = harness.AddMoment(MiloId, "Shared", LastWeek, MemoryVisibility.Public);
        var onlyMe = harness.AddMoment(MiloId, "Only me", LastWeek, MemoryVisibility.Private);
        var familyOnly = harness.AddMoment(MiloId, "Legacy family", LastWeek, MemoryVisibility.FamilyOnly);
        var hidden = harness.AddMoment(MiloId, "Hidden", LastWeek, MemoryVisibility.Public);
        hidden.ModeratedAt = Now;
        hidden.ModeratedByUserId = OtherOwnerId;
        harness.AddMoment(MiloId, "Archived", LastWeek).ArchivedAt = Now;
        harness.AddMoment(MiloId, "Deleted", LastWeek).DeletedAt = Now;
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.Equal(4, recap.Moments.Total);
        Assert.Equal(2, recap.Moments.SharedPubliclyCount);
        Assert.Equal(2, recap.Moments.OnlyMeCount);
        var byId = recap.Moments.Items.ToDictionary(item => item.Id);
        Assert.Equal(MemoryVisibility.Public, byId[shared.Id].Visibility);
        Assert.Equal(MemoryVisibility.Private, byId[onlyMe.Id].Visibility);
        Assert.Equal(MemoryVisibility.Private, byId[familyOnly.Id].Visibility);
        Assert.True(byId[hidden.Id].HiddenByMyPetLink);
        Assert.False(byId[shared.Id].HiddenByMyPetLink);
    }

    [Fact]
    public async Task AnOwnExtraPetsMoment_IsIncludedOnce_AndCollaborationsAreNot()
    {
        using var harness = await Harness.CreateAsync();
        var together = harness.AddMoment(MiloId, "Together", LastWeek);
        harness.Db.MomentPets.Add(new MomentPet { MomentId = together.Id, PetId = MiloId });
        harness.Db.MomentPets.Add(new MomentPet { MomentId = together.Id, PetId = OyenId });
        // Another household's Moment that Oyen joined through a collaboration.
        var theirs = harness.AddMoment(RexId, "Playdate", LastWeek, author: OtherOwnerId);
        harness.Db.MomentPets.Add(new MomentPet { MomentId = theirs.Id, PetId = OyenId, CollaborationId = Guid.NewGuid() });
        await harness.SaveAsync();

        var oyen = await harness.Recap.GetAsync(OwnerId, OyenId, LastWeek);
        var milo = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        var item = Assert.Single(oyen.Moments.Items);
        Assert.Equal(1, oyen.Moments.Total);
        Assert.Equal(together.Id, item.Id);
        Assert.False(item.IsPrimary);
        Assert.Equal(MiloId, item.PrimaryPetId);
        Assert.Equal("Milo", item.PrimaryPetName);
        Assert.Equal(1, milo.Moments.Total);
        Assert.True(Assert.Single(milo.Moments.Items).IsPrimary);
    }

    [Fact]
    public async Task Counts_StayExact_BeyondTheItemLimit()
    {
        using var harness = await Harness.CreateAsync();
        for (var index = 0; index < 63; index++)
        {
            harness.AddMoment(
                MiloId,
                $"Moment {index}",
                LastWeek.AddDays(index % 7),
                index % 3 == 0 ? MemoryVisibility.Public : MemoryVisibility.Private);
        }
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.Equal(63, recap.Moments.Total);
        Assert.Equal(21, recap.Moments.SharedPubliclyCount);
        Assert.Equal(42, recap.Moments.OnlyMeCount);
        Assert.Equal(MemoryService.WeeklyRecapMomentItemLimit, recap.Moments.Items.Count);
        Assert.Equal(new DateOnly(2026, 10, 18), recap.Moments.Items.First().Date);
    }

    /// <summary>
    /// Over the cap, dated and undated Moments across the year boundary and
    /// Malaysia's midnight: the undated ones take the Malaysia day they were
    /// written before anything is capped, so the 50 listed are the newest 50.
    /// The web's local preview test uses the same fixture and expects the
    /// same order.
    /// </summary>
    [Fact]
    public async Task OverTheCap_UndatedMomentsAreOrderedByTheirMalaysiaDayBeforeCapping()
    {
        // Tuesday 5 Jan 2027, 10:00 in Malaysia: last week is 28 Dec – 3 Jan.
        using var harness = await Harness.CreateAsync(new DateTimeOffset(2027, 1, 5, 2, 0, 0, TimeSpan.Zero));
        var written = new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero);
        var monday = new List<PetMemory>();
        for (var index = 0; index < 30; index++)
        {
            monday.Add(harness.AddMoment(MiloId, $"Mon {index}", new DateOnly(2026, 12, 28), createdAt: written.AddMinutes(index)));
        }
        for (var index = 0; index < 25; index++)
        {
            harness.AddMoment(MiloId, $"Thu {index}", new DateOnly(2026, 12, 31), createdAt: written.AddHours(1).AddMinutes(index));
        }
        var sunday = harness.AddMoment(MiloId, "Sunday", new DateOnly(2027, 1, 3), createdAt: written.AddHours(2));
        var sundayLegacy = harness.AddMoment(MiloId, "Sunday 23:59:59", null, createdAt: new DateTimeOffset(2027, 1, 3, 15, 59, 59, TimeSpan.Zero));
        var newYearLegacy = harness.AddMoment(MiloId, "New Year 00:00", null, createdAt: new DateTimeOffset(2026, 12, 31, 16, 0, 0, TimeSpan.Zero));
        var eveLegacy = harness.AddMoment(MiloId, "Eve 23:59:59", null, createdAt: new DateTimeOffset(2026, 12, 31, 15, 59, 59, TimeSpan.Zero));
        harness.AddMoment(MiloId, "Next Monday 00:00", null, createdAt: new DateTimeOffset(2027, 1, 3, 16, 0, 0, TimeSpan.Zero));
        harness.AddMoment(MiloId, "Sunday before", null, createdAt: new DateTimeOffset(2026, 12, 27, 15, 59, 59, TimeSpan.Zero));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, null);
        var items = recap.Moments.Items.ToArray();

        Assert.Equal(new DateOnly(2026, 12, 28), recap.WeekStart);
        Assert.Equal(59, recap.Moments.Total);
        Assert.Equal(50, items.Length);
        Assert.Equal(
            [sundayLegacy.Id, sunday.Id, newYearLegacy.Id, eveLegacy.Id],
            items.Take(4).Select(item => item.Id).ToArray());
        Assert.Equal(new DateOnly(2027, 1, 1), items[2].Date);
        Assert.Equal(new DateOnly(2026, 12, 31), items[3].Date);
        Assert.Equal(25, items.Count(item => item.Title.StartsWith("Thu ", StringComparison.Ordinal)));
        // 21 Monday Moments fit, newest written first.
        Assert.Equal(
            monday.AsEnumerable().Reverse().Take(21).Select(moment => moment.Id),
            items.Skip(29).Select(item => item.Id));
    }

    [Fact]
    public async Task Previews_UseTheCoverThumbnail_AVideosOwnFile_OrNothing()
    {
        using var harness = await Harness.CreateAsync();
        var photo = harness.AddMoment(MiloId, "Photo", LastWeek);
        var first = harness.AddMedia(photo, MediaFileType.Image, 0, thumbnail: true);
        var cover = harness.AddMedia(photo, MediaFileType.Image, 1, thumbnail: true);
        harness.AddMedia(photo, MediaFileType.Image, 2, archivedLink: true);
        photo.CoverMediaFileId = cover.Id;
        var clip = harness.AddMoment(MiloId, "Clip", LastWeek.AddDays(1));
        harness.AddMedia(clip, MediaFileType.Video, 0);
        var words = harness.AddMoment(MiloId, "Words only", LastWeek.AddDays(2));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);
        var byId = recap.Moments.Items.ToDictionary(item => item.Id);

        Assert.Equal(2, byId[photo.Id].MediaCount);
        Assert.Equal(cover.Id, byId[photo.Id].Preview!.Id);
        Assert.Equal("image", byId[photo.Id].Preview!.Type);
        Assert.EndsWith("_thumb.jpg", byId[photo.Id].Preview!.Url);
        Assert.NotEqual(first.Id, byId[photo.Id].Preview!.Id);
        Assert.Equal("video", byId[clip.Id].Preview!.Type);
        Assert.EndsWith(".mp4", byId[clip.Id].Preview!.Url);
        Assert.Null(byId[words.Id].Preview);
        Assert.Equal(0, byId[words.Id].MediaCount);
    }

    // ---- Care ---------------------------------------------------------------

    [Fact]
    public async Task CareLoggedInTheWeek_IsListed_WithWhetherItCompletedADueItem()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, "Rabies booster", LastWeek.AddDays(-60), LastWeek.AddDays(2));
        await harness.SaveAsync();
        var completion = harness.AddRecord(MiloId, "Rabies booster", LastWeek.AddDays(3), LastWeek.AddYears(1));
        completion.FulfillsCareRecordId = target.Id;
        var bath = harness.AddRecord(MiloId, "Bath", LastWeek, null);
        harness.AddRecord(MiloId, "Before", LastWeek.AddDays(-1), null);
        harness.AddRecord(MiloId, "After", ThisWeek, null);
        harness.AddRecord(MiloId, "Archived log", LastWeek.AddDays(1), null).ArchivedAt = Now;
        harness.AddRecord(MiloId, "Deleted log", LastWeek.AddDays(1), null).DeletedAt = Now;
        harness.AddRecord(OyenId, "Oyen bath", LastWeek.AddDays(1), null);
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.True(recap.Care.HasCareRecords);
        Assert.Equal(2, recap.Care.Logged.Total);
        Assert.Equal([completion.Id, bath.Id], recap.Care.Logged.Items.Select(item => item.Id).ToArray());
        Assert.True(recap.Care.Logged.Items.First().LoggedAsDone);
        Assert.False(recap.Care.Logged.Items.Last().LoggedAsDone);
        // Completed, so it is not still due.
        Assert.Equal(0, recap.Care.StillDue.Total);
    }

    [Fact]
    public async Task DueItems_AreSplitByToday_WithOneStatusEach()
    {
        using var harness = await Harness.CreateAsync();
        var lastWeekMissed = harness.AddRecord(MiloId, "Deworm", LastWeek.AddDays(-30), LastWeek.AddDays(4));
        var olderMissed = harness.AddRecord(MiloId, "Old booster", LastWeek.AddDays(-90), LastWeek.AddDays(-10));
        var yesterday = harness.AddRecord(MiloId, "Grooming", LastWeek.AddDays(-30), Today.AddDays(-1));
        var dueToday = harness.AddRecord(MiloId, "Pill", LastWeek.AddDays(-30), Today);
        var tomorrow = harness.AddRecord(MiloId, "Nail trim", LastWeek.AddDays(-30), Today.AddDays(1));
        var later = harness.AddRecord(MiloId, "Checkup", LastWeek.AddDays(-30), Today.AddDays(31));
        var furthest = harness.AddRecord(MiloId, "Annual", LastWeek.AddDays(-30), Today.AddDays(90));
        await harness.SaveAsync();

        var last = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);
        var current = await harness.Recap.GetAsync(OwnerId, MiloId, ThisWeek);

        Assert.Equal(lastWeekMissed.Id, Assert.Single(last.Care.StillDue.Items).Id);
        Assert.Equal("overdue", last.Care.StillDue.Items.Single().Status);
        Assert.Equal(3, last.Care.OverdueTotal);

        Assert.Equal(yesterday.Id, Assert.Single(current.Care.StillDue.Items).Id);
        Assert.DoesNotContain(current.Care.StillDue.Items, item => item.Id == dueToday.Id);

        // Coming up is the same for any week: as of today.
        Assert.Equal(4, current.Care.ComingUp.Total);
        Assert.Equal(4, last.Care.ComingUp.Total);
        Assert.Equal(
            [(dueToday.Id, "due-today"), (tomorrow.Id, "due-soon"), (later.Id, "upcoming")],
            current.Care.ComingUp.Items.Select(item => (item.Id, item.Status)).ToArray());
        Assert.DoesNotContain(current.Care.ComingUp.Items, item => item.Id == furthest.Id);
        Assert.DoesNotContain(
            current.Care.ComingUp.Items.Select(item => item.Id),
            current.Care.StillDue.Items.Select(item => item.Id).Contains);
        _ = olderMissed;
    }

    [Theory]
    [InlineData(-1, "overdue")]
    [InlineData(0, "due-today")]
    [InlineData(1, "due-soon")]
    [InlineData(30, "due-soon")]
    [InlineData(31, "upcoming")]
    public void DueStatus_IsStrictlyOverdueBeforeToday(int days, string status)
    {
        Assert.Equal(status, CareRecordService.DeriveWeeklyRecapStatus(Today.AddDays(days), Today));
    }

    [Fact]
    public async Task APetWithNoCare_SaysSo()
    {
        using var harness = await Harness.CreateAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);

        Assert.False(recap.Care.HasCareRecords);
        Assert.Equal(0, recap.Care.Logged.Total);
        Assert.Equal(0, recap.Care.ComingUp.Total);
        Assert.Equal(0, recap.Moments.Total);
    }

    [Fact]
    public async Task AYearBoundaryWeek_AndALeapDay_AreWholeWeeks()
    {
        using var harness = await Harness.CreateAsync(new DateTimeOffset(2027, 1, 5, 2, 0, 0, TimeSpan.Zero));
        harness.AddMoment(MiloId, "Old year", new DateOnly(2026, 12, 28));
        harness.AddMoment(MiloId, "New year", new DateOnly(2027, 1, 3));
        harness.AddMoment(MiloId, "Too early", new DateOnly(2026, 12, 27));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, null);

        Assert.Equal(new DateOnly(2026, 12, 28), recap.WeekStart);
        Assert.Equal(new DateOnly(2027, 1, 3), recap.WeekEnd);
        Assert.Equal(2, recap.Moments.Total);

        using var leap = await Harness.CreateAsync(new DateTimeOffset(2028, 3, 6, 2, 0, 0, TimeSpan.Zero));
        leap.AddMoment(MiloId, "Leap day", new DateOnly(2028, 2, 29));
        await leap.SaveAsync();
        var leapRecap = await leap.Recap.GetAsync(OwnerId, MiloId, null);
        Assert.Equal(new DateOnly(2028, 2, 28), leapRecap.WeekStart);
        Assert.Equal(1, leapRecap.Moments.Total);
    }

    // ---- Access -------------------------------------------------------------

    [Fact]
    public async Task AnotherOwnersOrADeletedPet_IsNotFound_AndNoOneSignedInIsRefused()
    {
        using var harness = await Harness.CreateAsync();
        var deleted = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
        deleted.DeletedAt = Now;
        await harness.Db.SaveChangesAsync();

        var foreign = await Assert.ThrowsAsync<ApiException>(() => harness.Recap.GetAsync(OwnerId, RexId, null));
        var gone = await Assert.ThrowsAsync<ApiException>(() => harness.Recap.GetAsync(OwnerId, OyenId, null));
        var anonymous = await Assert.ThrowsAsync<ApiException>(() => harness.Recap.GetAsync(null, MiloId, null));

        Assert.Equal(StatusCodes.Status404NotFound, foreign.StatusCode);
        Assert.Equal(StatusCodes.Status404NotFound, gone.StatusCode);
        Assert.Equal(StatusCodes.Status401Unauthorized, anonymous.StatusCode);
    }

    [Theory]
    [InlineData(PetLifecycleStatus.Memorial, false)]
    [InlineData(PetLifecycleStatus.Archived, true)]
    public async Task MemorialAndArchivedPets_HaveNoRecap(PetLifecycleStatus lifecycle, bool archived)
    {
        using var harness = await Harness.CreateAsync();
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == MiloId);
        pet.LifecycleStatus = lifecycle;
        pet.ArchivedAt = archived ? Now : null;
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Recap.GetAsync(OwnerId, MiloId, null));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, error.StatusCode);
        Assert.Equal("weekly_recap_unavailable", error.Code);
    }

    [Fact]
    public async Task ThePayload_CarriesNoNotesProvidersCaptionsOrPeople()
    {
        using var harness = await Harness.CreateAsync();
        var moment = harness.AddMoment(MiloId, "Park", LastWeek);
        moment.Caption = "Secret caption";
        moment.TimelineNote = "Secret timeline note";
        harness.AddMedia(moment, MediaFileType.Image, 0, thumbnail: true, altText: "Secret alt text");
        harness.AddRecord(MiloId, "Vaccine", LastWeek, Today.AddDays(5));
        await harness.SaveAsync();

        var recap = await harness.Recap.GetAsync(OwnerId, MiloId, LastWeek);
        var json = JsonSerializer.Serialize(recap, new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            Converters = { new JsonStringEnumConverter() }
        });

        Assert.Contains("\"title\":\"Park\"", json);
        foreach (var secret in new[]
        {
            "Secret caption", "Secret timeline note", "Secret alt text", "Private note",
            "Klinik Haiwan", "owner@example.com", "Owner Account", "caption", "notes", "provider",
            "documents", "email", "displayName"
        })
        {
            Assert.DoesNotContain(secret, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    private sealed class Harness : IDisposable
    {
        private readonly Dictionary<object, DateTimeOffset> _createdAt = new(ReferenceEqualityComparer.Instance);
        private DateTimeOffset _nextCreatedAt;

        private Harness(MyPetLinkDbContext db, DateTimeOffset now)
        {
            Db = db;
            _nextCreatedAt = now.AddDays(-30);
            var timeProvider = new FixedTimeProvider(now);
            var options = Options.Create(new CloudflareR2Options { PublicBaseUrl = "https://media.example.test" });
            Recap = new PetWeeklyRecapService(
                db,
                new MemoryService(db, options),
                new CareRecordService(db, timeProvider),
                timeProvider);
        }

        public MyPetLinkDbContext Db { get; }

        public PetWeeklyRecapService Recap { get; }

        public static async Task<Harness> CreateAsync(DateTimeOffset? now = null)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            db.Users.Add(NewUser(OwnerId, "owner@example.com"));
            db.Users.Add(NewUser(OtherOwnerId, "other@example.com"));
            db.Pets.Add(NewPet(MiloId, OwnerId, "Milo"));
            db.Pets.Add(NewPet(OyenId, OwnerId, "Oyen"));
            db.Pets.Add(NewPet(RexId, OtherOwnerId, "Rex"));
            await db.SaveChangesAsync();

            var harness = new Harness(db, now ?? Now);
            // Pets added well before the weeks under test.
            foreach (var pet in db.Pets)
            {
                pet.CreatedAt = (now ?? Now).AddYears(-1);
            }
            await db.SaveChangesAsync();
            return harness;
        }

        public async Task SetPetCreatedAtAsync(Guid petId, DateTimeOffset createdAt)
        {
            var pet = await Db.Pets.SingleAsync(item => item.Id == petId);
            pet.CreatedAt = createdAt;
            await Db.SaveChangesAsync();
        }

        public PetMemory AddMoment(
            Guid petId,
            string title,
            DateOnly? date,
            MemoryVisibility visibility = MemoryVisibility.Private,
            DateTimeOffset? createdAt = null,
            Guid? author = null)
        {
            _nextCreatedAt = _nextCreatedAt.AddSeconds(1);
            var moment = new PetMemory
            {
                PetId = petId,
                AuthorUserId = author ?? OwnerId,
                Title = title,
                MomentDate = date,
                Type = "Everyday",
                Visibility = visibility,
                PublishedAt = visibility == MemoryVisibility.Public ? Now : null
            };
            Db.PetMemories.Add(moment);
            _createdAt[moment] = createdAt ?? _nextCreatedAt;
            return moment;
        }

        public MediaFile AddMedia(
            PetMemory moment,
            MediaFileType type,
            int sortOrder,
            bool thumbnail = false,
            bool archivedLink = false,
            string? altText = null)
        {
            var id = Guid.NewGuid();
            var extension = type == MediaFileType.Video ? "mp4" : "jpg";
            var key = $"moments/{moment.PetId:N}/{id:N}.{extension}";
            var media = new MediaFile
            {
                Id = id,
                OwnerUserId = OwnerId,
                PetId = moment.PetId,
                MediaType = type,
                Category = type == MediaFileType.Video ? MediaUploadCategory.MomentVideo : MediaUploadCategory.MomentImage,
                IsPublic = true,
                UploadStatus = MediaUploadStatus.Ready,
                ObjectKey = key,
                ThumbnailObjectKey = thumbnail ? MediaDerivatives.BuildThumbnailObjectKey(key) : null,
                DerivativeStatus = thumbnail ? MediaDerivativeStatus.Ready : MediaDerivativeStatus.NotApplicable,
                ContentType = type == MediaFileType.Video ? "video/mp4" : "image/jpeg"
            };
            Db.MediaFiles.Add(media);
            Db.MediaFileLinks.Add(new MediaFileLink
            {
                MediaFileId = id,
                OwnerType = MediaOwnerType.PetMemory,
                OwnerId = moment.Id,
                SortOrder = sortOrder,
                AltText = altText,
                Caption = altText,
                ArchivedAt = archivedLink ? Now : null
            });
            return media;
        }

        public CareRecord AddRecord(Guid petId, string title, DateOnly recordDate, DateOnly? dueDate)
        {
            _nextCreatedAt = _nextCreatedAt.AddSeconds(1);
            var record = new CareRecord
            {
                PetId = petId,
                Type = CareRecordType.Vaccine,
                Title = title,
                RecordDate = recordDate,
                DueDate = dueDate,
                Notes = "Private note",
                Provider = "Klinik Haiwan",
                PublicVisibility = CareRecordPublicVisibility.Private
            };
            Db.CareRecords.Add(record);
            _createdAt[record] = _nextCreatedAt;
            return record;
        }

        /// <summary>
        /// Saves, then pins each new row's creation time with a second save;
        /// the context stamps CreatedAt on insert.
        /// </summary>
        public async Task SaveAsync()
        {
            await Db.SaveChangesAsync();
            foreach (var (entity, createdAt) in _createdAt)
            {
                if (entity is PetMemory moment) moment.CreatedAt = createdAt;
                if (entity is CareRecord record) record.CreatedAt = createdAt;
            }

            _createdAt.Clear();
            await Db.SaveChangesAsync();
        }

        public void Dispose() => Db.Dispose();

        private static User NewUser(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Owner Account",
            Status = UserStatus.Active
        };

        private static Pet NewPet(Guid id, Guid ownerId, string name) => new()
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
            Name = name,
            Species = "Dog"
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
