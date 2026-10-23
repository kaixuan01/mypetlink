using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// One pet's Weekly Recap, for its owner: who may ask, which week, and the
/// Moments and care that belong to it.
///
/// A week is Monday to Sunday on Malaysia's calendar, chosen here and never
/// by the browser. With no week asked for, the recap is the last complete
/// week — except for a pet added this week, whose only week so far is this
/// one. The Moments and care halves each apply their own service's rules;
/// this service decides only access and dates. Nothing is stored: a recap is
/// recomputed from the records on every request, so editing or archiving a
/// Moment changes the week it belonged to.
/// </summary>
public sealed class PetWeeklyRecapService : IPetWeeklyRecapService
{
    /// <summary>How many complete weeks before the current one can be opened.</summary>
    public const int WeeksOfHistory = 12;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IMemoryService _memoryService;
    private readonly ICareRecordService _careRecordService;
    private readonly TimeProvider _timeProvider;

    public PetWeeklyRecapService(
        MyPetLinkDbContext dbContext,
        IMemoryService memoryService,
        ICareRecordService careRecordService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _memoryService = memoryService;
        _careRecordService = careRecordService;
        _timeProvider = timeProvider;
    }

    public async Task<WeeklyRecapResponse> GetAsync(
        Guid? currentUserId,
        Guid petId,
        DateOnly? weekStart,
        CancellationToken cancellationToken = default)
    {
        var userId = currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

        var pet = await _dbContext.Pets
            .AsNoTracking()
            .Where(item => item.Id == petId && item.OwnerUserId == userId && item.DeletedAt == null)
            .Select(item => new { item.Id, item.Name, item.LifecycleStatus, item.ArchivedAt, item.CreatedAt })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new ApiException(StatusCodes.Status404NotFound, "not_found", "Pet was not found.");

        if (pet.LifecycleStatus != PetLifecycleStatus.Active || pet.ArchivedAt != null)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "weekly_recap_unavailable",
                "Weekly recaps are available for active pets only.");
        }

        var today = MalaysiaCalendar.Today(_timeProvider);
        var latestWeekStart = MalaysiaCalendar.WeekStart(today);
        var earliestWeekStart = latestWeekStart.AddDays(-7 * WeeksOfHistory);
        var start = weekStart ?? DefaultWeekStart(pet.CreatedAt, latestWeekStart);
        ValidateWeekStart(start, earliestWeekStart, latestWeekStart);
        var end = start.AddDays(6);

        // One after the other: both halves share this request's context.
        var moments = await _memoryService.GetWeeklyRecapMomentsAsync(
            userId, pet.Id, start, end, today, cancellationToken);
        var care = await _careRecordService.GetWeeklyRecapCareAsync(
            userId, pet.Id, start, end, today, cancellationToken);

        return new WeeklyRecapResponse(
            pet.Id,
            pet.Name,
            start,
            end,
            today,
            start == latestWeekStart,
            earliestWeekStart,
            latestWeekStart,
            moments,
            care);
    }

    public static DateOnly DefaultWeekStart(DateTimeOffset petCreatedAt, DateOnly latestWeekStart)
    {
        var createdOn = DateOnly.FromDateTime(petCreatedAt.ToOffset(MalaysiaCalendar.UtcOffset).DateTime);
        return createdOn >= latestWeekStart ? latestWeekStart : latestWeekStart.AddDays(-7);
    }

    private static void ValidateWeekStart(DateOnly start, DateOnly earliest, DateOnly latest)
    {
        string? error = null;
        if (start.DayOfWeek != DayOfWeek.Monday)
        {
            error = "A week starts on a Monday.";
        }
        else if (start > latest)
        {
            error = "That week has not started yet.";
        }
        else if (start < earliest)
        {
            error = $"Weekly recaps go back {WeeksOfHistory} weeks.";
        }

        if (error is not null)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]> { ["weekStart"] = [error] });
        }
    }
}
