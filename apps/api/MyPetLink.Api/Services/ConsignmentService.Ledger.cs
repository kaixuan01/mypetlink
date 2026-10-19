using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// The SKU stock ledger. Quantities move between buckets for one partner branch;
// no posting ever changes a ConsignmentUnit or guesses which Tag Code moved.
// Every posting happens inside RunAsync, in the same transaction as the status
// change that causes it, so a retry either sees the new status or hits the
// unique source key — never a second posting.
public static class ConsignmentLedgerEntryTypes
{
    public const string UnitCountedAtPartner = "UnitCountedAtPartner";
    public const string UnitReturned = "UnitReturned";
    public const string IdentifiedHandover = "IdentifiedHandover";
    public const string Sale = "Sale";
    public const string CustomerReturnRestockable = "CustomerReturnRestockable";
    public const string CustomerReturnUnsellable = "CustomerReturnUnsellable";
    public const string Reversal = "Reversal";
    // Phase 1B: a stocktake's approved findings, and the movements that settle them.
    public const string StocktakeUnsellableFound = "StocktakeUnsellableFound";
    public const string StocktakeUnsellableShortage = "StocktakeUnsellableShortage";
    public const string StocktakeShortage = "StocktakeShortage";
    public const string DiscrepancyResolution = "DiscrepancyResolution";
    public const string LateReportExplainsShortage = "LateReportExplainsShortage";
}

public static class ConsignmentLedgerSources
{
    public const string Unit = "ConsignmentUnit";
    public const string Handover = "ConsignmentHandoverRecord";
    public const string SalesLine = "ConsignmentSalesReportLine";
    public const string StocktakeLine = "ConsignmentStocktakeLine";
    public const string Resolution = "ConsignmentDiscrepancyResolution";
}

public sealed partial class ConsignmentService
{
    private sealed record LedgerPost(Guid MerchantId, Guid BranchId, Guid VariantId, string Sku,
        ConsignmentStockBucket From, ConsignmentStockBucket To, int Quantity, string EntryType,
        string SourceType, Guid SourceLineId, DateTimeOffset EffectiveAt);

    private static readonly IReadOnlyDictionary<ConsignmentStockBucket, string> BucketNames = new Dictionary<ConsignmentStockBucket, string>
    {
        [ConsignmentStockBucket.External] = "outside partner stock",
        [ConsignmentStockBucket.Sellable] = "sellable stock",
        [ConsignmentStockBucket.Unsellable] = "unsellable stock on hand",
        [ConsignmentStockBucket.Investigation] = "stock under investigation",
        [ConsignmentStockBucket.SoldUnidentified] = "sold stock",
        [ConsignmentStockBucket.LostUnidentified] = "approved losses",
    };

    // Set while a group of postings runs whose order carries no meaning (a report's sales,
    // returns and the reversal of the version it replaces). Balances are then checked once,
    // on the final position, inside the same transaction.
    private HashSet<(Guid Branch, Guid Variant, string Sku, ConsignmentStockBucket Bucket)>? deferredBalanceChecks;

    private IEnumerable<ConsignmentStockLedgerEntry> PendingLedger() =>
        db.ChangeTracker.Entries<ConsignmentStockLedgerEntry>().Where(e => e.State == EntityState.Added).Select(e => e.Entity);

    /// <summary>Current balance, including postings added earlier in this transaction.</summary>
    private async Task<int> LedgerBalanceAsync(Guid branch, Guid variant, ConsignmentStockBucket bucket, CancellationToken ct)
    {
        var stored = await db.ConsignmentStockLedgerEntries.AsNoTracking()
            .Where(e => e.MerchantBranchId == branch && e.ProductVariantId == variant && (e.ToBucket == bucket || e.FromBucket == bucket))
            .SumAsync(e => e.ToBucket == bucket ? e.Quantity : -e.Quantity, ct);
        var pending = PendingLedger().Where(e => e.MerchantBranchId == branch && e.ProductVariantId == variant)
            .Sum(e => (e.ToBucket == bucket ? e.Quantity : 0) - (e.FromBucket == bucket ? e.Quantity : 0));
        return stored + pending;
    }

    private async Task<bool> LedgerSourcePostedAsync(string sourceType, Guid sourceLineId, string entryType, CancellationToken ct) =>
        PendingLedger().Any(e => e.SourceType == sourceType && e.SourceLineId == sourceLineId && e.EntryType == entryType && e.ReversesEntryId == null)
        || await db.ConsignmentStockLedgerEntries.AnyAsync(e => e.SourceType == sourceType && e.SourceLineId == sourceLineId
            && e.EntryType == entryType && e.ReversesEntryId == null, ct);

