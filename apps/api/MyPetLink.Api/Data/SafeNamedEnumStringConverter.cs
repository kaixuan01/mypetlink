using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Data;

public sealed class SafeNamedEnumStringConverter<TEnum> : ValueConverter<TEnum, string>
    where TEnum : struct, Enum
{
    public SafeNamedEnumStringConverter(TEnum unknown)
        : base(
            value => value.ToString(),
            value => NamedEnumValues.ParseOrUnknown(value, unknown))
    {
    }
}
