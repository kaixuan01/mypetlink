using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Automatic agreement references: {PREFIX}-CONS-{yyyy}-{nnn}. The number is taken inside the
// draft's own transaction, so a failed save releases it and a committed one can never be
// handed out again — whatever later happens to that agreement.
public sealed partial class ConsignmentService
{
    private static readonly TimeSpan MalaysiaTime = TimeSpan.FromHours(8);

    public async Task<ConsignmentAgreementPrefixResponse> AgreementPrefixAsync(Guid merchantId, CancellationToken ct)
    {
        var m = await db.Merchants.AsNoTracking().SingleOrDefaultAsync(x => x.Id == merchantId, ct)
            ?? throw new ApiException(404, "merchant_not_found", "This merchant could not be found.");
        var row = await db.ConsignmentPartnerPrefixes.AsNoTracking().SingleOrDefaultAsync(x => x.MerchantId == merchantId, ct);
        var prefix = row?.Prefix ?? await SuggestedPrefixAsync(m, ct);
        var year = time.GetUtcNow().ToOffset(MalaysiaTime).Year;
        return new(m.Id, row?.Prefix, prefix, row?.LockedAt is not null, row?.LockedAt, $"{prefix}-CONS-{year}-",
            row is null ? "" : Convert.ToBase64String(row.RowVersion));
    }

    /// <summary>Sets the prefix a merchant's next agreement will use. Refused once a reference has used it.</summary>
    public async Task<ConsignmentAgreementPrefixResponse> SaveAgreementPrefixAsync(Guid? actor, Guid merchantId,
        SaveConsignmentAgreementPrefixRequest r, CancellationToken ct)
    {
        var prefix = ConsignmentPrefixRules.Normalize(r.Prefix);
        if (prefix != r.Prefix?.Trim().ToUpperInvariant() || !ConsignmentPrefixRules.IsValid(prefix))
            throw Bad($"Use {ConsignmentPrefixRules.MinLength}–{ConsignmentPrefixRules.MaxLength} letters and numbers, starting with a letter.");
        await RunAsync(actor, async admin => {
            if (!await db.Merchants.AnyAsync(x => x.Id == merchantId, ct))
                throw new ApiException(404, "merchant_not_found", "This merchant could not be found.");
            var row = await db.ConsignmentPartnerPrefixes.SingleOrDefaultAsync(x => x.MerchantId == merchantId, ct);
            // No row yet means nobody has chosen one: the empty token says the operator saw that.
            if (row is null) { if (!string.IsNullOrEmpty(r.ConcurrencyToken)) throw Conflict("This record changed. Reload before trying again."); }
            else Token(row.RowVersion, r.ConcurrencyToken);
            if (row?.LockedAt is not null)
                throw Conflict($"{row.Prefix} is already used in agreement references, so it can't change.");
            if (row?.Prefix == prefix) return;
            await RequirePrefixFreeAsync(merchantId, prefix, ct);
            var before = row?.Prefix;
            if (row is null)
                db.ConsignmentPartnerPrefixes.Add(row = new ConsignmentPartnerPrefix { MerchantId = merchantId });
            row.Prefix = prefix; row.UpdatedAt = time.GetUtcNow(); row.UpdatedByAdminUserId = admin;
            audit.Append(admin, ActorType.Admin, "consignment.agreement-prefix-changed", "Merchant", merchantId,
                new { prefix = before }, new { prefix });
        }, ct);
        return await AgreementPrefixAsync(merchantId, ct);
    }

    private async Task<string> NextAgreementReferenceAsync(Merchant merchant, Guid admin, CancellationToken ct)
    {
        var row = await db.ConsignmentPartnerPrefixes.SingleOrDefaultAsync(x => x.MerchantId == merchant.Id, ct);
        if (row is null)
        {
            var suggested = await SuggestedPrefixAsync(merchant, ct);
            await RequirePrefixFreeAsync(merchant.Id, suggested, ct);
            db.ConsignmentPartnerPrefixes.Add(row = new ConsignmentPartnerPrefix {
                MerchantId = merchant.Id, Prefix = suggested, UpdatedAt = time.GetUtcNow(), UpdatedByAdminUserId = admin });
            audit.Append(admin, ActorType.Admin, "consignment.agreement-prefix-changed", "Merchant", merchant.Id,
                new { prefix = (string?)null }, new { prefix = suggested });
        }
        // From the first reference on, the prefix is part of issued paperwork.
        row.LockedAt ??= time.GetUtcNow();
        string reference;
        // Skips any number already taken by an agreement entered by hand before references were automatic.
        do reference = await numbers.NextConsignmentAgreementReferenceAsync(row.Prefix, time.GetUtcNow(), ct);
        // Compared in uppercase, so a hand-typed "ankpets-cons-2026-001" also holds its number.
        while (await db.ConsignmentAgreements.AnyAsync(x => x.Reference.ToUpper() == reference, ct));
        return reference;
    }

    private async Task<string> SuggestedPrefixAsync(Merchant m, CancellationToken ct)
    {
        var taken = (await db.ConsignmentPartnerPrefixes.Where(x => x.MerchantId != m.Id).Select(x => x.Prefix).ToListAsync(ct))
            .ToHashSet(StringComparer.Ordinal);
        var stems = await ForeignReferenceStemsAsync(m.Id, ct);
        return ConsignmentPrefixRules.FirstAvailable(ConsignmentPrefixRules.Suggest(m.TradingName, m.LegalBusinessName),
            p => taken.Contains(p) || stems.Contains(p));
    }

    private async Task RequirePrefixFreeAsync(Guid merchantId, string prefix, CancellationToken ct)
    {
        if (await db.ConsignmentPartnerPrefixes.AnyAsync(x => x.MerchantId != merchantId && x.Prefix == prefix, ct)
            || (await ForeignReferenceStemsAsync(merchantId, ct)).Contains(prefix))
            throw Conflict($"{prefix} already identifies another partner's agreements. Choose a different prefix.");
    }

    // Prefixes another merchant's agreements already carry, including references typed by hand in
    // any letter case. UPPER makes the filter independent of the column's collation; the parse in
    // ReferenceStem matches it, and a reference without a usable stem simply claims nothing.
    private async Task<HashSet<string>> ForeignReferenceStemsAsync(Guid merchantId, CancellationToken ct) =>
        (await db.ConsignmentAgreements.Where(x => x.MerchantId != merchantId && x.Reference.ToUpper().Contains(ConsignmentPrefixRules.Delimiter))
            .Select(x => x.Reference).Distinct().ToListAsync(ct))
        .Select(ConsignmentPrefixRules.ReferenceStem).OfType<string>()
        .ToHashSet(StringComparer.Ordinal);
}
