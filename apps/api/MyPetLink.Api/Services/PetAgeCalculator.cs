using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Services;

public static class PetAgeCalculator
{
    public const int MinimumSupportedYear = 1900;

    public static PetAgeInfoResponse Calculate(
        DateOnly? birthday,
        short? estimatedBirthYear,
        DateOnly? referenceDate = null)
    {
        var today = referenceDate ?? DateOnly.FromDateTime(DateTime.UtcNow);

        if (birthday.HasValue
            && birthday.Value <= today
            && birthday.Value.Year >= MinimumSupportedYear)
        {
            var age = today.Year - birthday.Value.Year;
            if (today.Month < birthday.Value.Month
                || (today.Month == birthday.Value.Month && today.Day < birthday.Value.Day))
            {
                age--;
            }

            return new PetAgeInfoResponse(
                PetAgeSource.ExactBirthday,
                Math.Max(0, age),
                BuildExactLabel(age));
        }

        if (estimatedBirthYear.HasValue
            && estimatedBirthYear.Value >= MinimumSupportedYear
            && estimatedBirthYear.Value <= today.Year)
        {
            var age = today.Year - estimatedBirthYear.Value;
            return new PetAgeInfoResponse(
                PetAgeSource.EstimatedBirthYear,
                age,
                age < 1 ? "Under 1 year old" : $"About {FormatYears(age)}");
        }

        return new PetAgeInfoResponse(PetAgeSource.Unknown, null, "Age unknown");
    }

    private static string BuildExactLabel(int age)
    {
        return age < 1 ? "Under 1 year old" : FormatYears(age);
    }

    private static string FormatYears(int age)
    {
        return age == 1 ? "1 year old" : $"{age} years old";
    }
}
