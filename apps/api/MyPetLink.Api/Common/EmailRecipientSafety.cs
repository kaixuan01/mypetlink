using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.Common;

/// <summary>
/// Shared validation for configured or persisted email recipients. Header
/// breaks are rejected explicitly even when the address parser would accept
/// the remaining value.
/// </summary>
public static class EmailRecipientSafety
{
    public static bool IsValid(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && !value.Contains('\r')
        && !value.Contains('\n')
        && new EmailAddressAttribute().IsValid(value);
}
