using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Keeps the dated history behind <see cref="Merchant.AssignedSalespersonId"/>.
/// A reassignment takes effect from the moment it is recorded and never moves an
/// earlier period: the open row is closed and a new one opened at the same instant.
/// </summary>
internal static class MerchantServicingHistory
{
    /// <summary>
    /// Closes the merchant's open servicing row. The caller saves this before
    /// <see cref="Open"/>'s row, because the "one open row" unique index is checked
    /// per statement and the two rows share their key.
    /// </summary>
    public static async Task<bool> CloseOpenAsync(MyPetLinkDbContext db, Guid merchantId, DateTimeOffset at, CancellationToken ct)
    {
        var open = await db.MerchantServicingAssignments
            .SingleOrDefaultAsync(row => row.MerchantId == merchantId && row.EffectiveToExclusive == null, ct);
        if (open is null) return false;
        open.EffectiveToExclusive = at < open.EffectiveFrom ? open.EffectiveFrom : at;
        return true;
    }

    public static void Open(MyPetLinkDbContext db, Guid merchantId, Salesperson salesperson, DateTimeOffset at,
        Guid? recordedByAdminUserId, string source) =>
        db.MerchantServicingAssignments.Add(new MerchantServicingAssignment
        {
            MerchantId = merchantId,
            SalespersonId = salesperson.Id,
            SalespersonCodeSnapshot = salesperson.SalespersonCode,
            SalespersonNameSnapshot = salesperson.Name,
            EffectiveFrom = at,
            Source = source,
            RecordedByAdminUserId = recordedByAdminUserId,
            RecordedAt = at,
        });

    /// <summary>
    /// The servicing rows that touch [start, end). Exactly one row covering the
    /// whole period is the only case that names a salesperson automatically.
    /// </summary>
    public static Task<List<MerchantServicingAssignment>> OverlappingAsync(MyPetLinkDbContext db, Guid merchantId,
        DateTimeOffset start, DateTimeOffset endExclusive, CancellationToken ct) =>
        db.MerchantServicingAssignments.AsNoTracking()
            .Where(row => row.MerchantId == merchantId && row.EffectiveFrom < endExclusive
                && (row.EffectiveToExclusive == null || row.EffectiveToExclusive > start))
            .OrderBy(row => row.EffectiveFrom).ToListAsync(ct);
}
