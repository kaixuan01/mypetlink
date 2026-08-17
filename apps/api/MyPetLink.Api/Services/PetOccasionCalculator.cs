namespace MyPetLink.Api.Services;

public sealed record PublicProfileCardOccasions(
    DateOnly MalaysiaToday,
    int? BirthdayAge,
    int? AdoptionYears)
{
    public string CacheIdentity => MalaysiaToday.ToString("yyyyMMdd");

    public int? CountFor(PublicProfileSocialCardVariant variant) => variant switch
    {
        PublicProfileSocialCardVariant.Birthday => BirthdayAge,
        PublicProfileSocialCardVariant.Adoption => AdoptionYears,
        _ => null
    };
}

public static class PetOccasionCalculator
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    public static DateOnly MalaysiaToday(DateTimeOffset utcNow) =>
        DateOnly.FromDateTime(utcNow.ToOffset(MalaysiaOffset).DateTime);

    public static PublicProfileCardOccasions Calculate(
        DateOnly? birthday,
        DateOnly? adoptionDay,
        DateOnly malaysiaToday)
    {
        return new PublicProfileCardOccasions(
            malaysiaToday,
            AnniversaryCount(birthday, malaysiaToday),
            AnniversaryCount(adoptionDay, malaysiaToday));
    }

    private static int? AnniversaryCount(DateOnly? date, DateOnly today)
    {
        if (!date.HasValue
            || date.Value > today
            || date.Value.Month != today.Month
            || date.Value.Day != today.Day)
        {
            return null;
        }

        return today.Year - date.Value.Year;
    }
}