    /// <summary>Posts once per source. Refuses any movement that would take a bucket below zero.</summary>
    private async Task<ConsignmentStockLedgerEntry?> PostLedgerAsync(LedgerPost p, Guid admin, CancellationToken ct)
    {
        if (p.Quantity <= 0 || p.From == p.To) throw Bad("A stock movement needs a positive quantity between two different stock positions.");
        if (await LedgerSourcePostedAsync(p.SourceType, p.SourceLineId, p.EntryType, ct)) return null;
        await RequireAvailableAsync(p.BranchId, p.VariantId, p.Sku, p.From, p.Quantity, ct);
        // A closed month is never rewritten: anything that happened before the branch's last approved
        // stocktake but is only being recorded now is a correction to the current month.
        var effective = p.EffectiveAt.ToUniversalTime();
        var prior = await LastClosedCutoffAsync(p.BranchId, ct) is { } closed && effective < closed;
        var entry = new ConsignmentStockLedgerEntry {
            MerchantId = p.MerchantId, MerchantBranchId = p.BranchId, ProductVariantId = p.VariantId, SkuSnapshot = p.Sku,
            FromBucket = p.From, ToBucket = p.To, Quantity = p.Quantity, EntryType = p.EntryType,
            SourceType = p.SourceType, SourceLineId = p.SourceLineId, EffectiveAt = prior ? time.GetUtcNow() : effective,
            IsPriorPeriodCorrection = prior, PostedAt = time.GetUtcNow(), ActorAdminUserId = admin };
        db.ConsignmentStockLedgerEntries.Add(entry);
        return entry;
    }

    /// <summary>Posts the exact inverse of an earlier entry, once.</summary>
    private async Task ReverseLedgerAsync(ConsignmentStockLedgerEntry original, Guid admin, CancellationToken ct)
    {
        if (PendingLedger().Any(e => e.ReversesEntryId == original.Id)
            || await db.ConsignmentStockLedgerEntries.AnyAsync(e => e.ReversesEntryId == original.Id, ct)) return;
        await RequireAvailableAsync(original.MerchantBranchId, original.ProductVariantId, original.SkuSnapshot, original.ToBucket, original.Quantity, ct);
        var closed = await LastClosedCutoffAsync(original.MerchantBranchId, ct);
        db.ConsignmentStockLedgerEntries.Add(new ConsignmentStockLedgerEntry {
            IsPriorPeriodCorrection = closed is { } cutoff && original.EffectiveAt < cutoff,
            MerchantId = original.MerchantId, MerchantBranchId = original.MerchantBranchId, ProductVariantId = original.ProductVariantId,
            SkuSnapshot = original.SkuSnapshot, FromBucket = original.ToBucket, ToBucket = original.FromBucket, Quantity = original.Quantity,
            EntryType = ConsignmentLedgerEntryTypes.Reversal, SourceType = original.SourceType, SourceLineId = original.SourceLineId,
            ReversesEntryId = original.Id, EffectiveAt = time.GetUtcNow(), PostedAt = time.GetUtcNow(), ActorAdminUserId = admin });
    }

    private async Task RequireAvailableAsync(Guid branch, Guid variant, string sku, ConsignmentStockBucket from, int quantity, CancellationToken ct)
    {
        if (from == ConsignmentStockBucket.External) return;
        if (deferredBalanceChecks is not null) { deferredBalanceChecks.Add((branch, variant, sku, from)); return; }
        var balance = await LedgerBalanceAsync(branch, variant, from, ct);
        if (balance < quantity)
            throw Conflict($"This would take {sku} {BucketNames[from]} below zero ({balance} recorded, {quantity} needed). Review the partner's stock before continuing.");
    }

    /// <summary>
    /// Runs postings as one movement: intermediate balances may dip below zero, but every
    /// bucket they touch must end at zero or above, or the whole transaction is refused.
    /// </summary>
    private async Task PostTogetherAsync(Func<Task> postings, CancellationToken ct)
    {
        deferredBalanceChecks = [];
        try
        {
            await postings();
            foreach (var (branch, variant, sku, bucket) in deferredBalanceChecks.OrderBy(x => x.Sku).ThenBy(x => x.Bucket))
            {
                var balance = await LedgerBalanceAsync(branch, variant, bucket, ct);
                if (balance < 0)
                    throw Conflict($"This would leave {sku} {BucketNames[bucket]} at {balance}. Review the partner's stock before continuing.");
            }
        }
        finally { deferredBalanceChecks = null; }
    }

    /// <summary>The cutoff of the branch's latest approved stocktake: the end of its last closed month, if any.</summary>
    private Task<DateTimeOffset?> LastClosedCutoffAsync(Guid branch, CancellationToken ct) =>
        db.ConsignmentStocktakes.AsNoTracking().Where(s => s.MerchantBranchId == branch && s.Status == ConsignmentStocktakeStatus.Approved)
            .MaxAsync(s => (DateTimeOffset?)s.CutoffAt, ct);

