using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record OwnerReferralAttributionResponse(
    Guid UserId,
    string OwnerName,
    string OwnerEmail,
    Guid SalespersonId,
    string SalespersonCode,
    string SalespersonName,
    string ReferralCode,
    ReferralAttributionSource AttributionSource,
    DateTimeOffset CapturedAt,
    DateTimeOffset AttributedAt,
    DateTimeOffset UpdatedAt,
    string ConcurrencyToken);

public sealed record CorrectOwnerReferralAttributionRequest(
    [Required] Guid SalespersonId,
    [Required] string ConcurrencyToken);
