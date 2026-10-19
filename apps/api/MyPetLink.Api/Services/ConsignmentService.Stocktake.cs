using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Monthly stocktake, period close and carry forward, and discrepancy investigation (Phase 1B).
// Every movement goes through the Phase 1A SKU ledger; nothing here changes a ConsignmentUnit,
// assigns a Tag Code to an aggregate figure or creates a financial record. A shortage waits in
// Investigation, a surplus is a note that never adds stock, and only a reviewed resolution moves
// either one, bounded by its open quantity and its source bucket.
public sealed partial class ConsignmentService
{
    private const string StocktakeSubject = "ConsignmentStocktake";
    private const string DiscrepancySubject = "ConsignmentStockDiscrepancy";
    private static readonly string[] CountEvidenceKinds = ["Count sheet photo", "WhatsApp count summary", "Joint count in person", "Other"];
    private const string LateReportExplained = "ExplainedByLateReport";
    private const string LateReportWithdrawn = "AllocationWithdrawn";
    private const string NoLongerPresent = "NoLongerPresent";
    private const string HistoricalCountIncompatible = "historical_count_incompatible";
    // How long after the end of a count date a count can still be accepted for it, before the shop reopens.
    private const int MaxHoursCountedAfterCutoff = 24;

    /// <summary>What each discrepancy can be settled as, and where its quantity moves (null: no posting).</summary>
    private static readonly IReadOnlyDictionary<ConsignmentDiscrepancyKind, IReadOnlyDictionary<string, (ConsignmentStockBucket From, ConsignmentStockBucket To)?>> Outcomes =
        new Dictionary<ConsignmentDiscrepancyKind, IReadOnlyDictionary<string, (ConsignmentStockBucket, ConsignmentStockBucket)?>>
        {
            [ConsignmentDiscrepancyKind.Shortage] = new Dictionary<string, (ConsignmentStockBucket, ConsignmentStockBucket)?>
            {
                ["Found"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.Sellable),
                ["FoundDamaged"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.Unsellable),
                ["ApprovedLoss"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.LostUnidentified),
            },
            [ConsignmentDiscrepancyKind.UnsellableShortage] = new Dictionary<string, (ConsignmentStockBucket, ConsignmentStockBucket)?>
            {
                ["Found"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.Unsellable),
                ["FoundSellable"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.Sellable),
                ["ApprovedLoss"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.LostUnidentified),
            },
            // Damaged stock stays Unsellable until it physically comes back through a dispatch return.
            // An aggregate resolution can't certify a return, so there is no "returned" outcome here.
            [ConsignmentDiscrepancyKind.UnsellableFound] = new Dictionary<string, (ConsignmentStockBucket, ConsignmentStockBucket)?>
            {
                ["ConfirmedDamaged"] = null,
                ["RecountSellable"] = (ConsignmentStockBucket.Unsellable, ConsignmentStockBucket.Sellable),
            },
            [ConsignmentDiscrepancyKind.Surplus] = new Dictionary<string, (ConsignmentStockBucket, ConsignmentStockBucket)?>
            {
                ["RecountError"] = null,
                ["EarlierShortageFound"] = (ConsignmentStockBucket.Investigation, ConsignmentStockBucket.Sellable),
                ["EarlierLossFound"] = (ConsignmentStockBucket.LostUnidentified, ConsignmentStockBucket.Sellable),
            },
        };

    // --- Count dates and books at the cutoff ---------------------------------------------

    /// <summary>
    /// A count closes a sales period, so it is taken on the 15th or the last day of a month. The
    /// cutoff is the next midnight in Malaysia time, which is always a sales period boundary.
    /// </summary>
    private static DateTimeOffset StocktakeCutoff(string? countDate)
    {
        if (!DateTime.TryParseExact(countDate?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            throw Bad("Choose the count date.");
        if (day.Day != 15 && day.Day != DateTime.DaysInMonth(day.Year, day.Month))
            throw Bad("Count on the 15th or the last day of the month, so the count lines up with the sales periods.");
        return new DateTimeOffset(day.Year, day.Month, day.Day, 0, 0, 0, MalaysiaOffset).AddDays(1);
    }

    private static string CountDateOf(DateTimeOffset cutoff) =>
        cutoff.ToOffset(MalaysiaOffset).AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static string CountDayLabel(DateTimeOffset cutoff) =>
        cutoff.ToOffset(MalaysiaOffset).AddDays(-1).ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    private static string MalaysiaTimeLabel(DateTimeOffset at) =>
        at.ToOffset(MalaysiaOffset).ToString("d MMM yyyy h:mm tt", CultureInfo.InvariantCulture);

    /// <summary>
    /// A count is compared with the books at its cutoff, so when the shelf was physically counted
    /// matters. A count on the count day is accepted. One taken after midnight, before the shop
    /// reopened, is accepted only with a documented confirmation that nothing moved in between (and
    /// no movement recorded then, checked separately). Anything earlier or later must be counted
    /// again: a count is never entered as if it were taken at a cutoff it didn't see.
    /// </summary>
    private static void CheckCountTiming(DateTimeOffset cutoff, DateTimeOffset? countedAt, string? afterCutoffNote, DateTimeOffset now)
    {
        var day = CountDayLabel(cutoff);
        if (countedAt is not { } at) throw Bad("Record when the shelf was actually counted (date and time, Malaysia time).");
        if (at > now.AddMinutes(5)) throw Bad("The count time can't be in the future.");
        if (at < cutoff.AddDays(-1))
            throw Bad($"A count taken before {day} can't close the period to {day}. Choose the count date it was taken on, or count again.");
        if (at < cutoff) return;
        if (at >= cutoff.AddHours(MaxHoursCountedAfterCutoff))
            throw Bad($"This count was taken more than a day after {day} ended. Sales and deliveries since then would show as false differences, so count again on the next count date instead.");
        if (afterCutoffNote is not { Length: >= 20 })
            throw Bad($"This count was taken after {day} ended. Explain how you know nothing was sold, delivered or returned between midnight and the count (at least 20 characters), or count again on the next count date.");
    }

    /// <summary>Stock movements recorded at the branch between the cutoff and a later count: real-time receipts, returns and handovers.</summary>
    private Task<int> MovementsAfterCutoffAsync(Guid branch, DateTimeOffset cutoff, DateTimeOffset countedAt, CancellationToken ct) =>
        countedAt <= cutoff ? Task.FromResult(0)
            : db.ConsignmentStockLedgerEntries.AsNoTracking().CountAsync(e => e.MerchantBranchId == branch && e.EffectiveAt >= cutoff
                && e.EffectiveAt < countedAt && !e.IsPriorPeriodCorrection, ct);

    private static bool SameEvidence(string? a, string? b) =>
        string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);

    private sealed record BookFigures(int Sellable, int Unsellable, int Investigation, int Sold, int Lost);

    /// <summary>Ledger balances per SKU from movements before the cutoff.</summary>
    private async Task<Dictionary<Guid, BookFigures>> BooksAtAsync(Guid branch, DateTimeOffset cutoff, CancellationToken ct)
    {
        var entries = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.MerchantBranchId == branch && e.EffectiveAt < cutoff)
            .GroupBy(e => new { e.ProductVariantId, e.FromBucket, e.ToBucket })
            .Select(g => new { g.Key.ProductVariantId, g.Key.FromBucket, g.Key.ToBucket, Quantity = g.Sum(x => x.Quantity) }).ToListAsync(ct);
        return entries.Select(e => e.ProductVariantId).Distinct().ToDictionary(v => v, v => {
            int Balance(ConsignmentStockBucket b) => entries.Where(e => e.ProductVariantId == v && e.ToBucket == b).Sum(e => e.Quantity)
                - entries.Where(e => e.ProductVariantId == v && e.FromBucket == b).Sum(e => e.Quantity);
            return new BookFigures(Balance(ConsignmentStockBucket.Sellable), Balance(ConsignmentStockBucket.Unsellable),
                Balance(ConsignmentStockBucket.Investigation), Balance(ConsignmentStockBucket.SoldUnidentified), Balance(ConsignmentStockBucket.LostUnidentified));
        });
    }

    private async Task<Dictionary<Guid, int>> OpenSurplusAsync(Guid branch, CancellationToken ct) =>
        (await db.ConsignmentStockDiscrepancies.AsNoTracking().Where(d => d.MerchantBranchId == branch
                && d.Kind == ConsignmentDiscrepancyKind.Surplus && d.Status == ConsignmentDiscrepancyStatus.Open)
            .GroupBy(d => d.ProductVariantId).Select(g => new { g.Key, Open = g.Sum(x => x.OpenQuantity) }).ToListAsync(ct))
        .ToDictionary(x => x.Key, x => x.Open);

    private async Task<Dictionary<Guid, int>> CustodyUnitsAsync(Guid branch, CancellationToken ct) =>
        (await db.ConsignmentUnits.AsNoTracking().Where(u => u.Dispatch.MerchantBranchId == branch
                && u.Status == ConsignmentUnitStatus.Received && u.ReceivingState == ConsignmentReceivingState.Good)
            .GroupBy(u => u.ProductVariantId).Select(g => new { g.Key, Units = g.Count() }).ToListAsync(ct))
        .ToDictionary(x => x.Key, x => x.Units);

    /// <summary>
    /// The approval algorithm for one SKU (design §6.2). Damaged stock found is moved to Unsellable and
    /// investigated; unsellable stock missing goes to Investigation; a sellable shortage first uses up
    /// open surplus notes, then goes to Investigation; a surplus is only noted. Counts can't be
    /// negative, so no movement can take a bucket below zero at the cutoff.
    /// </summary>
    private sealed record StocktakePlan(BookFigures Book, int OpenSurplusBefore, int UnsellableFound, int UnsellableShortage,
        int Shortage, int Surplus, int SurplusNoLongerPresent)
    {
        public int ClosingSellable => Book.Sellable - UnsellableFound - Shortage;
        public int ClosingUnsellable => Book.Unsellable + UnsellableFound - UnsellableShortage;
        public int ClosingInvestigation => Book.Investigation + Shortage + UnsellableShortage;
        public int OpenSurplusAfter => OpenSurplusBefore - SurplusNoLongerPresent + Surplus;
        public bool Variance => UnsellableFound + UnsellableShortage + Shortage + Surplus + SurplusNoLongerPresent > 0;
    }