    /// <summary>Whether a unit's arrival at the partner is already in the SKU ledger.</summary>
    private Task<bool> UnitTrackedAsync(Guid unitId, CancellationToken ct) =>
        LedgerSourcePostedAsync(ConsignmentLedgerSources.Unit, unitId, ConsignmentLedgerEntryTypes.UnitCountedAtPartner, ct);

    // --- Hooks called from the existing per-unit custody actions ------------------

    private async Task PostUnitCountedAsync(ConsignmentDispatch d, ConsignmentUnit u, DateTimeOffset effectiveAt, Guid admin, CancellationToken ct)
    {
        if (d.MerchantBranchId is not Guid branch) return; // Legacy deliveries without a branch stay per-unit only.
        await PostLedgerAsync(new(d.Agreement.MerchantId, branch, u.ProductVariantId, u.SkuSnapshot,
            ConsignmentStockBucket.External, ConsignmentStockBucket.Sellable, 1, ConsignmentLedgerEntryTypes.UnitCountedAtPartner,
            ConsignmentLedgerSources.Unit, u.Id, effectiveAt), admin, ct);
    }

    private async Task PostUnitReturnedAsync(ConsignmentDispatch d, ConsignmentUnit u, string? bucket, Guid admin, CancellationToken ct)
    {
        if (d.MerchantBranchId is not Guid branch || !await UnitTrackedAsync(u.Id, ct)) return;
        var from = bucket switch {
            null or "" or "Sellable" => ConsignmentStockBucket.Sellable,
            "Unsellable" => ConsignmentStockBucket.Unsellable,
            _ => throw Bad("Choose whether the returned package came from sellable or unsellable stock."),
        };
        await PostLedgerAsync(new(d.Agreement.MerchantId, branch, u.ProductVariantId, u.SkuSnapshot, from, ConsignmentStockBucket.External,
            1, ConsignmentLedgerEntryTypes.UnitReturned, ConsignmentLedgerSources.Unit, u.Id, time.GetUtcNow()), admin, ct);
    }

    private async Task PostIdentifiedHandoverAsync(ConsignmentDispatch d, ConsignmentUnit u, ConsignmentHandoverRecord record,
        ConsignmentHandoverAttribution attribution, Guid admin, CancellationToken ct)
    {
        if (d.MerchantBranchId is not Guid branch) return;
        var from = attribution == ConsignmentHandoverAttribution.AggregateSale ? ConsignmentStockBucket.SoldUnidentified : ConsignmentStockBucket.Sellable;
        await PostLedgerAsync(new(d.Agreement.MerchantId, branch, u.ProductVariantId, u.SkuSnapshot, from, ConsignmentStockBucket.External,
            1, ConsignmentLedgerEntryTypes.IdentifiedHandover, ConsignmentLedgerSources.Handover, record.Id, record.EventAt), admin, ct);
    }

    /// <summary>
    /// The handover record that began a unit's current handover. Evidence corrections chain
    /// back to it through SupersedesRecordId; the ledger knows the handover only by this
    /// record, so a correction is never a second movement or a second source.
    /// Null when the unit's handover predates handover records.
    /// </summary>
    private static Guid? HandoverEpisodeRoot(IEnumerable<ConsignmentHandoverRecord> records, Guid? current)
    {
        var byId = records.ToDictionary(r => r.Id);
        for (var (id, steps) = (current, 0); id is Guid recordId && steps <= byId.Count; steps++)
        {
            if (!byId.TryGetValue(recordId, out var record)) return null;
            if (record.Kind == "Handover") return record.Id;
            id = record.SupersedesRecordId;
        }
        return null;
    }

    /// <summary>The ledger source of a unit's current handover: its episode's first record, or the unit itself for older handovers.</summary>
    private static (string SourceType, Guid SourceId) HandoverSource(IEnumerable<ConsignmentHandoverRecord> records, ConsignmentUnit u) =>
        HandoverEpisodeRoot(records, u.CurrentHandoverRecordId) is Guid root
            ? (ConsignmentLedgerSources.Handover, root) : (ConsignmentLedgerSources.Unit, u.Id);

    private async Task ReverseIdentifiedHandoverAsync(ConsignmentDispatch d, ConsignmentUnit u, Guid admin, CancellationToken ct)
    {
        var (sourceType, sourceId) = HandoverSource(d.HandoverRecords, u);
        // The unique source key allows one unreversed movement per source, so this finds at most one.
        var entry = await db.ConsignmentStockLedgerEntries.AsNoTracking()
            .Where(e => e.SourceType == sourceType && e.SourceLineId == sourceId
                && e.EntryType == ConsignmentLedgerEntryTypes.IdentifiedHandover && e.ReversesEntryId == null
                && !db.ConsignmentStockLedgerEntries.Any(x => x.ReversesEntryId == e.Id))
            .SingleOrDefaultAsync(ct);
        if (entry is not null) await ReverseLedgerAsync(entry, admin, ct);
    }
}
