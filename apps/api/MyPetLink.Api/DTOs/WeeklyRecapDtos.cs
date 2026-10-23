using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

/// <summary>
/// One pet's week, for its owner only: the Moments about that week, the care
/// logged in it, the due dates it left behind, and what is coming up today.
///
/// Computed on every request from the records themselves; nothing is stored.
/// Notes, providers, documents, captions and every owner identity are absent
/// on purpose — this payload carries the pet's name and nothing about people.
/// </summary>
/// <param name="WeekStart">The week's Monday, Malaysia time.</param>
/// <param name="WeekEnd">The week's Sunday.</param>
/// <param name="AsOfDate">Malaysia's today, which every status was derived for.</param>
/// <param name="IsCurrentWeek">The week is still running; its contents are "so far".</param>
/// <param name="EarliestWeekStart">The oldest week a recap can be asked for.</param>
/// <param name="LatestWeekStart">The current week's Monday.</param>
public sealed record WeeklyRecapResponse(
    Guid PetId,
    string PetName,
    DateOnly WeekStart,
    DateOnly WeekEnd,
    DateOnly AsOfDate,
    bool IsCurrentWeek,
    DateOnly EarliestWeekStart,
    DateOnly LatestWeekStart,
    WeeklyRecapMomentsResponse Moments,
    WeeklyRecapCareResponse Care);

/// <param name="Total">Every Moment about this week. Exact, whatever <see cref="Items"/> holds.</param>
/// <param name="SharedPubliclyCount">Of those, the ones shared publicly.</param>
/// <param name="OnlyMeCount">Of those, the ones kept to the owner.</param>
/// <param name="Items">The newest of them, at most the read limit.</param>
public sealed record WeeklyRecapMomentsResponse(
    int Total,
    int SharedPubliclyCount,
    int OnlyMeCount,
    IReadOnlyCollection<WeeklyRecapMomentResponse> Items);

/// <param name="Date">The day the Moment is about; for an undated older Moment, the day it was written.</param>
/// <param name="IsPrimary">The recap's pet is the Moment's main pet, not an extra one in it.</param>
/// <param name="PrimaryPetName">The Moment's main pet, for "With Mochi" on an extra pet's recap.</param>
/// <param name="Visibility"><c>Public</c> or <c>Private</c>.</param>
/// <param name="HiddenByMyPetLink">Hidden by a moderator; still the owner's to see.</param>
/// <param name="MediaCount">Photos and videos attached.</param>
public sealed record WeeklyRecapMomentResponse(
    Guid Id,
    Guid PrimaryPetId,
    string PrimaryPetName,
    bool IsPrimary,
    string Title,
    DateOnly Date,
    string? Type,
    MemoryVisibility Visibility,
    bool HiddenByMyPetLink,
    WeeklyRecapMediaPreviewResponse? Preview,
    int MediaCount);

/// <param name="Type"><c>image</c> or <c>video</c>.</param>
/// <param name="Url">A small image where one exists; a video's own file.</param>
public sealed record WeeklyRecapMediaPreviewResponse(
    Guid Id,
    string Type,
    string Url);

/// <param name="HasCareRecords">The pet has at least one active care record of any date.</param>
/// <param name="Logged">Care records dated in the week.</param>
/// <param name="StillDue">Pending items due in the week, before today, never logged as done.</param>
/// <param name="OverdueTotal">Every pending item due before today, this week's and earlier ones.</param>
/// <param name="ComingUp">Pending items due today or later, as of <c>AsOfDate</c>.</param>
public sealed record WeeklyRecapCareResponse(
    bool HasCareRecords,
    WeeklyRecapCareListResponse<WeeklyRecapLoggedCareResponse> Logged,
    WeeklyRecapCareListResponse<WeeklyRecapDueCareResponse> StillDue,
    int OverdueTotal,
    WeeklyRecapCareListResponse<WeeklyRecapDueCareResponse> ComingUp);

/// <param name="Total">Exact, whatever <see cref="Items"/> holds.</param>
public sealed record WeeklyRecapCareListResponse<T>(
    int Total,
    IReadOnlyCollection<T> Items);

/// <param name="LoggedAsDone">This record completed an earlier due item.</param>
public sealed record WeeklyRecapLoggedCareResponse(
    Guid Id,
    CareRecordType Type,
    string Title,
    string? CareName,
    DateOnly RecordDate,
    bool LoggedAsDone);

/// <param name="Status">
/// <c>overdue</c> (due before today), <c>due-today</c>, <c>due-soon</c> (within
/// 30 days) or <c>upcoming</c>. Each item has exactly one.
/// </param>
public sealed record WeeklyRecapDueCareResponse(
    Guid Id,
    CareRecordType Type,
    string Title,
    string? CareName,
    DateOnly DueDate,
    string Status);
