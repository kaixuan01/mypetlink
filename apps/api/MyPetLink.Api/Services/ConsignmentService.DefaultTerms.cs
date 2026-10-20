using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Default agreement terms: the starting point a new draft's form is filled from. Saving a draft
// copies the values into the agreement, so a later change here never reaches an existing
// agreement, an issued PDF or a signed copy. Every save is a new revision, kept for audit.
public sealed partial class ConsignmentService
{
    public async Task<ConsignmentDefaultTermsResponse> DefaultTermsAsync(CancellationToken ct)
    {
        var t = await db.ConsignmentDefaultTerms.AsNoTracking().SingleOrDefaultAsync(ct)
            ?? throw new ApiException(500, "consignment_default_terms_missing", "Default agreement terms are not set up yet.");
        var updatedBy = t.UpdatedByAdminUserId is null ? null
            : await db.AdminUsers.Where(a => a.Id == t.UpdatedByAdminUserId).Select(a => a.User.DisplayName).FirstOrDefaultAsync(ct);
        var history = await db.ConsignmentDefaultTermsRevisions.AsNoTracking().OrderByDescending(r => r.Revision).Take(20)
            .Select(r => new { r, Name = db.AdminUsers.Where(a => a.Id == r.RecordedByAdminUserId).Select(a => a.User.DisplayName).FirstOrDefault() })
            .ToListAsync(ct);
        return new(t.Revision, t.IsActive, Values(t), MissingDefaults(Values(t)), t.UpdatedAt, updatedBy, Convert.ToBase64String(t.RowVersion),
            history.Select(h => new ConsignmentDefaultTermsRevisionResponse(h.r.Revision, h.r.IsActive, Values(h.r), h.r.RecordedAt, h.Name)).ToArray());
    }

    public async Task<ConsignmentDefaultTermsResponse> SaveDefaultTermsAsync(Guid? actor, SaveConsignmentDefaultTermsRequest r, CancellationToken ct)
    {
        var v = r.Terms ?? throw Bad("Enter the default terms.");
        v = v with { DurationTerms = Trim(v.DurationTerms), SettlementFrequency = Trim(v.SettlementFrequency), DiscountTerms = Trim(v.DiscountTerms),
            ReturnTerms = Trim(v.ReturnTerms), LossTerms = Trim(v.LossTerms) };
        if (v.PartnerCommissionPercentage is < 0 or > 100 || v.PartnerCommissionPercentage is { } rate && decimal.Round(rate, 2) != rate
            || v.TrialDurationDays is < 1 or > 3650 || v.PaymentDeadlineDays is < 0 or > 365
            || new[] { v.DurationTerms, v.SettlementFrequency, v.DiscountTerms, v.ReturnTerms, v.LossTerms }.Any(s => s?.Length > 2000))
            throw Bad("Check the commission (0–100%, two decimal places), trial length (1–3,650 days), payment deadline (0–365 days) and clause lengths.");
        var missing = MissingDefaults(v);
        if (r.IsActive && missing.Count > 0)
            throw Bad($"Complete every default before using them for new agreements: {string.Join(", ", missing)}.");
        await RunAsync(actor, async admin => {
            var t = await db.ConsignmentDefaultTerms.SingleOrDefaultAsync(ct)
                ?? throw new ApiException(500, "consignment_default_terms_missing", "Default agreement terms are not set up yet.");
            Token(t.RowVersion, r.ConcurrencyToken);
            var before = new { t.Revision, t.IsActive, terms = Values(t) };
            if (t.IsActive == r.IsActive && Values(t) == v) return;
            t.PartnerCommissionPercentage = v.PartnerCommissionPercentage; t.TrialDurationDays = v.TrialDurationDays;
            t.DurationTerms = v.DurationTerms; t.SettlementFrequency = v.SettlementFrequency; t.PaymentDeadlineDays = v.PaymentDeadlineDays;
            t.DiscountTerms = v.DiscountTerms; t.ReturnTerms = v.ReturnTerms; t.LossTerms = v.LossTerms;
            t.IsActive = r.IsActive; t.Revision++; t.UpdatedAt = time.GetUtcNow(); t.UpdatedByAdminUserId = admin;
            db.ConsignmentDefaultTermsRevisions.Add(new ConsignmentDefaultTermsRevision {
                Revision = t.Revision, IsActive = t.IsActive, PartnerCommissionPercentage = t.PartnerCommissionPercentage,
                TrialDurationDays = t.TrialDurationDays, DurationTerms = t.DurationTerms, SettlementFrequency = t.SettlementFrequency,
                PaymentDeadlineDays = t.PaymentDeadlineDays, DiscountTerms = t.DiscountTerms, ReturnTerms = t.ReturnTerms,
                LossTerms = t.LossTerms, RecordedAt = t.UpdatedAt.Value, RecordedByAdminUserId = admin });
            audit.Append(admin, ActorType.Admin, "consignment.default-terms-changed", "ConsignmentDefaultTerms", null, before,
                new { t.Revision, t.IsActive, terms = v });
        }, ct);
        return await DefaultTermsAsync(ct);
    }

    private static IReadOnlyList<string> MissingDefaults(ConsignmentDefaultTermsValues v)
    {
        var missing = new List<string>();
        if (v.PartnerCommissionPercentage is null) missing.Add("Partner commission");
        if (v.TrialDurationDays is null) missing.Add("Trial duration");
        if (string.IsNullOrWhiteSpace(v.DurationTerms)) missing.Add("Duration and renewal");
        if (string.IsNullOrWhiteSpace(v.SettlementFrequency)) missing.Add("Settlement frequency");
        if (v.PaymentDeadlineDays is null) missing.Add("Payment deadline");
        if (string.IsNullOrWhiteSpace(v.DiscountTerms)) missing.Add("Discount permissions");
        if (string.IsNullOrWhiteSpace(v.ReturnTerms)) missing.Add("Return terms");
        if (string.IsNullOrWhiteSpace(v.LossTerms)) missing.Add("Loss and damage");
        return missing;
    }

    private static ConsignmentDefaultTermsValues Values(ConsignmentDefaultTerms t) => new(t.PartnerCommissionPercentage, t.TrialDurationDays,
        t.DurationTerms, t.SettlementFrequency, t.PaymentDeadlineDays, t.DiscountTerms, t.ReturnTerms, t.LossTerms);
    private static ConsignmentDefaultTermsValues Values(ConsignmentDefaultTermsRevision t) => new(t.PartnerCommissionPercentage, t.TrialDurationDays,
        t.DurationTerms, t.SettlementFrequency, t.PaymentDeadlineDays, t.DiscountTerms, t.ReturnTerms, t.LossTerms);
}
