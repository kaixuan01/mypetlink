namespace MyPetLink.Api.Common;

/// <summary>
/// Malaysia's calendar for owner-facing weeks: Monday to Sunday at UTC+8.
///
/// Malaysia has no daylight saving, so a fixed offset is exact. Used by the
/// Weekly Pet Recap; other services keep their own established helpers.
/// </summary>
public static class MalaysiaCalendar
{
    public static readonly TimeSpan UtcOffset = TimeSpan.FromHours(8);

    public static DateOnly Today(TimeProvider timeProvider) =>
        DateOnly.FromDateTime(timeProvider.GetUtcNow().ToOffset(UtcOffset).DateTime);

    /// <summary>The Monday that starts the week containing <paramref name="day"/>.</summary>
    public static DateOnly WeekStart(DateOnly day) =>
        day.AddDays(-(((int)day.DayOfWeek + 6) % 7));

    /// <summary>The instant a Malaysia calendar day begins, in UTC.</summary>
    public static DateTimeOffset StartOfDayUtc(DateOnly day) =>
        new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), UtcOffset).ToUniversalTime();
}