    private static StocktakePlan PlanStocktake(BookFigures book, int openSurplus, int countedSellable, int countedUnsellable)
    {
        var newlyUnsellable = Math.Max(0, countedUnsellable - book.Unsellable);
        var unsellableFound = Math.Min(newlyUnsellable, Math.Max(0, book.Sellable));
        var unsellableShortage = Math.Max(0, book.Unsellable - countedUnsellable);
        var expectedPhysical = book.Sellable - unsellableFound + openSurplus;
        var diff = countedSellable - expectedPhysical;
        var noLongerPresent = diff < 0 ? Math.Min(openSurplus, -diff) : 0;
        var shortage = diff < 0 ? -diff - noLongerPresent : 0;
        // Damaged packages beyond anything that could have come off the shelf are also only a note.
        var surplus = Math.Max(0, diff) + (newlyUnsellable - unsellableFound);
        return new(book, openSurplus, unsellableFound, unsellableShortage, shortage, surplus, noLongerPresent);
    }

    // --- Reads ----------------------------------------------------------------------------

    /// <summary>What a count on this date will be compared against: books at the cutoff plus open surplus.</summary>
    public async Task<ConsignmentStocktakeExpectationResponse> StocktakeExpectationAsync(Guid branchId, string countDate, CancellationToken ct)
    {
        var cutoff = StocktakeCutoff(countDate);
        if (!await db.MerchantBranches.AnyAsync(b => b.Id == branchId, ct)) throw Missing();
        var lines = await StocktakeLinesAsync(branchId, cutoff, null, ct);
        var issues = await StocktakeGateIssuesAsync(branchId, cutoff, null, ct);
        return new(branchId, CountDateOf(cutoff), cutoff, await LastClosedCutoffAsync(branchId, ct), lines, issues);
    }

