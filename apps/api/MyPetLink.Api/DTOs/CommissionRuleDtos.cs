using System.ComponentModel.DataAnnotations;

namespace MyPetLink.Api.DTOs;

public sealed record UpsertCommissionRuleRequest(
    [Required] string CommissionType,
    Guid? SalespersonId,
    decimal? Percentage,
    decimal? FixedAmount,
    int? MinQuantity,
    int? MaxQuantity,
    int? EligibilityMonths,
    [Required, MaxLength(3)] string Currency,
    DateTimeOffset EffectiveFrom,
    DateTimeOffset? EffectiveTo,
    bool IsActive,
    [MaxLength(2000)] string? Notes,
    string? ConcurrencyToken = null);

public sealed record CommissionRuleResponse(
    Guid Id,
    string CommissionType,
    Guid? SalespersonId,
    string? SalespersonCode,
    string? SalespersonName,
    decimal? Percentage,
    decimal? FixedAmount,
    int? MinQuantity,
    int? MaxQuantity,
    int? EligibilityMonths,
    string Currency,
    DateTimeOffset EffectiveFrom,
    DateTimeOffset? EffectiveTo,
    bool IsActive,
    string? Notes,
    Guid? UpdatedByAdminUserId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);
