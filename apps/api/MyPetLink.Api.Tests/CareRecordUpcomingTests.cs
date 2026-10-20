using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The owner-wide pending-care read behind the Dashboard's Care coming up.
///
/// The per-pet history list is ordered by record date and capped at 100 rows,
/// so a page of it can omit a pending item, or omit the record that completed
/// one. These tests pin that the pending read filters completely before it
/// pages, whatever the history looks like.
/// </summary>
public sealed class CareRecordUpcomingTests
{
    private static readonly Guid OwnerId = Guid.Parse("31111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherOwnerId = Guid.Parse("32222222-2222-2222-2222-222222222222");
    private static readonly Guid MiloId = Guid.Parse("33333333-3333-3333-3333-333333333331");
    private static readonly Guid OyenId = Guid.Parse("33333333-3333-3333-3333-333333333332");
    private static readonly Guid OtherPetId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    // 20 Oct 2026, 10:00 in Malaysia.
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 2, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 20);

    [Fact]
    public async Task PendingItemBehindMoreThanHundredHistoricalRecords_IsReturned()
    {
        using var harness = await Harness.CreateAsync();
        var pending = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-1), Today.AddDays(5), "Rabies booster");
        for (var index = 0; index < 120; index++)
        {
            harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-index % 30), dueDate: null);
        }
        await harness.SaveAsync();

        // The history list's first page cannot see it: it is the oldest record.
        var (historyPage, historyTotal) = await harness.Service.ListForPetAsync(
            OwnerId, MiloId, 1, 100, null, null, null, false);
        Assert.Equal(121, historyTotal);
        Assert.DoesNotContain(historyPage, record => record.Id == pending.Id);

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(1, total);
        var item = Assert.Single(upcoming.Items);
        Assert.Equal(pending.Id, item.Id);
        Assert.Equal("Rabies booster", item.Title);
        Assert.Equal("Milo", item.PetName);
        Assert.Equal(Today.AddDays(5), item.DueDate);
        Assert.Equal("due-soon", item.DerivedStatus);
    }

    [Fact]
    public async Task CompletingRecordOutsideTheFirstHundred_StillExcludesItsTarget()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-2), Today.AddDays(-1), "DHPP", createdAt: Now.AddDays(-30));
        for (var index = 0; index < 110; index++)
        {
            harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-3), dueDate: null);
        }
        // Backdated: by record date it is the oldest row, far beyond page one.
        var fulfiller = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-2), dueDate: null, createdAt: Now.AddDays(-1));
        fulfiller.FulfillsCareRecordId = target.Id;
        await harness.SaveAsync();

        var (historyPage, _) = await harness.Service.ListForPetAsync(
            OwnerId, MiloId, 1, 100, null, null, null, false);
        Assert.Contains(historyPage, record => record.Id == target.Id);
        Assert.DoesNotContain(historyPage, record => record.Id == fulfiller.Id);

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(0, total);
        Assert.Empty(upcoming.Items);
        Assert.Equal([MiloId], upcoming.PetIdsWithCareRecords);
    }

    [Fact]
    public async Task FulfilmentChain_ShowsOnlyTheLatestUnfulfilledDueDate()
    {
        using var harness = await Harness.CreateAsync();
        var first = harness.AddRecord(MiloId, CareRecordType.Deworming, Today.AddMonths(-6), Today.AddMonths(-3), createdAt: Now.AddDays(-180));
        var second = harness.AddRecord(MiloId, CareRecordType.Deworming, Today.AddMonths(-3), Today.AddMonths(3), createdAt: Now.AddDays(-90));
        second.FulfillsCareRecordId = first.Id;
        await harness.SaveAsync();

        var (chain, chainTotal) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);
        Assert.Equal(1, chainTotal);
        Assert.Equal(second.Id, Assert.Single(chain.Items).Id);

        var third = harness.AddRecord(MiloId, CareRecordType.Deworming, Today, dueDate: null, createdAt: Now);
        third.FulfillsCareRecordId = second.Id;
        await harness.SaveAsync();

        var (done, doneTotal) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);
        Assert.Equal(0, doneTotal);
        Assert.Empty(done.Items);
    }

    [Fact]
    public async Task ArchivedOrDeletedFulfiller_LeavesItsTargetPending()
    {
        using var harness = await Harness.CreateAsync();
        var archivedTarget = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-10), Today.AddDays(10), createdAt: Now.AddDays(-10));
        var deletedTarget = harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-10), Today.AddDays(11), createdAt: Now.AddDays(-10));
        var archivedFulfiller = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: null);
        archivedFulfiller.FulfillsCareRecordId = archivedTarget.Id;
        archivedFulfiller.ArchivedAt = Now;
        var deletedFulfiller = harness.AddRecord(MiloId, CareRecordType.Grooming, Today, dueDate: null);
        deletedFulfiller.FulfillsCareRecordId = deletedTarget.Id;
        deletedFulfiller.DeletedAt = Now;
        await harness.SaveAsync();

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(2, total);
        Assert.Equal(
            [archivedTarget.Id, deletedTarget.Id],
            upcoming.Items.Select(item => item.Id).ToArray());
    }

    [Fact]
    public async Task ArchivedAndDeletedDueItems_AreExcluded()
    {
        using var harness = await Harness.CreateAsync();
        var kept = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1));
        var archived = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(2));
        archived.ArchivedAt = Now;
        var deleted = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(3));
        deleted.DeletedAt = Now;
        await harness.SaveAsync();

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(1, total);
        Assert.Equal(kept.Id, Assert.Single(upcoming.Items).Id);
    }

    [Theory]
    [InlineData(PetLifecycleStatus.Memorial, false, false)]
    [InlineData(PetLifecycleStatus.Archived, true, false)]
    [InlineData(PetLifecycleStatus.Active, false, true)]
    public async Task InactivePets_AreExcludedEverywhere(
        PetLifecycleStatus lifecycle,
        bool archivedAt,
        bool deletedAt)
    {
        using var harness = await Harness.CreateAsync();
        var oyen = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
        oyen.LifecycleStatus = lifecycle;
        oyen.ArchivedAt = archivedAt ? Now : null;
        oyen.DeletedAt = deletedAt ? Now : null;
        harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1));
        var milo = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(2));
        await harness.SaveAsync();

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(1, total);
        Assert.Equal(milo.Id, Assert.Single(upcoming.Items).Id);
        Assert.Equal([MiloId], upcoming.PetIdsWithCareRecords);
    }

    [Fact]
    public async Task OtherOwnersCare_IsNeverReturned_AndTheirPetCannotBeUsedAsAFilter()
    {
        using var harness = await Harness.CreateAsync();
        harness.AddRecord(OtherPetId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1));
        await harness.SaveAsync();

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);
        Assert.Equal(0, total);
        Assert.Empty(upcoming.PetIdsWithCareRecords);

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListUpcomingAsync(OwnerId, OtherPetId, 1, 100));
        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
    }

    [Fact]
    public async Task MultiplePets_AreCombined_AndCanBeFilteredToOne()
    {
        using var harness = await Harness.CreateAsync();
        var milo = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(4));
        var oyen = harness.AddRecord(OyenId, CareRecordType.Grooming, Today.AddDays(-1), Today.AddDays(2));
        harness.AddRecord(OyenId, CareRecordType.Other, Today.AddDays(-1), dueDate: null);
        await harness.SaveAsync();

        var (all, allTotal) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);
        Assert.Equal(2, allTotal);
        Assert.Equal([oyen.Id, milo.Id], all.Items.Select(item => item.Id).ToArray());
        Assert.Equal(["Oyen", "Milo"], all.Items.Select(item => item.PetName).ToArray());
        Assert.Equal(
            new[] { MiloId, OyenId }.OrderBy(id => id),
            all.PetIdsWithCareRecords.OrderBy(id => id));

        var (oyenOnly, oyenTotal) = await harness.Service.ListUpcomingAsync(OwnerId, OyenId, 1, 100);
        Assert.Equal(1, oyenTotal);
        Assert.Equal(oyen.Id, Assert.Single(oyenOnly.Items).Id);
        Assert.Equal([OyenId], oyenOnly.PetIdsWithCareRecords);
    }

    [Fact]
    public async Task Pagination_IsAppliedAfterFiltering_WithAccurateTotalsAndStableOrder()
    {
        using var harness = await Harness.CreateAsync();
        var expected = new List<Guid>();
        // Two items share a due date; creation time breaks the tie.
        expected.Add(harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1), createdAt: Now.AddMinutes(-5)).Id);
        expected.Add(harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1), createdAt: Now.AddMinutes(-1)).Id);
        expected.Add(harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-1), Today.AddDays(9)).Id);
        expected.Add(harness.AddRecord(OyenId, CareRecordType.Medication, Today.AddDays(-1), Today.AddDays(40)).Id);
        expected.Add(harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-1), Today.AddDays(400)).Id);
        expected.Insert(0, harness.AddRecord(MiloId, CareRecordType.VetVisit, Today.AddDays(-30), Today.AddDays(-3)).Id);
        // Interleaved noise that must not consume page slots.
        for (var index = 0; index < 12; index++)
        {
            harness.AddRecord(index % 2 == 0 ? MiloId : OyenId, CareRecordType.Grooming, Today.AddDays(-index), dueDate: null);
        }
        await harness.SaveAsync();

        var seen = new List<Guid>();
        for (var page = 1; page <= 3; page++)
        {
            var (response, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, page, 2);
            Assert.Equal(6, total);
            Assert.Equal(2, response.Items.Count);
            seen.AddRange(response.Items.Select(item => item.Id));
        }

        Assert.Equal(expected, seen);
        var (beyond, beyondTotal) = await harness.Service.ListUpcomingAsync(OwnerId, null, 4, 2);
        Assert.Equal(6, beyondTotal);
        Assert.Empty(beyond.Items);
    }

    [Theory]
    // 23:59:59 on Monday 19 Oct in Malaysia: due today, not overdue.
    [InlineData("2026-10-19T15:59:59Z", "2026-10-19", "due-soon")]
    // 00:00:00 on Tuesday 20 Oct in Malaysia: the same date is now overdue.
    [InlineData("2026-10-19T16:00:00Z", "2026-10-20", "overdue")]
    public async Task Status_UsesTheMalaysiaCalendarDay(
        string utcNow,
        string expectedAsOf,
        string expectedStatus)
    {
        using var harness = await Harness.CreateAsync(DateTimeOffset.Parse(utcNow));
        harness.AddRecord(MiloId, CareRecordType.Vaccine, new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 19));
        await harness.SaveAsync();

        var (upcoming, _) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(DateOnly.Parse(expectedAsOf), upcoming.AsOfDate);
        Assert.Equal(expectedStatus, Assert.Single(upcoming.Items).DerivedStatus);
    }

    [Fact]
    public async Task OwnerWithNoCare_ReportsNoPetsWithCareRecords()
    {
        using var harness = await Harness.CreateAsync();

        var (upcoming, total) = await harness.Service.ListUpcomingAsync(OwnerId, null, 1, 100);

        Assert.Equal(0, total);
        Assert.Empty(upcoming.Items);
        Assert.Empty(upcoming.PetIdsWithCareRecords);
        Assert.Equal(Today, upcoming.AsOfDate);
    }

    // ---- Dashboard summary -------------------------------------------------

    [Fact]
    public async Task Summary_HasOneScopeForAllPetsAndOneForEachActivePet()
    {
        using var harness = await Harness.CreateAsync();
        var oyenOverdue = harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-40), Today.AddDays(-3), "Rabies booster");
        var miloSoon = harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-10), Today.AddDays(5), "Groom");
        var miloLater = harness.AddRecord(MiloId, CareRecordType.VetVisit, Today.AddDays(-10), Today.AddDays(90), "Check-up");
        await harness.SaveAsync();

        var summary = await harness.Service.GetUpcomingSummaryAsync(OwnerId);

        Assert.Equal(Today, summary.AsOfDate);
        Assert.Equal(Today.AddDays(30), summary.HorizonDate);
        Assert.True(summary.Complete);
        var all = Assert.Single(summary.Scopes, scope => scope.PetId is null);
        Assert.Equal((true, 3, 2, 1), (all.HasCareRecords, all.PendingCount, all.DueWithinHorizonCount, all.OverdueCount));
        Assert.Equal([oyenOverdue.Id, miloSoon.Id, miloLater.Id], all.Items.Select(item => item.Id).ToArray());
        Assert.Equal("overdue", all.Items.First().DerivedStatus);

        var milo = Assert.Single(summary.Scopes, scope => scope.PetId == MiloId);
        Assert.Equal((2, 1, 0), (milo.PendingCount, milo.DueWithinHorizonCount, milo.OverdueCount));
        var oyen = Assert.Single(summary.Scopes, scope => scope.PetId == OyenId);
        Assert.Equal([oyenOverdue.Id], oyen.Items.Select(item => item.Id).ToArray());
        Assert.DoesNotContain(summary.Scopes, scope => scope.PetId == OtherPetId);
        Assert.Equal(3, summary.Scopes.Count);
    }

    [Fact]
    public async Task Summary_KeepsTheMostRecentlyMissedItemBesideTheNearestComingOnes()
    {
        using var harness = await Harness.CreateAsync();
        harness.AddRecord(MiloId, CareRecordType.Other, Today.AddYears(-3), Today.AddYears(-2), "Ancient");
        var recentMiss = harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-30), Today.AddDays(-2), "Recent miss");
        var next = harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-30), Today.AddDays(1), "Next");
        var after = harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-30), Today.AddDays(2), "After");
        harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-30), Today.AddDays(3), "Later");
        await harness.SaveAsync();

        var all = (await harness.Service.GetUpcomingSummaryAsync(OwnerId)).Scopes.Single(scope => scope.PetId is null);

        Assert.Equal([recentMiss.Id, next.Id, after.Id], all.Items.Select(item => item.Id).ToArray());
        Assert.Equal(5, all.PendingCount);
    }

    [Fact]
    public async Task Summary_DistinguishesNoCareFromNothingPending()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5), createdAt: Now.AddDays(-30));
        var done = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: null, createdAt: Now);
        done.FulfillsCareRecordId = target.Id;
        await harness.SaveAsync();

        var summary = await harness.Service.GetUpcomingSummaryAsync(OwnerId);

        Assert.True(summary.Complete);
        var milo = summary.Scopes.Single(scope => scope.PetId == MiloId);
        Assert.Equal((true, 0), (milo.HasCareRecords, milo.PendingCount));
        var oyen = summary.Scopes.Single(scope => scope.PetId == OyenId);
        Assert.Equal((false, 0), (oyen.HasCareRecords, oyen.PendingCount));
        Assert.Empty(oyen.Items);
    }

    [Fact]
    public async Task Summary_CountsEveryPendingItemBehindLongHistory()
    {
        using var harness = await Harness.CreateAsync();
        for (var index = 0; index < 150; index++)
        {
            harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-index % 40), dueDate: null);
        }
        var overdue = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddYears(-2), Today.AddDays(-1), "Overdue booster");
        await harness.SaveAsync();

        var all = (await harness.Service.GetUpcomingSummaryAsync(OwnerId)).Scopes.Single(scope => scope.PetId is null);

        Assert.Equal((1, 1, 1), (all.PendingCount, all.DueWithinHorizonCount, all.OverdueCount));
        Assert.Equal(overdue.Id, Assert.Single(all.Items).Id);
    }

    [Fact]
    public async Task Summary_StaysCompleteWellBeyondFivePagesOfPendingCare()
    {
        using var harness = await Harness.CreateAsync();
        for (var index = 0; index < 600; index++)
        {
            harness.AddRecord(index % 2 == 0 ? MiloId : OyenId, CareRecordType.Other, Today.AddDays(-1), Today.AddDays(index % 60));
        }
        await harness.SaveAsync();

        var summary = await harness.Service.GetUpcomingSummaryAsync(OwnerId);

        Assert.True(summary.Complete);
        var all = summary.Scopes.Single(scope => scope.PetId is null);
        Assert.Equal(600, all.PendingCount);
        Assert.Equal(3, all.Items.Count);
        Assert.Equal(300, summary.Scopes.Single(scope => scope.PetId == MiloId).PendingCount);
    }

    [Fact]
    public async Task Summary_BeyondTheRowLimit_KeepsExactCountsButIsNotComplete()
    {
        using var harness = await Harness.CreateAsync();
        for (var index = 0; index < CareRecordService.SummaryRowLimit + 5; index++)
        {
            harness.AddRecord(MiloId, CareRecordType.Other, Today.AddDays(-1), Today.AddDays(1 + index % 200));
        }
        await harness.SaveAsync();

        var summary = await harness.Service.GetUpcomingSummaryAsync(OwnerId);

        Assert.False(summary.Complete);
        Assert.Equal(CareRecordService.SummaryRowLimit + 5, summary.Scopes.Single(scope => scope.PetId is null).PendingCount);
    }

    [Fact]
    public async Task Summary_ExcludesInactivePetsArchivedDeletedAndOtherOwners()
    {
        using var harness = await Harness.CreateAsync();
        var oyen = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
        oyen.LifecycleStatus = PetLifecycleStatus.Memorial;
        harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1));
        harness.AddRecord(OtherPetId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(1));
        var archived = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(2));
        archived.ArchivedAt = Now;
        var deleted = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-1), Today.AddDays(3));
        deleted.DeletedAt = Now;
        await harness.SaveAsync();

        var summary = await harness.Service.GetUpcomingSummaryAsync(OwnerId);

        // Milo is the only active pet; its only records are archived or deleted.
        Assert.Equal([null, MiloId], summary.Scopes.Select(scope => scope.PetId).ToArray());
        Assert.All(summary.Scopes, scope =>
            Assert.Equal((false, 0, 0), (scope.HasCareRecords, scope.PendingCount, scope.Items.Count)));
    }

    [Theory]
    // Monday 19 Oct, 23:59:59 in Malaysia: due on 18 Nov is the last day in range.
    [InlineData("2026-10-19T15:59:59Z", 2, 0)]
    // Tuesday 20 Oct, 00:00 in Malaysia: 19 Oct is now overdue; 19 Nov joins the range.
    [InlineData("2026-10-19T16:00:00Z", 3, 1)]
    public async Task Summary_CountsUseTheMalaysiaCalendarDay(string utcNow, int dueWithin, int overdue)
    {
        using var harness = await Harness.CreateAsync(DateTimeOffset.Parse(utcNow));
        harness.AddRecord(MiloId, CareRecordType.Other, new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 19));
        harness.AddRecord(MiloId, CareRecordType.Other, new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 18));
        harness.AddRecord(MiloId, CareRecordType.Other, new DateOnly(2026, 10, 1), new DateOnly(2026, 11, 19));
        await harness.SaveAsync();

        var all = (await harness.Service.GetUpcomingSummaryAsync(OwnerId)).Scopes.Single(scope => scope.PetId is null);

        Assert.Equal((3, dueWithin, overdue), (all.PendingCount, all.DueWithinHorizonCount, all.OverdueCount));
    }

    // ---- Completion status --------------------------------------------------

    [Fact]
    public async Task CompletionStatus_IsPendingUntilAnActiveRecordFulfilsTheTarget()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(-1), "Rabies booster", Now.AddDays(-30));
        await harness.SaveAsync();

        var pending = await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id);
        Assert.Equal("pending", pending.State);
        Assert.Null(pending.Completion);
        Assert.Equal("Milo", pending.PetName);
        Assert.Equal(target.Id, pending.Target.Id);

        var fulfiller = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: Today.AddYears(1), "Rabies booster", Now);
        fulfiller.FulfillsCareRecordId = target.Id;
        fulfiller.Notes = "Booster went well";
        await harness.SaveAsync();

        var completed = await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id);
        Assert.Equal("completed", completed.State);
        Assert.NotNull(completed.Completion);
        Assert.Equal(fulfiller.Id, completed.Completion!.Id);
        Assert.Equal(target.Id, completed.Completion.FulfillsCareRecordId);
        Assert.Equal(Today, completed.Completion.Date);
        Assert.Equal("Booster went well", completed.Completion.Notes);
    }

    [Fact]
    public async Task CompletionStatus_IgnoresArchivedAndDeletedFulfillers()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5), createdAt: Now.AddDays(-30));
        var archivedFulfiller = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: null, createdAt: Now);
        archivedFulfiller.FulfillsCareRecordId = target.Id;
        archivedFulfiller.ArchivedAt = Now;
        await harness.SaveAsync();

        Assert.Equal("pending", (await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id)).State);

        archivedFulfiller.ArchivedAt = null;
        archivedFulfiller.DeletedAt = Now;
        await harness.SaveAsync();

        Assert.Equal("pending", (await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id)).State);
    }

    [Fact]
    public async Task CompletionStatus_TellsADeletedRescheduledOrArchivedPetTargetApartFromCompletion()
    {
        using var harness = await Harness.CreateAsync();
        var archived = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5));
        archived.ArchivedAt = Now;
        var undated = harness.AddRecord(MiloId, CareRecordType.Grooming, Today.AddDays(-30), dueDate: null);
        var onArchivedPet = harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5));
        var oyen = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
        oyen.LifecycleStatus = PetLifecycleStatus.Archived;
        oyen.ArchivedAt = Now;
        await harness.SaveAsync();

        Assert.Equal("archived", (await harness.Service.GetCompletionStatusAsync(OwnerId, archived.Id)).State);
        Assert.Equal("no-due-date", (await harness.Service.GetCompletionStatusAsync(OwnerId, undated.Id)).State);
        var petArchived = await harness.Service.GetCompletionStatusAsync(OwnerId, onArchivedPet.Id);
        Assert.Equal("pet-archived", petArchived.State);
        Assert.Null(petArchived.Completion);
    }

    [Fact]
    public async Task CompletionStatus_ReportsAChangedTargetBeforeACompletionThatLandedOnIt()
    {
        using var harness = await Harness.CreateAsync();
        var archived = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(-1), "Rabies booster");
        archived.ArchivedAt = Now;
        var onArchivedPet = harness.AddRecord(OyenId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(-1), "FVRCP");
        await harness.SaveAsync();
        // Completions written by a save validated before the target changed.
        var lateOnArchived = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: null, "Rabies booster");
        lateOnArchived.FulfillsCareRecordId = archived.Id;
        var lateOnPet = harness.AddRecord(OyenId, CareRecordType.Vaccine, Today, dueDate: null, "FVRCP");
        lateOnPet.FulfillsCareRecordId = onArchivedPet.Id;
        var oyen = await harness.Db.Pets.SingleAsync(pet => pet.Id == OyenId);
        oyen.LifecycleStatus = PetLifecycleStatus.Archived;
        oyen.ArchivedAt = Now;
        await harness.SaveAsync();

        var archivedStatus = await harness.Service.GetCompletionStatusAsync(OwnerId, archived.Id);
        Assert.Equal("archived", archivedStatus.State);
        Assert.Equal(lateOnArchived.Id, archivedStatus.Completion?.Id);

        var petStatus = await harness.Service.GetCompletionStatusAsync(OwnerId, onArchivedPet.Id);
        Assert.Equal("pet-archived", petStatus.State);
        Assert.Equal(lateOnPet.Id, petStatus.Completion?.Id);
    }

    [Fact]
    public async Task CompletionStatus_ReportsARemovedDueDateBeforeACompletionThatLandedOnIt()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(-1), "Rabies booster");
        await harness.SaveAsync();
        // A save validated while the item was dated lands after the date was removed.
        var late = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today, dueDate: null, "Rabies booster");
        late.FulfillsCareRecordId = target.Id;
        target.DueDate = null;
        await harness.SaveAsync();

        var status = await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id);

        Assert.Equal("no-due-date", status.State);
        Assert.Equal(late.Id, status.Completion?.Id);
    }

    [Fact]
    public async Task CompletionStatus_NeverReportsAnotherPetsOrOwnersRecordAsTheCompletion()
    {
        using var harness = await Harness.CreateAsync();
        var target = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(-1), "Rabies booster");
        await harness.SaveAsync();
        // Inconsistent links that supported writes refuse, planted directly.
        var otherPet = harness.AddRecord(OyenId, CareRecordType.Vaccine, Today, dueDate: null, "Rabies booster");
        otherPet.FulfillsCareRecordId = target.Id;
        var otherOwner = harness.AddRecord(OtherPetId, CareRecordType.Vaccine, Today, dueDate: null, "Private notes");
        otherOwner.FulfillsCareRecordId = target.Id;
        await harness.SaveAsync();

        var status = await harness.Service.GetCompletionStatusAsync(OwnerId, target.Id);

        Assert.Equal("pending", status.State);
        Assert.Null(status.Completion);
    }

    [Fact]
    public async Task CompletionStatus_IsPrivateToTheOwner()
    {
        using var harness = await Harness.CreateAsync();
        var strangers = harness.AddRecord(OtherPetId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5));
        var deleted = harness.AddRecord(MiloId, CareRecordType.Vaccine, Today.AddDays(-30), Today.AddDays(5));
        deleted.DeletedAt = Now;
        await harness.SaveAsync();

        var foreign = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetCompletionStatusAsync(OwnerId, strangers.Id));
        Assert.Equal(StatusCodes.Status404NotFound, foreign.StatusCode);
        var gone = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetCompletionStatusAsync(OwnerId, deleted.Id));
        Assert.Equal(StatusCodes.Status404NotFound, gone.StatusCode);
    }

    private sealed class Harness : IDisposable
    {
        private readonly Dictionary<CareRecord, DateTimeOffset> _createdAt = new(ReferenceEqualityComparer.Instance);
        private DateTimeOffset _nextCreatedAt = Now.AddDays(-400);

        private Harness(MyPetLinkDbContext db, TimeProvider timeProvider)
        {
            Db = db;
            Service = new CareRecordService(db, timeProvider);
        }

        public MyPetLinkDbContext Db { get; }

        public CareRecordService Service { get; }

        public static async Task<Harness> CreateAsync(DateTimeOffset? utcNow = null)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            db.Users.Add(NewUser(OwnerId, "owner@example.com"));
            db.Users.Add(NewUser(OtherOwnerId, "other@example.com"));
            db.Pets.Add(NewPet(MiloId, OwnerId, "Milo", "Dog"));
            db.Pets.Add(NewPet(OyenId, OwnerId, "Oyen", "Cat"));
            db.Pets.Add(NewPet(OtherPetId, OtherOwnerId, "Rex", "Dog"));
            await db.SaveChangesAsync();

            return new Harness(db, new FixedTimeProvider(utcNow ?? Now));
        }

        public CareRecord AddRecord(
            Guid petId,
            CareRecordType type,
            DateOnly recordDate,
            DateOnly? dueDate,
            string? title = null,
            DateTimeOffset? createdAt = null)
        {
            // Strictly increasing creation times keep tie-breaks deterministic
            // unless a test pins one.
            _nextCreatedAt = _nextCreatedAt.AddSeconds(1);
            var record = new CareRecord
            {
                PetId = petId,
                Type = type,
                Title = title ?? $"{type} record",
                RecordDate = recordDate,
                DueDate = dueDate,
                Notes = "Private note",
                Provider = "Klinik Haiwan",
                PublicVisibility = CareRecordPublicVisibility.Private
            };
            Db.CareRecords.Add(record);
            _createdAt[record] = createdAt ?? _nextCreatedAt;
            return record;
        }

        /// <summary>
        /// Saves, then applies each new record's intended creation time. The
        /// context stamps CreatedAt on insert, so it can only be pinned by a
        /// second save, which touches UpdatedAt and nothing else.
        /// </summary>
        public async Task SaveAsync()
        {
            await Db.SaveChangesAsync();
            foreach (var (record, createdAt) in _createdAt)
            {
                record.CreatedAt = createdAt;
            }

            _createdAt.Clear();
            await Db.SaveChangesAsync();
        }

        public void Dispose()
        {
            Db.Dispose();
        }

        private static User NewUser(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Owner",
            Status = UserStatus.Active
        };

        private static Pet NewPet(Guid id, Guid ownerId, string name, string species) => new()
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
            Name = name,
            Species = species
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