    public async Task<(IReadOnlyList<ConsignmentStocktakeResponse> Items, int Total)> StocktakesAsync(int page, int pageSize,
        Guid? branchId, string? status, CancellationToken ct)
    {
        Page(page, pageSize);
        var q = db.ConsignmentStocktakes.AsNoTracking().AsQueryable();
        if (branchId.HasValue) q = q.Where(s => s.MerchantBranchId == branchId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<ConsignmentStocktakeStatus>(status, "Choose a valid stocktake status.");
            q = q.Where(s => s.Status == parsed);
        }
        var total = await q.CountAsync(ct);
        var ids = await q.OrderByDescending(s => s.CutoffAt).ThenByDescending(s => s.CreatedAt).ThenBy(s => s.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(s => s.Id).ToListAsync(ct);
        var items = new List<ConsignmentStocktakeResponse>();
        foreach (var id in ids) items.Add(await StocktakeAsync(id, false, ct));
        return (items, total);
    }

    public Task<ConsignmentStocktakeResponse> GetStocktakeAsync(Guid id, CancellationToken ct) => StocktakeAsync(id, true, ct);

    private async Task<ConsignmentStocktakeResponse> StocktakeAsync(Guid id, bool assess, CancellationToken ct)
    {
        var s = await db.ConsignmentStocktakes.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new ApiException(404, "consignment_not_found", "This stocktake could not be found.");
        var branch = await db.MerchantBranches.AsNoTracking().Include(b => b.Merchant).SingleAsync(b => b.Id == s.MerchantBranchId, ct);
        var previous = s.PreviousStocktakeId is Guid p
            ? await db.ConsignmentStocktakes.AsNoTracking().Where(x => x.Id == p).Select(x => (DateTimeOffset?)x.CutoffAt).SingleAsync(ct)
            : await db.ConsignmentStocktakes.AsNoTracking().Where(x => x.MerchantBranchId == s.MerchantBranchId
                && x.Status == ConsignmentStocktakeStatus.Approved && x.CutoffAt < s.CutoffAt).MaxAsync(x => (DateTimeOffset?)x.CutoffAt, ct);
        var open = s.Status is ConsignmentStocktakeStatus.Draft or ConsignmentStocktakeStatus.Recorded;
        var lines = open ? await StocktakeLinesAsync(s.MerchantBranchId, s.CutoffAt, s.Lines, ct) : await FrozenLinesAsync(s, ct);
        List<string> issues = [], warnings = [];
        if (assess && open) (issues, warnings) = await AssessStocktakeAsync(s, lines, ct);
        return new(s.Id, s.MerchantId, branch.Merchant.TradingName ?? branch.Merchant.LegalBusinessName, branch.Id, branch.Name,
            CountDateOf(s.CutoffAt), s.CutoffAt, s.CountedBy, s.EvidenceKind, s.EvidenceReference, s.Notes, s.Status.ToString(),
            s.PreviousStocktakeId, previous, s.CreatedAt, s.RecordedAt, s.ApprovedAt, s.ReviewMode, lines, issues, warnings,
            Convert.ToBase64String(s.RowVersion)) {
            CountedAt = s.CountedAt, CountedAfterCutoffNote = s.CountedAfterCutoffNote,
            ReviewFingerprint = assess && open ? ReviewFingerprint(lines, warnings) : null };
    }

    /// <summary>
    /// Identifies everything a reviewer is shown before closing a month: each SKU's books, open notes,
    /// count and findings, and the warnings. Any receipt, return, report or resolution that changes
    /// them changes the fingerprint, so an acknowledgement can't carry over to different figures.
    /// </summary>
    private static string ReviewFingerprint(IEnumerable<ConsignmentStocktakeLineResponse> lines, IEnumerable<string> warnings)
    {
        var text = new StringBuilder();
        foreach (var l in lines.OrderBy(l => l.ProductVariantId))
            text.AppendLine(string.Join('|', l.ProductVariantId, l.BookSellable, l.BookUnsellable, l.BookInvestigation, l.BookSold, l.BookLost,
                l.OpenSurplusBefore, l.CountedSellable, l.CountedUnsellable, l.UnsellableFound, l.UnsellableShortage, l.Shortage, l.Surplus,
                l.SurplusNoLongerPresent, l.CustodyUnits));
        foreach (var w in warnings) text.AppendLine(w);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text.ToString())))[..32];
    }

    /// <summary>Every SKU the branch holds or has counted, with its books at the cutoff and the planned outcome.</summary>
    private async Task<List<ConsignmentStocktakeLineResponse>> StocktakeLinesAsync(Guid branch, DateTimeOffset cutoff,
        IEnumerable<ConsignmentStocktakeLine>? counted, CancellationToken ct)
    {
        var books = await BooksAtAsync(branch, cutoff, ct);
        var (surplus, _) = await SurplusAtCutoffAsync(branch, cutoff, ct);
        var custody = await CustodyUnitsAsync(branch, ct);
        var countedBy = (counted ?? []).ToDictionary(l => l.ProductVariantId);
        var variantIds = books.Keys.Concat(surplus.Keys).Concat(custody.Keys).Concat(countedBy.Keys).Distinct().ToArray();
        var variants = await db.TagProductVariants.AsNoTracking().Include(v => v.TagProduct).Where(v => variantIds.Contains(v.Id)).ToListAsync(ct);
        return variants.OrderBy(v => v.Sku).Select(v => {
            var book = books.GetValueOrDefault(v.Id) ?? new BookFigures(0, 0, 0, 0, 0);
            var open = surplus.GetValueOrDefault(v.Id);
            countedBy.TryGetValue(v.Id, out var line);
            var plan = line is null ? null : PlanStocktake(book, open, line.CountedSellable, line.CountedUnsellable);
            return new ConsignmentStocktakeLineResponse(line?.Id, v.Id, v.Sku, $"{v.TagProduct.Name} · {v.DisplayName}",
                book.Sellable, book.Unsellable, book.Investigation, book.Sold, book.Lost, open, book.Sellable + open, book.Unsellable,
                line?.CountedSellable, line?.CountedUnsellable, line is null ? null : line.CountedSellable - (book.Sellable + open),
                line is null ? null : line.CountedUnsellable - book.Unsellable, plan?.UnsellableFound ?? 0, plan?.UnsellableShortage ?? 0,
                plan?.Shortage ?? 0, plan?.Surplus ?? 0, plan?.SurplusNoLongerPresent ?? 0, plan?.ClosingSellable ?? book.Sellable,
                plan?.ClosingUnsellable ?? book.Unsellable, plan?.ClosingInvestigation ?? book.Investigation, book.Sold, book.Lost,
                plan?.OpenSurplusAfter ?? open, custody.GetValueOrDefault(v.Id), line?.Notes, false);
        }).ToList();
    }

    private async Task<List<ConsignmentStocktakeLineResponse>> FrozenLinesAsync(ConsignmentStocktake s, CancellationToken ct)
    {
        var ids = s.Lines.Select(l => l.ProductVariantId).ToArray();
        var names = await db.TagProductVariants.AsNoTracking().Include(v => v.TagProduct).Where(v => ids.Contains(v.Id))
            .ToDictionaryAsync(v => v.Id, v => $"{v.TagProduct.Name} · {v.DisplayName}", ct);
        return s.Lines.OrderBy(l => l.SkuSnapshot).Select(l => {
            int F(int? value) => value ?? 0;
            var expected = F(l.BookSellable) + F(l.OpenSurplusBefore);
            return new ConsignmentStocktakeLineResponse(l.Id, l.ProductVariantId, l.SkuSnapshot, names.GetValueOrDefault(l.ProductVariantId, l.SkuSnapshot),
                F(l.BookSellable), F(l.BookUnsellable), F(l.BookInvestigation), F(l.BookSold), F(l.BookLost), F(l.OpenSurplusBefore),
                expected, F(l.BookUnsellable), l.CountedSellable, l.CountedUnsellable, l.CountedSellable - expected,
                l.CountedUnsellable - F(l.BookUnsellable), F(l.UnsellableFound), F(l.UnsellableShortage), F(l.Shortage), F(l.Surplus),
                F(l.SurplusNoLongerPresent), F(l.ClosingSellable), F(l.ClosingUnsellable), F(l.ClosingInvestigation), F(l.ClosingSold),
                F(l.ClosingLost), F(l.OpenSurplusAfter), 0, l.Notes, l.FrozenAt is not null);
        }).ToList();
    }

    /// <summary>Conditions for closing a month that don't depend on the counts themselves.</summary>
    private sealed record NoteChange(Guid VariantId, string Sku, string Outcome, int Quantity, DateTimeOffset RecordedAt);

    /// <summary>
    /// Open surplus notes as they stood at a count's cutoff, so they are compared with the books at that same
    /// moment, plus every change to a note recorded since. A "not found" settlement is always dated by the earlier
    /// count that made it (closes are in cutoff order), so it never counts as a later change. Any other settlement,
    /// link or reopening recorded at or after the cutoff can't be placed in time: a count compared with it isn't
    /// reliable (see <see cref="HistoricalNoteIssuesAsync"/>).
    /// </summary>
    private async Task<(Dictionary<Guid, int> Open, List<NoteChange> ChangedAfter)> SurplusAtCutoffAsync(Guid branch, DateTimeOffset cutoff, CancellationToken ct)
    {
        var now = await OpenSurplusAsync(branch, ct);
        var later = (await db.ConsignmentDiscrepancyResolutions.AsNoTracking().Where(r => r.Discrepancy.MerchantBranchId == branch
                && r.Discrepancy.Kind == ConsignmentDiscrepancyKind.Surplus && r.Outcome != NoLongerPresent && r.RecordedAt >= cutoff)
            .Select(r => new { r.Discrepancy.ProductVariantId, r.Discrepancy.SkuSnapshot, r.Outcome, r.Quantity, r.RecordedAt }).ToListAsync(ct))
            .Select(r => new NoteChange(r.ProductVariantId, r.SkuSnapshot, r.Outcome, r.Quantity, r.RecordedAt)).ToList();
        var open = now.Keys.Concat(later.Select(c => c.VariantId)).Distinct().ToDictionary(v => v, v => Math.Max(0, now.GetValueOrDefault(v)
            + later.Where(c => c.VariantId == v).Sum(c => c.Outcome == LateReportWithdrawn ? -c.Quantity : c.Quantity)));
        return (open, later);
    }

    /// <summary>
    /// A count can close only on obligations it could have seen. If any extra stock noted at an earlier count was
    /// settled, linked or reopened after this count's cutoff (for example a late report corrected afterwards), the
    /// count can't be reconciled with it confidently, so the close is refused rather than settling an obligation
    /// that didn't exist, or wasn't settled, when the shelf was counted. Counting again after the change resolves it.
    /// </summary>
    private async Task<List<string>> HistoricalNoteIssuesAsync(Guid branch, DateTimeOffset cutoff, CancellationToken ct)
    {
        var (_, changes) = await SurplusAtCutoffAsync(branch, cutoff, ct);
        return changes.GroupBy(c => c.Sku).OrderBy(g => g.Key).Select(g => {
            var reopened = g.Any(c => c.Outcome == LateReportWithdrawn);
            var settled = g.Any(c => c.Outcome != LateReportWithdrawn);
            var what = reopened && settled ? "settled and reopened" : reopened ? "reopened" : "settled";
            var when = g.Max(c => c.RecordedAt).ToOffset(MalaysiaOffset).ToString("d MMM yyyy", CultureInfo.InvariantCulture);
            return $"{g.Key}: extra stock noted at an earlier count was {what} on {when}, after this count date, so this count can't be "
                + "compared with it reliably. Discard this count and count again on the next count date.";
        }).ToList();
    }

    private async Task<List<string>> StocktakeGateIssuesAsync(Guid branch, DateTimeOffset cutoff, Guid? stocktakeId, CancellationToken ct)
    {
        var issues = new List<string>();
        if (await LastClosedCutoffAsync(branch, ct) is { } closed && cutoff <= closed)
            issues.Add($"The month to {CountDateOf(closed)} is already closed. Count a later date.");
        issues.AddRange(await HistoricalNoteIssuesAsync(branch, cutoff, ct));
        var unverified = await db.ConsignmentSalesReports.AsNoTracking().Where(r => r.MerchantBranchId == branch
                && (r.Status == ConsignmentSalesReportStatus.Draft || r.Status == ConsignmentSalesReportStatus.Recorded) && r.PeriodStart < cutoff)
            .Select(r => r.PartnerReference).ToListAsync(ct);
        if (unverified.Count > 0)
            issues.Add($"Verify, dispute or discard the sales reports for this period first ({string.Join(", ", unverified.Distinct().Order())}). The count is compared with verified sales only.");
        // Cutoffs fall on sales period boundaries, so only an agreement-split period could straddle one.
        if (await db.ConsignmentSalesReports.AnyAsync(r => r.MerchantBranchId == branch && r.Status != ConsignmentSalesReportStatus.Voided
                && r.Status != ConsignmentSalesReportStatus.Superseded && r.PeriodStart < cutoff && r.PeriodEndExclusive > cutoff, ct))
            issues.Add("A sales report spans the count date. Count at the end of that report's period instead.");
        var untracked = await db.ConsignmentUnits.AsNoTracking().CountAsync(u => u.Dispatch.MerchantBranchId == branch
            && u.Status == ConsignmentUnitStatus.Received && u.ReceivingState == ConsignmentReceivingState.Good
            && !db.ConsignmentStockLedgerEntries.Any(e => e.SourceType == ConsignmentLedgerSources.Unit
                && e.EntryType == ConsignmentLedgerEntryTypes.UnitCountedAtPartner && e.SourceLineId == u.Id), ct);
        if (untracked > 0)
            issues.Add($"{untracked} received {(untracked == 1 ? "unit isn't" : "units aren't")} in SKU stock yet. Bring them into stock tracking first.");
        if (await db.ConsignmentStocktakes.AnyAsync(s => s.MerchantBranchId == branch && s.Id != stocktakeId
                && (s.Status == ConsignmentStocktakeStatus.Draft || s.Status == ConsignmentStocktakeStatus.Recorded), ct))
            issues.Add("Another stocktake for this branch is still open. Finish or discard it first.");
        return issues;
    }

    /// <summary>Blocking issues and warnings to acknowledge before a month can be closed.</summary>
    private async Task<(List<string> Issues, List<string> Warnings)> AssessStocktakeAsync(ConsignmentStocktake s,
        IReadOnlyList<ConsignmentStocktakeLineResponse> lines, CancellationToken ct)
    {
        var issues = await StocktakeGateIssuesAsync(s.MerchantBranchId, s.CutoffAt, s.Id, ct);
        var warnings = new List<string>();
        if (time.GetUtcNow() < s.CutoffAt)
            issues.Add($"The count day ({CountDateOf(s.CutoffAt)}) hasn't ended yet. Close the month once it has.");
        if (s.CountedAt is not { } countedAt)
            issues.Add("This count doesn't say when the shelf was actually counted. Discard it and enter it again with the count time.");
        else
        {
            var day = CountDayLabel(s.CutoffAt);
            var moved = await MovementsAfterCutoffAsync(s.MerchantBranchId, s.CutoffAt, countedAt, ct);
            if (moved > 0)
                issues.Add($"{moved} stock {(moved == 1 ? "movement was" : "movements were")} recorded between the end of {day} and the count at {MalaysiaTimeLabel(countedAt)}, "
                    + "so the count can't be compared with the books at the end of the count date. Discard it and count again on the next count date.");
            if (countedAt >= s.CutoffAt)
                warnings.Add($"Counted at {MalaysiaTimeLabel(countedAt)}, after {day} ended. Recorded confirmation that nothing moved in between: {s.CountedAfterCutoffNote}");
            else if (countedAt < s.CutoffAt.AddHours(-6))
                warnings.Add($"Counted at {MalaysiaTimeLabel(countedAt)}, before the end of {day}. Sales later that day are in the books but were still on the shelf when counted, so they can show as extra stock.");
        }
        if (s.Lines.Count == 0) issues.Add("Add at least one counted SKU.");
        foreach (var line in lines.Where(l => l.CountedSellable is null && (l.BookSellable + l.BookUnsellable + l.OpenSurplusBefore) > 0))
            issues.Add($"{line.Sku}: count this SKU too. The books expect {line.ExpectedSellable} sellable and {line.ExpectedUnsellable} unsellable.");
        // The tagged units in custody must match the SKU stock before a close can be trusted.
        var position = await StockPositionAsync(s.MerchantBranchId, ct);
        foreach (var sku in position.Skus.Where(x => !x.TieOutBalanced && x.UntrackedUnits == 0))
            issues.Add($"{sku.Sku}: the SKU stock doesn't match the tagged units in custody. Review recent returns and handovers first.");
        if (await db.ConsignmentSalesReports.AnyAsync(r => r.MerchantBranchId == s.MerchantBranchId
                && r.Status == ConsignmentSalesReportStatus.Disputed && r.PeriodStart < s.CutoffAt
                && !db.ConsignmentSalesReports.Any(x => x.SupersedesReportId == r.Id && x.Status != ConsignmentSalesReportStatus.Voided), ct))
            warnings.Add("A disputed sales report in this month isn't in the books. Its correction will be posted to a later month.");
        foreach (var l in lines.Where(l => l.CountedSellable is not null))
        {
            var found = new List<string>();
            if (l.Shortage > 0) found.Add($"{l.Shortage} short, held under investigation");
            if (l.UnsellableShortage > 0) found.Add($"{l.UnsellableShortage} unsellable missing, held under investigation");
            if (l.UnsellableFound > 0) found.Add($"{l.UnsellableFound} damaged or opened, moved to unsellable and investigated");
            if (l.Surplus > 0) found.Add($"{l.Surplus} more than the books, noted for investigation without adding stock");
            if (l.SurplusNoLongerPresent > 0) found.Add($"{l.SurplusNoLongerPresent} earlier surplus no longer present");
            if (found.Count > 0) warnings.Add($"{l.Sku}: {string.Join("; ", found)}.");
        }
        return (issues, warnings);
    }

    // --- Writes ---------------------------------------------------------------------------

    public async Task<ConsignmentStocktakeResponse> CreateStocktakeAsync(Guid? actor, SaveConsignmentStocktakeRequest r, CancellationToken ct)
    {
        var key = Trim(r.IdempotencyKey) ?? Guid.NewGuid().ToString("N");
        if (key.Length > 80) throw Bad("Use a shorter submission reference.");
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            var replay = await db.ConsignmentStocktakes.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.IdempotencyKey == key, ct);
            if (replay is not null)
            {
                saved = replay.Id;
                if (SameStocktake(StoredStocktake(replay), r)) return;
                throw new ApiException(409, "submission_changed",
                    "This stocktake was already saved with different values. Open the saved stocktake and check it before making changes.");
            }
            var stocktake = new ConsignmentStocktake { CreatedByAdminUserId = admin, Status = ConsignmentStocktakeStatus.Draft, IdempotencyKey = key };
            await ApplyStocktakeAsync(stocktake, r, ct);
            db.ConsignmentStocktakes.Add(stocktake); saved = stocktake.Id;
            await AddContributorAsync(StocktakeSubject, stocktake.Id, admin, "Created", ct);
            audit.Append(admin, ActorType.Admin, "consignment.stocktake-created", StocktakeSubject, stocktake.Id, null,
                new { stocktake.MerchantBranchId, countDate = CountDateOf(stocktake.CutoffAt), lines = stocktake.Lines.Count });
        }, ct);
        return await StocktakeAsync(saved, true, ct);
    }

    public async Task<ConsignmentStocktakeResponse> UpdateStocktakeAsync(Guid? actor, Guid id, string? token, SaveConsignmentStocktakeRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentStocktakes.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(s.RowVersion, token);
            if (s.Status != ConsignmentStocktakeStatus.Draft) throw Conflict("Only a draft stocktake can be edited. Discard a recorded one and count again.");
            if (r.MerchantBranchId != s.MerchantBranchId) throw Conflict("A stocktake keeps its branch.");
            var stored = await db.ConsignmentStocktakeLines.AsNoTracking().Where(l => l.StocktakeId == s.Id).ToListAsync(ct);
            if (SameStocktake(StoredStocktake(s, stored), r)) return;
            await db.ConsignmentStocktakeLines.Where(l => l.StocktakeId == s.Id).ExecuteDeleteAsync(ct);
            await ApplyStocktakeAsync(s, r, ct);
            db.Entry(s).Property(x => x.UpdatedAt).IsModified = true;
            await AddContributorAsync(StocktakeSubject, s.Id, admin, "Edited", ct);
            audit.Append(admin, ActorType.Admin, "consignment.stocktake-edited", StocktakeSubject, s.Id, null,
                new { countDate = CountDateOf(s.CutoffAt), lines = s.Lines.Count });
        }, ct);
        return await StocktakeAsync(id, true, ct);
    }

    public async Task<ConsignmentStocktakeResponse> RecordStocktakeAsync(Guid? actor, Guid id, ConsignmentTokenRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentStocktakes.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(s.RowVersion, r.ConcurrencyToken);
            if (s.Status != ConsignmentStocktakeStatus.Draft) throw Conflict("Only a draft stocktake can be recorded.");
            if (s.EvidenceReference.Trim().Length < 5) throw Bad("Record where the count came from, for example the photo of the count sheet and who sent it.");
            if (s.Lines.Count == 0) throw Bad("Add at least one counted SKU before recording the stocktake.");
            s.Status = ConsignmentStocktakeStatus.Recorded; s.RecordedByAdminUserId = admin; s.RecordedAt = time.GetUtcNow();
            await AddContributorAsync(StocktakeSubject, s.Id, admin, "Recorded", ct);
            audit.Append(admin, ActorType.Admin, "consignment.stocktake-recorded", StocktakeSubject, s.Id, null,
                new { countDate = CountDateOf(s.CutoffAt), lines = s.Lines.Count });
        }, ct);
        return await StocktakeAsync(id, true, ct);
    }

    /// <summary>Discards a count that hasn't closed a month. It stays in history and moves no stock.</summary>
    public async Task<ConsignmentStocktakeResponse> VoidStocktakeAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length < 10) throw Bad("Explain why this count is being discarded (at least 10 characters).");
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentStocktakes.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(s.RowVersion, r.ConcurrencyToken);
            if (s.Status is not (ConsignmentStocktakeStatus.Draft or ConsignmentStocktakeStatus.Recorded))
                throw Conflict("Only a stocktake that hasn't closed its month can be discarded.");
            var before = s.Status;
            s.Status = ConsignmentStocktakeStatus.Voided;
            audit.Append(admin, ActorType.Admin, "consignment.stocktake-voided", StocktakeSubject, s.Id, new { status = before.ToString() }, new { reason });
        }, ct);
        return await StocktakeAsync(id, false, ct);
    }

    /// <summary>
    /// Closes the month (design §6.2): in one transaction, freezes every line with its books at the
    /// cutoff, posts each finding to the ledger exactly once, opens discrepancies, settles surplus
    /// notes the count no longer finds, and marks Summary-evidence report lines corroborated where
    /// the count matched. The closing position is the next month's opening; nothing is re-dispatched,
    /// reserved or rescanned, and no ConsignmentUnit changes.
    /// </summary>
    public async Task<ConsignmentStocktakeResponse> ApproveStocktakeAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentStocktakes.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(s.RowVersion, r.ConcurrencyToken);
            if (s.Status != ConsignmentStocktakeStatus.Recorded) throw Conflict("Only a recorded stocktake can close its month.");
            var preview = await StocktakeLinesAsync(s.MerchantBranchId, s.CutoffAt, s.Lines, ct);
            // Checked first and as a conflict: the books or notes moved on after the count, so reviewing it again can't help.
            if ((await HistoricalNoteIssuesAsync(s.MerchantBranchId, s.CutoffAt, ct)) is [var historical, ..])
                throw new ApiException(409, HistoricalCountIncompatible, historical);
            var (issues, warnings) = await AssessStocktakeAsync(s, preview, ct);
            if (issues.Count > 0) throw Bad(issues[0]);
            if (warnings.Count > 0 && !r.AcknowledgeWarnings)
                throw new ApiException(409, "warnings_unacknowledged", "Review and acknowledge what this count found before closing the month: " + string.Join(" ", warnings));
            // An acknowledgement covers only the figures that were reviewed.
            if ((warnings.Count > 0 || r.ReviewedFingerprint is not null)
                    && !string.Equals(r.ReviewedFingerprint?.Trim(), ReviewFingerprint(preview, warnings), StringComparison.Ordinal))
                throw new ApiException(409, "review_outdated",
                    "The books or this count's findings changed since they were reviewed. Reload the stocktake and review what it found before closing the month.");
            if (!s.ContributorHistoryComplete)
                await RequireSoloForUnknownHistoryAsync("Earlier edits to this stocktake weren't recorded, so nobody can close it as an independent reviewer. Discard it and count again.", ct);
            var self = !s.ContributorHistoryComplete || await ContributedAsync(StocktakeSubject, [s.Id], admin, ct);
            var review = await ReviewCore(admin, self, "close-stocktake", $"Stocktake {CountDateOf(s.CutoffAt)}", r.SelfReview,
                Trim(r.Reason) ?? "Monthly stocktake approved", s.EvidenceReference, null, null, StocktakeSubject, s.Id, ct);
            if (self && !string.Equals(r.SelfReview!.ExternalEvidenceReference.Trim(), s.EvidenceReference.Trim(), StringComparison.OrdinalIgnoreCase))
                throw Bad("Self-review must reference the count evidence recorded on this stocktake.");

            var now = time.GetUtcNow();
            var effective = s.CutoffAt.AddTicks(-1);
            var books = await BooksAtAsync(s.MerchantBranchId, s.CutoffAt, ct);
            // Equal to the notes open now: any later change was refused above.
            var (surplus, _) = await SurplusAtCutoffAsync(s.MerchantBranchId, s.CutoffAt, ct);
            var cleanSkus = new HashSet<Guid>();
            await PostTogetherAsync(async () => {
                foreach (var line in s.Lines.OrderBy(l => l.SkuSnapshot))
                {
                    var plan = PlanStocktake(books.GetValueOrDefault(line.ProductVariantId) ?? new BookFigures(0, 0, 0, 0, 0),
                        surplus.GetValueOrDefault(line.ProductVariantId), line.CountedSellable, line.CountedUnsellable);
                    async Task Post(int quantity, ConsignmentStockBucket from, ConsignmentStockBucket to, string type)
                    {
                        if (quantity > 0)
                            await PostLedgerAsync(new(s.MerchantId, s.MerchantBranchId, line.ProductVariantId, line.SkuSnapshot, from, to, quantity,
                                type, ConsignmentLedgerSources.StocktakeLine, line.Id, effective), admin, ct);
                    }
                    await Post(plan.UnsellableFound, ConsignmentStockBucket.Sellable, ConsignmentStockBucket.Unsellable, ConsignmentLedgerEntryTypes.StocktakeUnsellableFound);
                    await Post(plan.UnsellableShortage, ConsignmentStockBucket.Unsellable, ConsignmentStockBucket.Investigation, ConsignmentLedgerEntryTypes.StocktakeUnsellableShortage);
                    await Post(plan.Shortage, ConsignmentStockBucket.Sellable, ConsignmentStockBucket.Investigation, ConsignmentLedgerEntryTypes.StocktakeShortage);
                    // Surplus noted earlier that the count no longer finds: settled oldest first, no posting.
                    var toClear = plan.SurplusNoLongerPresent;
                    foreach (var note in await db.ConsignmentStockDiscrepancies.Where(d => d.MerchantBranchId == s.MerchantBranchId
                            && d.ProductVariantId == line.ProductVariantId && d.Kind == ConsignmentDiscrepancyKind.Surplus
                            && d.Status == ConsignmentDiscrepancyStatus.Open).OrderBy(d => d.CreatedAt).ThenBy(d => d.Id).ToListAsync(ct))
                    {
                        if (toClear == 0) break;
                        var q = Math.Min(toClear, note.OpenQuantity); toClear -= q;
                        SettleDiscrepancy(note, q, NoLongerPresent, $"Not found in the count of {CountDateOf(s.CutoffAt)}", s.EvidenceReference,
                            admin, review, null, null);
                    }
                    Open(ConsignmentDiscrepancyKind.UnsellableFound, plan.UnsellableFound);
                    Open(ConsignmentDiscrepancyKind.UnsellableShortage, plan.UnsellableShortage);
                    Open(ConsignmentDiscrepancyKind.Shortage, plan.Shortage);
                    Open(ConsignmentDiscrepancyKind.Surplus, plan.Surplus);
                    void Open(ConsignmentDiscrepancyKind kind, int quantity)
                    {
                        if (quantity <= 0) return;
                        db.ConsignmentStockDiscrepancies.Add(new ConsignmentStockDiscrepancy { MerchantId = s.MerchantId, MerchantBranchId = s.MerchantBranchId,
                            ProductVariantId = line.ProductVariantId, SkuSnapshot = line.SkuSnapshot, OriginStocktakeId = s.Id, OriginStocktakeLineId = line.Id,
                            Kind = kind, Quantity = quantity, OpenQuantity = quantity, Status = ConsignmentDiscrepancyStatus.Open });
                    }
                    if (!plan.Variance) cleanSkus.Add(line.ProductVariantId);
                    line.FrozenAt = now; line.BookSellable = plan.Book.Sellable; line.BookUnsellable = plan.Book.Unsellable;
                    line.BookInvestigation = plan.Book.Investigation; line.BookSold = plan.Book.Sold; line.BookLost = plan.Book.Lost;
                    line.OpenSurplusBefore = plan.OpenSurplusBefore; line.UnsellableFound = plan.UnsellableFound;
                    line.UnsellableShortage = plan.UnsellableShortage; line.Shortage = plan.Shortage; line.Surplus = plan.Surplus;
                    line.SurplusNoLongerPresent = plan.SurplusNoLongerPresent; line.ClosingSellable = plan.ClosingSellable;
                    line.ClosingUnsellable = plan.ClosingUnsellable; line.ClosingInvestigation = plan.ClosingInvestigation;
                    line.ClosingSold = plan.Book.Sold; line.ClosingLost = plan.Book.Lost; line.OpenSurplusAfter = plan.OpenSurplusAfter;
                }
            }, ct);

            // Summary-evidence sales in this month are corroborated where the count found no variance.
            var previous = await LastClosedCutoffAsync(s.MerchantBranchId, ct);
            var clean = cleanSkus.ToArray();
            foreach (var reportLine in await db.ConsignmentSalesReportLines.Where(l => l.SalesReport.MerchantBranchId == s.MerchantBranchId
                    && l.SalesReport.Status == ConsignmentSalesReportStatus.Verified && l.SalesReport.EvidenceLevel == ConsignmentEvidenceLevel.Summary
                    && l.SalesReport.PeriodEndExclusive <= s.CutoffAt && (previous == null || l.SalesReport.PeriodStart >= previous)
                    && l.CorroboratedByStocktakeId == null && clean.Contains(l.ProductVariantId)).ToListAsync(ct))
                reportLine.CorroboratedByStocktakeId = s.Id;

            s.PreviousStocktakeId = await db.ConsignmentStocktakes.Where(x => x.MerchantBranchId == s.MerchantBranchId
                && x.Status == ConsignmentStocktakeStatus.Approved).OrderByDescending(x => x.CutoffAt).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
            s.Status = ConsignmentStocktakeStatus.Approved; s.ApprovedByAdminUserId = admin; s.ApprovedAt = now; s.ReviewMode = review.ReviewMode;
            audit.Append(admin, ActorType.Admin, "consignment.stocktake-approved", StocktakeSubject, s.Id, null,
                new { countDate = CountDateOf(s.CutoffAt), review.ReviewMode, warnings });
        }, ct);
        return await StocktakeAsync(id, false, ct);
    }

    private void SettleDiscrepancy(ConsignmentStockDiscrepancy d, int quantity, string outcome, string reason, string evidence, Guid admin,
        ConsignmentReviewEvent? review, Guid? linkedReport, Guid? related, Guid? resolutionId = null)
    {
        d.OpenQuantity -= quantity;
        if (d.OpenQuantity == 0) d.Status = ConsignmentDiscrepancyStatus.Resolved;
        db.ConsignmentDiscrepancyResolutions.Add(new ConsignmentDiscrepancyResolution { Id = resolutionId ?? Guid.NewGuid(), DiscrepancyId = d.Id, Outcome = outcome, Quantity = quantity,
            EvidenceReference = evidence, Reason = reason, LinkedSalesReportId = linkedReport, RelatedDiscrepancyId = related,
            ReviewEventId = review?.Id, ReviewMode = review?.ReviewMode, ActorAdminUserId = admin, RecordedAt = time.GetUtcNow() });
    }

    // --- Discrepancies ----------------------------------------------------------------------

    public async Task<IReadOnlyList<ConsignmentDiscrepancyResponse>> DiscrepanciesAsync(Guid? branchId, string? status, CancellationToken ct)
    {
        var q = db.ConsignmentStockDiscrepancies.AsNoTracking().Include(d => d.Resolutions).AsQueryable();
        if (branchId.HasValue) q = q.Where(d => d.MerchantBranchId == branchId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var parsed = ParseEnum<ConsignmentDiscrepancyStatus>(status, "Choose open or resolved.");
            q = q.Where(d => d.Status == parsed);
        }
        var rows = await q.OrderBy(d => d.Status).ThenByDescending(d => d.CreatedAt).ThenBy(d => d.SkuSnapshot).ThenBy(d => d.Id).Take(500).ToListAsync(ct);
        var origins = rows.Select(d => d.OriginStocktakeId).Distinct().ToArray();
        var cutoffs = await db.ConsignmentStocktakes.AsNoTracking().Where(s => origins.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.CutoffAt, ct);
        var names = await BranchNamesAsync(rows.Select(d => d.MerchantBranchId), ct);
        return rows.Select(d => MapDiscrepancy(d, names[d.MerchantBranchId], cutoffs[d.OriginStocktakeId])).ToArray();
    }

    private static ConsignmentDiscrepancyResponse MapDiscrepancy(ConsignmentStockDiscrepancy d, (string Merchant, string Branch) name, DateTimeOffset cutoff) =>
        new(d.Id, d.MerchantId, name.Merchant, d.MerchantBranchId, name.Branch, d.ProductVariantId, d.SkuSnapshot, d.OriginStocktakeId,
            CountDateOf(cutoff), d.Kind.ToString(), d.Quantity, d.OpenQuantity, d.Status.ToString(),
            d.Status == ConsignmentDiscrepancyStatus.Open ? Outcomes[d.Kind].Keys.ToArray() : [],
            d.Resolutions.OrderBy(x => x.RecordedAt).ThenByDescending(x => x.ReversesResolutionId.HasValue).ThenBy(x => x.Id).Select(x => new ConsignmentDiscrepancyResolutionResponse(x.Id,
                x.Outcome, x.Quantity, x.EvidenceReference, x.Reason, x.LinkedSalesReportId, x.RelatedDiscrepancyId, x.ReviewMode, x.ActorAdminUserId,
                x.RecordedAt) { ReversesResolutionId = x.ReversesResolutionId }).ToArray(),
            d.CreatedAt, Convert.ToBase64String(d.RowVersion)) { OriginCutoffAt = cutoff };

    /// <summary>
    /// Settles part or all of a discrepancy with evidence (design §6.4). The quantity is limited by the
    /// discrepancy's open quantity, and any movement by its source bucket. Whoever counted, edited or
    /// recorded a stocktake behind any discrepancy this settles isn't independent of it, and the
    /// evidence must be new: what a count found can't also show what became of it.
    /// </summary>
    public async Task<ConsignmentDiscrepancyResponse> ResolveDiscrepancyAsync(Guid? actor, Guid id, ResolveConsignmentDiscrepancyRequest r, CancellationToken ct)
    {
        var evidence = Trim(r.EvidenceReference);
        var reason = Trim(r.Reason);
        if (evidence is null || evidence.Length < 5) throw Bad("Record the evidence for this outcome (at least 5 characters).");
        if (reason is null || reason.Length < 10) throw Bad("Explain the outcome (at least 10 characters).");
        await RunAsync(actor, async admin => {
            var d = await db.ConsignmentStockDiscrepancies.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(d.RowVersion, r.ConcurrencyToken);
            if (d.Status != ConsignmentDiscrepancyStatus.Open) throw Conflict("This discrepancy is already resolved.");
            var outcome = Outcomes[d.Kind].Keys.FirstOrDefault(k => string.Equals(k, r.Outcome?.Trim(), StringComparison.OrdinalIgnoreCase))
                ?? throw Bad("Choose an outcome that fits this discrepancy.");
            if (r.Quantity < 1 || r.Quantity > d.OpenQuantity) throw Bad($"Choose a quantity from 1 to {d.OpenQuantity}.");
            if (outcome == "ApprovedLoss") await RequireLossConfirmedAsync(d, ct);
            ConsignmentStockDiscrepancy? related = null;
            if (outcome == "EarlierShortageFound")
            {
                related = await db.ConsignmentStockDiscrepancies.SingleOrDefaultAsync(x => x.Id == r.RelatedDiscrepancyId
                    && x.MerchantBranchId == d.MerchantBranchId && x.ProductVariantId == d.ProductVariantId
                    && x.Kind == ConsignmentDiscrepancyKind.Shortage && x.Status == ConsignmentDiscrepancyStatus.Open, ct)
                    ?? throw Bad("Choose the open shortage of this SKU at this branch that the surplus came from.");
                if (r.Quantity > related.OpenQuantity) throw Bad($"That shortage has only {related.OpenQuantity} open.");
            }
            else if (r.RelatedDiscrepancyId is not null) throw Bad("Only an earlier shortage found can refer to another discrepancy.");

            // Settling an earlier shortage through a surplus decides both, so independence covers both counts.
            var origins = new[] { d.OriginStocktakeId, related?.OriginStocktakeId ?? d.OriginStocktakeId }.Distinct().ToArray();
            await RequireNewEvidenceAsync(origins, evidence, ct);
            var self = await StocktakeContributorAsync(origins, admin, ct);
            var review = await ReviewCore(admin, self, "resolve-stock-discrepancy",
                $"{d.SkuSnapshot} {d.Kind} {outcome} {r.Quantity}", r.SelfReview, reason, evidence, null, null, DiscrepancySubject, d.Id, ct);
            if (self && !SameEvidence(r.SelfReview!.ExternalEvidenceReference, evidence))
                throw Bad("Self-review must reference the evidence recorded for this outcome.");

            var resolutionId = Guid.NewGuid();
            await PostTogetherAsync(async () => {
                if (Outcomes[d.Kind][outcome] is { } move)
                    await PostLedgerAsync(new(d.MerchantId, d.MerchantBranchId, d.ProductVariantId, d.SkuSnapshot, move.From, move.To, r.Quantity,
                        ConsignmentLedgerEntryTypes.DiscrepancyResolution, ConsignmentLedgerSources.Resolution, resolutionId, time.GetUtcNow()), admin, ct);
            }, ct);
            var before = d.OpenQuantity;
            SettleDiscrepancy(d, r.Quantity, outcome, reason, evidence, admin, review, null, related?.Id, resolutionId);
            if (related is not null)
                SettleDiscrepancy(related, r.Quantity, "FoundThroughSurplus", reason, evidence, admin,
                    JournalSubject(review, DiscrepancySubject, related.Id), null, d.Id);
            audit.Append(admin, ActorType.Admin, "consignment.stock-discrepancy-resolved", DiscrepancySubject, d.Id,
                new { openQuantity = before }, new { outcome, r.Quantity, d.OpenQuantity, related = related?.Id, review.ReviewMode });
        }, ct);
        var row = await db.ConsignmentStockDiscrepancies.AsNoTracking().Include(x => x.Resolutions).SingleAsync(x => x.Id == id, ct);
        var cutoff = await db.ConsignmentStocktakes.AsNoTracking().Where(s => s.Id == row.OriginStocktakeId).Select(s => s.CutoffAt).SingleAsync(ct);
        return MapDiscrepancy(row, (await BranchNamesAsync([row.MerchantBranchId], ct))[row.MerchantBranchId], cutoff);
    }

    /// <summary>
    /// A loss is approved only once a later count of this SKU at the branch has confirmed it is still
    /// missing, and no count since has found extra units of it that could be the missing ones.
    /// </summary>
    private async Task RequireLossConfirmedAsync(ConsignmentStockDiscrepancy d, CancellationToken ct)
    {
        var origin = await db.ConsignmentStocktakes.AsNoTracking().Where(s => s.Id == d.OriginStocktakeId).Select(s => s.CutoffAt).SingleAsync(ct);
        if (!await db.ConsignmentStocktakeLines.AsNoTracking().AnyAsync(l => l.ProductVariantId == d.ProductVariantId
                && l.Stocktake.MerchantBranchId == d.MerchantBranchId && l.Stocktake.Status == ConsignmentStocktakeStatus.Approved
                && l.Stocktake.CutoffAt > origin, ct))
            throw Conflict("A shortage can be approved as a loss only after a later stocktake of this SKU confirms it is still missing.");
        var later = db.ConsignmentStocktakes.Where(s => s.MerchantBranchId == d.MerchantBranchId && s.CutoffAt > origin).Select(s => s.Id);
        if (await db.ConsignmentStockDiscrepancies.AnyAsync(x => x.MerchantBranchId == d.MerchantBranchId && x.ProductVariantId == d.ProductVariantId
                && x.Kind == ConsignmentDiscrepancyKind.Surplus && x.Status == ConsignmentDiscrepancyStatus.Open && later.Contains(x.OriginStocktakeId), ct))
            throw Conflict("A later count found extra units of this SKU that may be the missing ones. Settle that surplus first.");
    }

    /// <summary>The evidence for an outcome must be new: a count's own evidence, or the review that closed it, shows only what it found.</summary>
    private async Task RequireNewEvidenceAsync(IReadOnlyCollection<Guid> stocktakes, string evidence, CancellationToken ct)
    {
        var earlier = await db.ConsignmentStocktakes.AsNoTracking().Where(s => stocktakes.Contains(s.Id)).Select(s => s.EvidenceReference).ToListAsync(ct);
        earlier.AddRange(await db.ConsignmentReviewEvents.AsNoTracking().Where(e => e.SubjectType == StocktakeSubject && e.SubjectId.HasValue
            && stocktakes.Contains(e.SubjectId.Value)).Select(e => e.ExternalEvidenceReference).ToListAsync(ct));
        if (earlier.Any(x => SameEvidence(x, evidence)))
            throw Bad("Record new evidence for this outcome. The count's own evidence shows what was missing or extra, not what became of it.");
    }

    /// <summary>
    /// Whether an admin counted, edited or recorded any of these stocktakes. A count whose edits weren't
    /// all recorded has no provably independent reviewer, so only a Solo self-review can settle it.
    /// </summary>
    private async Task<bool> StocktakeContributorAsync(IReadOnlyCollection<Guid> stocktakes, Guid admin, CancellationToken ct)
    {
        if (await db.ConsignmentStocktakes.AsNoTracking().AnyAsync(s => stocktakes.Contains(s.Id) && !s.ContributorHistoryComplete, ct))
        {
            await RequireSoloForUnknownHistoryAsync("Earlier edits to a count behind this weren't recorded, so nobody can review it as independent. Only a Solo self-review can settle it.", ct);
            return true;
        }
        return await ContributedAsync(StocktakeSubject, stocktakes, admin, ct);
    }

    /// <summary>Records one review decision against another subject it also settles, so every affected record names its review.</summary>
    private ConsignmentReviewEvent JournalSubject(ConsignmentReviewEvent review, string subjectType, Guid subjectId)
    {
        var row = new ConsignmentReviewEvent { AgreementId = review.AgreementId, DispatchId = review.DispatchId, Action = review.Action,
            ReviewMode = review.ReviewMode, PolicyMode = review.PolicyMode, PreviousPolicyMode = review.PreviousPolicyMode,
            SelfReviewerAdminUserId = review.SelfReviewerAdminUserId, PreviousSelfReviewerAdminUserId = review.PreviousSelfReviewerAdminUserId,
            RequestReference = review.RequestReference, PolicyVersion = review.PolicyVersion, ActorAdminUserId = review.ActorAdminUserId,
            RecordedAt = review.RecordedAt, Reason = review.Reason, ExternalEvidenceReference = review.ExternalEvidenceReference,
            SubjectType = subjectType, SubjectId = subjectId };
        db.ConsignmentReviewEvents.Add(row);
        audit.Append(review.ActorAdminUserId, ActorType.Admin, review.ReviewMode == "Self-reviewed (Solo)" ? "consignment.solo-self-review" : "consignment.independent-review",
            subjectType, subjectId, null, MapReview(row));
        return row;
    }

    // --- Late reports ------------------------------------------------------------------------

    private sealed record LateCandidate(ConsignmentStockDiscrepancy Discrepancy, int OpenQuantity);
    private sealed record LateSku(Guid VariantId, string Sku, int Change, ConsignmentDiscrepancyKind? Explains, List<LateCandidate> Candidates,
        List<ConsignmentDiscrepancyResolution> Withdrawn)
    {
        public int Capacity => Math.Abs(Change);
    }
    private sealed record LatePlan(ConsignmentStocktake ClosedBy, List<LateSku> Skus, List<ConsignmentDiscrepancyResolution> Withdrawn,
        Dictionary<Guid, ConsignmentStockDiscrepancy> Discrepancies);

    /// <summary>
    /// How a report for a month a stocktake has already closed relates to what that count found (null
    /// while its month is open). Only the first count after the report's period can have been affected,
    /// so only that count's discrepancies are candidates: a sale can't explain a count taken before it,
    /// or a later one that had already accounted for it. What the count couldn't see is the report's
    /// effect on the shelf less what its versions had posted while the month was still open. Nothing is
    /// linked automatically, and explanations by the versions it replaces are withdrawn when it is verified.
    /// </summary>
    private async Task<LatePlan?> LatePlanAsync(ConsignmentSalesReport report, IReadOnlyCollection<Guid> earlierVersions, CancellationToken ct)
    {
        var closedBy = await db.ConsignmentStocktakes.AsNoTracking().Where(s => s.MerchantBranchId == report.MerchantBranchId
                && s.Status == ConsignmentStocktakeStatus.Approved && s.CutoffAt >= report.PeriodEndExclusive)
            .OrderBy(s => s.CutoffAt).FirstOrDefaultAsync(ct);
        if (closedBy is null) return null;
        var versions = earlierVersions.ToArray();
        var withdrawn = await db.ConsignmentDiscrepancyResolutions.AsNoTracking().Where(x => x.Outcome == LateReportExplained
                && x.LinkedSalesReportId.HasValue && versions.Contains(x.LinkedSalesReportId.Value)
                && !db.ConsignmentDiscrepancyResolutions.Any(w => w.ReversesResolutionId == x.Id))
            .OrderBy(x => x.RecordedAt).ThenBy(x => x.Id).ToListAsync(ct);
        var withdrawnIds = withdrawn.Select(w => w.DiscrepancyId).Distinct().ToArray();
        var discrepancies = await db.ConsignmentStockDiscrepancies.AsNoTracking().Where(d => d.MerchantBranchId == report.MerchantBranchId
                && (d.OriginStocktakeId == closedBy.Id && d.Status == ConsignmentDiscrepancyStatus.Open || withdrawnIds.Contains(d.Id)))
            .OrderBy(d => d.CreatedAt).ThenBy(d => d.Id).ToDictionaryAsync(d => d.Id, ct);
        var lineIds = await db.ConsignmentSalesReportLines.AsNoTracking().Where(l => versions.Contains(l.SalesReportId)).Select(l => l.Id).ToListAsync(ct);
        var seen = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.SourceType == ConsignmentLedgerSources.SalesLine
                && lineIds.Contains(e.SourceLineId) && !e.IsPriorPeriodCorrection)
            .Select(e => new { e.ProductVariantId, e.FromBucket, e.ToBucket, e.Quantity }).ToListAsync(ct);
        var skus = new List<LateSku>();
        foreach (var variant in report.Lines.Select(l => l.ProductVariantId).Concat(withdrawn.Select(w => discrepancies[w.DiscrepancyId].ProductVariantId)).Distinct())
        {
            var sku = report.Lines.FirstOrDefault(l => l.ProductVariantId == variant)?.SkuSnapshot
                ?? discrepancies.Values.First(d => d.ProductVariantId == variant).SkuSnapshot;
            var counted = seen.Where(e => e.ProductVariantId == variant).Sum(e => (e.ToBucket == ConsignmentStockBucket.Sellable ? e.Quantity : 0)
                - (e.FromBucket == ConsignmentStockBucket.Sellable ? e.Quantity : 0));
            var change = ShelfChange(report.Lines, variant) - counted;
            ConsignmentDiscrepancyKind? kind = change < 0 ? ConsignmentDiscrepancyKind.Shortage : change > 0 ? ConsignmentDiscrepancyKind.Surplus : null;
            var candidates = discrepancies.Values.Where(d => d.OriginStocktakeId == closedBy.Id && d.ProductVariantId == variant && d.Kind == kind)
                .Select(d => new LateCandidate(d, d.OpenQuantity + withdrawn.Where(w => w.DiscrepancyId == d.Id).Sum(w => w.Quantity)))
                .Where(c => c.OpenQuantity > 0).ToList();
            skus.Add(new(variant, sku, change, kind, candidates, withdrawn.Where(w => discrepancies[w.DiscrepancyId].ProductVariantId == variant).ToList()));
        }
        return new(closedBy, skus, withdrawn, discrepancies);
    }

    private static ConsignmentLateReportResponse MapLatePlan(LatePlan plan, IReadOnlyDictionary<Guid, int> requiredLinks) =>
        new(plan.ClosedBy.Id, CountDateOf(plan.ClosedBy.CutoffAt), plan.ClosedBy.CutoffAt, plan.Skus.Select(x => new ConsignmentLateSkuResponse(
            x.VariantId, x.Sku, x.Change, x.Explains?.ToString(), x.Capacity,
            x.Candidates.Select(c => new ConsignmentLateCandidateResponse(c.Discrepancy.Id, c.Discrepancy.Kind.ToString(), plan.ClosedBy.Id,
                CountDateOf(plan.ClosedBy.CutoffAt), plan.ClosedBy.CutoffAt, c.Discrepancy.Quantity, c.OpenQuantity)).ToArray(),
            x.Withdrawn.Select(w => new ConsignmentLateAllocationResponse(w.Id, w.DiscrepancyId, plan.Discrepancies[w.DiscrepancyId].Kind.ToString(),
                w.LinkedSalesReportId!.Value, w.Quantity)).ToArray()) { RequiredLinks = requiredLinks.GetValueOrDefault(x.VariantId) }).ToArray());

    /// <summary>
    /// Checks a reviewer's links between a late report and what the count found: each must be a
    /// candidate, within its open quantity, with its own evidence and explanation, and together no
    /// more than the shelf change the count couldn't see. The count sheet itself never proves a link.
    /// </summary>
    private static List<ConsignmentLateAllocationRequest> CheckAllocations(LatePlan? plan, IReadOnlyList<ConsignmentLateAllocationRequest>? requested)
    {
        var list = (requested ?? []).ToList();
        if (list.Count == 0) return list;
        if (plan is null) throw Bad("No stocktake has closed this report's month, so there is nothing for it to explain.");
        if (list.Count > 60 || list.Select(a => a.DiscrepancyId).Distinct().Count() != list.Count) throw Bad("Link each discrepancy once.");
        var date = CountDayLabel(plan.ClosedBy.CutoffAt);
        foreach (var a in list)
        {
            var sku = plan.Skus.FirstOrDefault(x => x.Candidates.Any(c => c.Discrepancy.Id == a.DiscrepancyId))
                ?? throw Bad($"This report can only explain what the count of {date}, the first count after its period, found for the same SKU at this branch: "
                    + "missing units for its sales, extra units for its restocked returns.");
            var c = sku.Candidates.Single(c => c.Discrepancy.Id == a.DiscrepancyId);
            if (a.Quantity < 1 || a.Quantity > c.OpenQuantity) throw Bad($"{sku.Sku}: choose 1 to {c.OpenQuantity} for the count of {date}.");
            var evidence = Trim(a.EvidenceReference);
            if (evidence is null || evidence.Length < 5)
                throw Bad($"{sku.Sku}: record the evidence that links this report to what the count found (at least 5 characters).");
            if (Trim(a.Explanation) is not { Length: >= 10 })
                throw Bad($"{sku.Sku}: explain why this report accounts for what the count found (at least 10 characters).");
            if (evidence.Length > 1000 || a.Explanation!.Trim().Length > 1000) throw Bad($"{sku.Sku}: shorten the evidence or explanation.");
            if (SameEvidence(evidence, plan.ClosedBy.EvidenceReference))
                throw Bad($"{sku.Sku}: the count's own evidence shows what was missing or extra, not why. Record what links it to this report, for example the dated sale or return record.");
        }
        foreach (var sku in plan.Skus)
        {
            var total = list.Where(a => sku.Candidates.Any(c => c.Discrepancy.Id == a.DiscrepancyId)).Sum(a => a.Quantity);
            if (total > sku.Capacity)
                throw Bad($"{sku.Sku}: this report changes the shelf by {sku.Capacity} that the count of {date} couldn't have seen, so it can explain at most {sku.Capacity}.");
        }
        return list;
    }

    /// <summary>
    /// Verifying a late report, in its transaction: withdraws the explanations of the versions it replaces
    /// (compensating entries reopen their quantity and reverse their movement), then records the
    /// reviewer's links. Units sold before the count were never missing, so an explained shortage leaves
    /// Investigation as the sale leaves Sellable; an explained surplus is the restock the report posts.
    /// The closed month's snapshot is never touched.
    /// </summary>
    private async Task ApplyLateReportAsync(ConsignmentSalesReport report, LatePlan plan, IReadOnlyList<ConsignmentLateAllocationRequest> allocations,
        ConsignmentReviewEvent review, Guid admin, CancellationToken ct)
    {
        var ids = plan.Withdrawn.Select(w => w.DiscrepancyId).Concat(allocations.Select(a => a.DiscrepancyId)).Distinct().ToArray();
        var tracked = await db.ConsignmentStockDiscrepancies.Where(d => ids.Contains(d.Id)).ToDictionaryAsync(d => d.Id, ct);
        var version = $"{report.PartnerReference} v{report.Version}";
        foreach (var w in plan.Withdrawn)
        {
            var d = tracked[w.DiscrepancyId];
            var explained = await db.ConsignmentStockLedgerEntries.AsNoTracking().SingleOrDefaultAsync(e => e.SourceType == ConsignmentLedgerSources.Resolution
                && e.SourceLineId == w.Id && e.EntryType == ConsignmentLedgerEntryTypes.LateReportExplainsShortage && e.ReversesEntryId == null, ct);
            if (explained is not null) await ReverseLedgerAsync(explained, admin, ct);
            d.OpenQuantity += w.Quantity; d.Status = ConsignmentDiscrepancyStatus.Open;
            db.ConsignmentDiscrepancyResolutions.Add(new ConsignmentDiscrepancyResolution { DiscrepancyId = d.Id, Outcome = LateReportWithdrawn,
                Quantity = w.Quantity, EvidenceReference = report.EvidenceReference, LinkedSalesReportId = report.Id, ReversesResolutionId = w.Id,
                Reason = $"{version} replaces the version that explained this, so the quantity is open again", ReviewEventId = review.Id,
                ReviewMode = review.ReviewMode, ActorAdminUserId = admin, RecordedAt = time.GetUtcNow() });
            audit.Append(admin, ActorType.Admin, "consignment.late-report-explanation-withdrawn", DiscrepancySubject, d.Id,
                new { openQuantity = d.OpenQuantity - w.Quantity }, new { resolution = w.Id, report = report.Id, w.Quantity, d.OpenQuantity });
        }
        foreach (var a in allocations)
        {
            var d = tracked[a.DiscrepancyId];
            var resolutionId = Guid.NewGuid();
            if (d.Kind == ConsignmentDiscrepancyKind.Shortage)
                await PostLedgerAsync(new(report.MerchantId, report.MerchantBranchId, d.ProductVariantId, d.SkuSnapshot, ConsignmentStockBucket.Investigation,
                    ConsignmentStockBucket.Sellable, a.Quantity, ConsignmentLedgerEntryTypes.LateReportExplainsShortage, ConsignmentLedgerSources.Resolution,
                    resolutionId, report.PeriodEndExclusive.AddTicks(-1)), admin, ct);
            var before = d.OpenQuantity;
            SettleDiscrepancy(d, a.Quantity, LateReportExplained, a.Explanation!.Trim(), a.EvidenceReference!.Trim(), admin,
                JournalSubject(review, DiscrepancySubject, d.Id), report.Id, null, resolutionId);
            audit.Append(admin, ActorType.Admin, "consignment.late-report-explained", DiscrepancySubject, d.Id,
                new { openQuantity = before }, new { report = report.Id, a.Quantity, d.OpenQuantity, review.ReviewMode });
        }
    }

    /// <summary>A set of report lines' effect on one SKU's shelf stock: restocked returns minus sales.</summary>
    private static int ShelfChange(IEnumerable<ConsignmentSalesReportLine> lines, Guid variant) =>
        lines.Where(l => l.ProductVariantId == variant)
            .Sum(l => l.LineType == ConsignmentSalesLineType.Sale ? -l.Quantity : l.RestockableQuantity);

    // --- Submission content ----------------------------------------------------------------

    private sealed record StocktakeHeaderValues(Guid BranchId, string CountDate, string CountedBy, string EvidenceKind, string EvidenceReference, string? Notes,
        DateTimeOffset? CountedAt, string? CountedAfterCutoffNote);
    private sealed record StocktakeLineValues(Guid VariantId, int CountedSellable, int CountedUnsellable, string? Notes);

    private static bool SameStocktake(SaveConsignmentStocktakeRequest a, SaveConsignmentStocktakeRequest b)
    {
        static StocktakeHeaderValues Header(SaveConsignmentStocktakeRequest r) => new(r.MerchantBranchId, r.CountDate?.Trim() ?? "",
            r.CountedBy?.Trim() ?? "", (r.EvidenceKind?.Trim() ?? "").ToUpperInvariant(), Trim(r.EvidenceReference) ?? "", Trim(r.Notes),
            r.CountedAt?.ToUniversalTime(), Trim(r.CountedAfterCutoffNote));
        static StocktakeLineValues[] Lines(SaveConsignmentStocktakeRequest r) => (r.Lines ?? [])
            .Select(l => new StocktakeLineValues(l.ProductVariantId, l.CountedSellable, l.CountedUnsellable, Trim(l.Notes)))
            .OrderBy(l => l.VariantId).ThenBy(l => l.CountedSellable).ThenBy(l => l.CountedUnsellable).ThenBy(l => l.Notes, StringComparer.Ordinal).ToArray();
        return Header(a) == Header(b) && Lines(a).SequenceEqual(Lines(b));
    }

    private static SaveConsignmentStocktakeRequest StoredStocktake(ConsignmentStocktake s, IEnumerable<ConsignmentStocktakeLine>? lines = null) =>
        new(s.MerchantBranchId, CountDateOf(s.CutoffAt), s.CountedBy, s.EvidenceKind, s.EvidenceReference, s.Notes,
            (lines ?? s.Lines).Select(l => new ConsignmentStocktakeLineRequest(l.ProductVariantId, l.CountedSellable, l.CountedUnsellable, l.Notes)).ToArray(),
            null, s.CountedAt, s.CountedAfterCutoffNote);

    private async Task ApplyStocktakeAsync(ConsignmentStocktake s, SaveConsignmentStocktakeRequest r, CancellationToken ct)
    {
        var branch = await db.MerchantBranches.SingleOrDefaultAsync(b => b.Id == r.MerchantBranchId, ct) ?? throw Bad("Choose the partner branch that was counted.");
        var cutoff = StocktakeCutoff(r.CountDate);
        if (cutoff > time.GetUtcNow().AddDays(1)) throw Bad("A count date can't be in the future.");
        var afterCutoffNote = r.CountedAt >= cutoff ? Trim(r.CountedAfterCutoffNote) : null;
        if (afterCutoffNote?.Length > 1000) throw Bad("Shorten the explanation of the count time.");
        CheckCountTiming(cutoff, r.CountedAt, afterCutoffNote, time.GetUtcNow());
        if (await MovementsAfterCutoffAsync(branch.Id, cutoff, r.CountedAt!.Value, ct) is > 0 and var moved)
            throw Bad($"{moved} stock {(moved == 1 ? "movement was" : "movements were")} recorded at this branch between the end of {CountDayLabel(cutoff)} and the count, "
                + "so the count can't be compared with the books at the end of the count date. Count again on the next count date.");
        if (await LastClosedCutoffAsync(branch.Id, ct) is { } closed && cutoff <= closed)
            throw Conflict($"The month to {CountDateOf(closed)} is already closed. Count a later date.");
        if (await db.ConsignmentStocktakes.AnyAsync(x => x.Id != s.Id && x.MerchantBranchId == branch.Id
                && (x.Status == ConsignmentStocktakeStatus.Draft || x.Status == ConsignmentStocktakeStatus.Recorded), ct))
            throw Conflict("Another stocktake for this branch is still open. Finish or discard it first.");
        var countedBy = Trim(r.CountedBy) ?? throw Bad("Say who counted the stock.");
        if (countedBy.Length > 200 || r.EvidenceReference?.Trim().Length > 1000 || r.Notes?.Trim().Length > 2000)
            throw Bad("Shorten the counted-by name, evidence reference or notes.");
        var kind = CountEvidenceKinds.FirstOrDefault(k => string.Equals(k, r.EvidenceKind?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw Bad("Choose how the count was recorded.");
        if (r.Lines is null || r.Lines.Count is < 1 or > 60) throw Bad("Count between 1 and 60 SKUs.");
        if (r.Lines.Select(l => l.ProductVariantId).Distinct().Count() != r.Lines.Count) throw Bad("Count each SKU once.");
        var ids = r.Lines.Select(l => l.ProductVariantId).ToArray();
        var variants = await db.TagProductVariants.Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        s.MerchantId = branch.MerchantId; s.MerchantBranchId = branch.Id; s.CutoffAt = cutoff; s.CountedBy = countedBy;
        s.CountedAt = r.CountedAt; s.CountedAfterCutoffNote = afterCutoffNote;
        s.EvidenceKind = kind; s.EvidenceReference = Trim(r.EvidenceReference) ?? ""; s.Notes = Trim(r.Notes);
        foreach (var line in r.Lines)
        {
            if (!variants.TryGetValue(line.ProductVariantId, out var variant)) throw Bad("Choose a tag option for every counted line.");
            if (line.CountedSellable is < 0 or > 100000 || line.CountedUnsellable is < 0 or > 100000)
                throw Bad($"{variant.Sku}: enter counts from 0 to 100,000.");
            if (line.Notes?.Trim().Length > 1000) throw Bad("Shorten the line notes.");
            var added = new ConsignmentStocktakeLine { StocktakeId = s.Id, ProductVariantId = variant.Id, SkuSnapshot = variant.Sku,
                CountedSellable = line.CountedSellable, CountedUnsellable = line.CountedUnsellable, Notes = Trim(line.Notes) };
            db.ConsignmentStocktakeLines.Add(added);
            s.Lines.Add(added);
        }
    }

    // --- Export ------------------------------------------------------------------------------

    public async Task<byte[]> StocktakesCsvAsync(Guid? actor, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        ExportRange(from, to);
        var rows = await db.ConsignmentStocktakes.AsNoTracking().Include(s => s.Lines)
            .Where(s => s.CutoffAt > from && s.CutoffAt <= to && s.Status != ConsignmentStocktakeStatus.Voided)
            .OrderBy(s => s.CutoffAt).ThenBy(s => s.MerchantBranchId).ToListAsync(ct);
        if (rows.Sum(s => s.Lines.Count) > 10000) throw Bad("Choose a shorter period (maximum 10,000 lines).");
        var names = await BranchNamesAsync(rows.Select(s => s.MerchantBranchId), ct);
        var text = new StringBuilder();
        text.AppendLine(CsvRow("Stocktake ID", "Merchant", "Branch", "Count date", "Cutoff UTC", "Counted at UTC", "Counted after cutoff because",
            "Status", "Counted by", "Evidence kind",
            "Evidence reference", "SKU", "Book sellable", "Book unsellable", "Book investigating", "Book sold", "Book lost", "Open surplus before",
            "Counted sellable", "Counted unsellable", "Damaged found", "Unsellable missing", "Shortage", "Surplus", "Surplus no longer present",
            "Closing sellable", "Closing unsellable", "Closing investigating", "Closing sold", "Closing lost", "Open surplus after",
            "Approved UTC", "Review mode"));
        static string N(int? value) => value?.ToString(CultureInfo.InvariantCulture) ?? "";
        foreach (var s in rows)
        {
            var (merchant, branch) = names[s.MerchantBranchId];
            foreach (var l in s.Lines.OrderBy(l => l.SkuSnapshot))
                text.AppendLine(CsvRow(s.Id.ToString(), merchant, branch, CountDateOf(s.CutoffAt), s.CutoffAt.ToUniversalTime().ToString("O"),
                    s.CountedAt?.ToUniversalTime().ToString("O") ?? "", s.CountedAfterCutoffNote ?? "", s.Status.ToString(), s.CountedBy, s.EvidenceKind, s.EvidenceReference, l.SkuSnapshot, N(l.BookSellable), N(l.BookUnsellable),
                    N(l.BookInvestigation), N(l.BookSold), N(l.BookLost), N(l.OpenSurplusBefore), N(l.CountedSellable), N(l.CountedUnsellable),
                    N(l.UnsellableFound), N(l.UnsellableShortage), N(l.Shortage), N(l.Surplus), N(l.SurplusNoLongerPresent), N(l.ClosingSellable),
                    N(l.ClosingUnsellable), N(l.ClosingInvestigation), N(l.ClosingSold), N(l.ClosingLost), N(l.OpenSurplusAfter),
                    s.ApprovedAt?.ToString("O") ?? "", s.ReviewMode ?? ""));
        }
        await RunAsync(actor, admin => { audit.Append(admin, ActorType.Admin, "consignment.stocktakes-exported", StocktakeSubject, null, null, new { from, to, stocktakes = rows.Count }); return Task.CompletedTask; }, ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
    }
}
