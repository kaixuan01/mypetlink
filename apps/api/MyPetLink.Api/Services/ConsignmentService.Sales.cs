using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// Partner sales reports by SKU, approved selling prices and the per-branch stock
// position. Nothing here creates an invoice, receipt, payment, payout or tax document,
// and no posting changes a ConsignmentUnit or attributes an aggregate sale to a Tag Code.
// Verification also records the period's settlement statement and its pending sales
// commission (ConsignmentService.Settlements.cs); nothing before verification does.
public sealed partial class ConsignmentService
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private const string SalesReportSubject = "ConsignmentSalesReport";
    private const string PriceTermSubject = "ConsignmentPriceTerm";
    private static readonly string[] EvidenceKinds = ["WhatsApp summary", "POS report", "Sales record photo", "Other"];

    // --- Approved selling prices ---------------------------------------------------

    public async Task<IReadOnlyList<ConsignmentPriceTermResponse>> PriceTermsAsync(Guid agreementId, CancellationToken ct) =>
        (await db.ConsignmentPriceTerms.AsNoTracking().Where(t => t.AgreementId == agreementId)
            .OrderBy(t => t.SkuSnapshot).ThenBy(t => t.Kind).ThenBy(t => t.ValidFrom).ToListAsync(ct)).Select(MapPriceTerm).ToArray();

    public async Task<ConsignmentPriceTermResponse> SavePriceTermAsync(Guid? actor, Guid? id, SaveConsignmentPriceTermRequest r,
        string? token, CancellationToken ct)
    {
        var kind = ParseEnum<ConsignmentPriceTermKind>(r.Kind, "Choose a standard price or a promotion.");
        if (r.UnitNetPrice <= 0 || !IsMoney(r.UnitNetPrice))
            throw Bad("Enter the selling price in MYR, above zero with at most two decimal places.");
        if (r.ValidFrom == default || r.ValidToExclusive is { } end && end <= r.ValidFrom)
            throw Bad("Choose a start date, and an end date after it.");
        if (kind == ConsignmentPriceTermKind.Promotion && (r.ValidToExclusive is null || string.IsNullOrWhiteSpace(r.Name)))
            throw Bad("A promotion needs a name and an end date.");
        if (r.Name?.Trim().Length > 100 || r.ApprovalEvidenceReference?.Trim().Length > 1000)
            throw Bad("Shorten the name or evidence reference.");
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            var agreement = await db.ConsignmentAgreements.SingleOrDefaultAsync(a => a.Id == r.AgreementId, ct) ?? throw Missing();
            if (agreement.Status == ConsignmentAgreementStatus.Closed)
                throw Conflict("This agreement version is closed. Add prices to the current version.");
            var variant = await db.TagProductVariants.SingleOrDefaultAsync(v => v.Id == r.ProductVariantId, ct)
                ?? throw Bad("Choose a tag option.");
            ConsignmentPriceTerm term;
            PriceTermValues? before = null;
            if (id is Guid existing)
            {
                term = await db.ConsignmentPriceTerms.SingleOrDefaultAsync(t => t.Id == existing, ct) ?? throw Missing();
                Token(term.RowVersion, token);
                if (term.Status != ConsignmentPriceTermStatus.Draft || term.AgreementId != r.AgreementId)
                    throw Conflict("Only a draft price can be edited. An approved price is fixed: end it and add a new one.");
                before = PriceTermContent(term);
            }
            else
            {
                term = new ConsignmentPriceTerm { AgreementId = agreement.Id, CreatedByAdminUserId = admin, Status = ConsignmentPriceTermStatus.Draft };
                db.ConsignmentPriceTerms.Add(term);
            }
            term.ProductVariantId = variant.Id; term.SkuSnapshot = variant.Sku; term.Kind = kind;
            term.Name = Trim(r.Name) ?? "Standard price"; term.UnitNetPrice = r.UnitNetPrice;
            term.ValidFrom = r.ValidFrom.ToUniversalTime(); term.ValidToExclusive = r.ValidToExclusive?.ToUniversalTime();
            term.ApprovalEvidenceReference = Trim(r.ApprovalEvidenceReference);
            saved = term.Id;
            // Saving unchanged values contributes nothing; any real change does, including the evidence.
            // The persisted values are compared field by field, so no text can disguise a change.
            if (before != PriceTermContent(term))
                await AddContributorAsync(PriceTermSubject, term.Id, admin, before is null ? "Created" : "Edited", ct);
            audit.Append(admin, ActorType.Admin, "consignment.price-term-saved", PriceTermSubject, term.Id, null,
                new { term.AgreementId, term.SkuSnapshot, Kind = kind.ToString(), term.UnitNetPrice, term.ValidFrom, term.ValidToExclusive });
        }, ct);
        return MapPriceTerm(await db.ConsignmentPriceTerms.AsNoTracking().SingleAsync(t => t.Id == saved, ct));
    }

    public async Task<ConsignmentPriceTermResponse> ApprovePriceTermAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var term = await db.ConsignmentPriceTerms.Include(t => t.Agreement).SingleOrDefaultAsync(t => t.Id == id, ct) ?? throw Missing();
            Token(term.RowVersion, r.ConcurrencyToken);
            if (term.Status != ConsignmentPriceTermStatus.Draft) throw Conflict("Only a draft price can be approved.");
            var a = term.Agreement;
            if (a.Status != ConsignmentAgreementStatus.Active || a.ApprovedAt is null)
                throw Conflict("Approve the signed agreement version before approving its selling prices.");
            if (term.ApprovalEvidenceReference is not { Length: >= 5 } evidence)
                throw Bad("Record the partner's acceptance of this price (at least 5 characters) before approval.");
            if (a.EffectiveFrom is { } from && term.ValidFrom < from)
                throw Bad("This price starts before the agreement's effective date.");
            if (a.EffectiveTo is { } to && term.ValidToExclusive > to)
                throw Bad("This price runs past the agreement's end date.");
            if (term.Kind == ConsignmentPriceTermKind.Standard)
            {
                var end = term.ValidToExclusive ?? DateTimeOffset.MaxValue;
                var overlapping = await db.ConsignmentPriceTerms.AnyAsync(t => t.Id != term.Id && t.AgreementId == term.AgreementId
                    && t.ProductVariantId == term.ProductVariantId && t.Kind == ConsignmentPriceTermKind.Standard
                    && t.Status == ConsignmentPriceTermStatus.Approved && t.ValidFrom < end
                    && (t.ValidToExclusive == null || t.ValidToExclusive > term.ValidFrom), ct);
                if (overlapping) throw Conflict("Another approved standard price covers part of these dates. End it first.");
            }
            // Unknown history is never proof of independence: it can only be self-reviewed in Solo Mode.
            if (!term.ContributorHistoryComplete)
                await RequireSoloForUnknownHistoryAsync("Earlier edits to this draft price weren't recorded, so nobody can approve it as an independent reviewer. "
                    + "Withdraw it and add the price again (whoever adds it becomes its maker), or self-review it in Solo Mode.", ct);
            var self = !term.ContributorHistoryComplete || term.CreatedByAdminUserId == admin
                || await ContributedAsync(PriceTermSubject, [term.Id], admin, ct);
            var review = await ReviewCore(admin, self, "approve-price-term",
                $"{term.SkuSnapshot} {term.Kind} {term.UnitNetPrice.ToString("F2", CultureInfo.InvariantCulture)}",
                r.SelfReview, Trim(r.Reason) ?? "Selling price approved", evidence, term.AgreementId, null, PriceTermSubject, term.Id, ct);
            if (self && !string.Equals(r.SelfReview!.ExternalEvidenceReference.Trim(), evidence, StringComparison.OrdinalIgnoreCase))
                throw Bad("Self-review must reference the partner's acceptance recorded for this price.");
            term.Status = ConsignmentPriceTermStatus.Approved; term.ApprovedByAdminUserId = admin;
            term.ApprovedAt = time.GetUtcNow(); term.ReviewMode = review.ReviewMode;
            audit.Append(admin, ActorType.Admin, "consignment.price-term-approved", PriceTermSubject, term.Id, null,
                new { term.SkuSnapshot, term.UnitNetPrice, review.ReviewMode });
        }, ct);
        return MapPriceTerm(await db.ConsignmentPriceTerms.AsNoTracking().SingleAsync(t => t.Id == id, ct));
    }

    /// <summary>Ends an approved price from a date onward. Earlier verified sales keep their price.</summary>
    public async Task<ConsignmentPriceTermResponse> EndPriceTermAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        if (r.EndAt is not { } endAt) throw Bad("Choose the date this price ends.");
        await RunAsync(actor, async admin => {
            var term = await db.ConsignmentPriceTerms.SingleOrDefaultAsync(t => t.Id == id, ct) ?? throw Missing();
            Token(term.RowVersion, r.ConcurrencyToken);
            if (term.Status != ConsignmentPriceTermStatus.Approved) throw Conflict("Only an approved price can be ended.");
            var today = StartOfMalaysiaDay(time.GetUtcNow());
            if (endAt < today || endAt <= term.ValidFrom || term.ValidToExclusive is { } current && endAt >= current)
                throw Bad("Choose an end date from today onward, after the price starts and before any existing end.");
            var used = await db.ConsignmentSalesReportLines.AnyAsync(l => l.PriceTermId == term.Id
                && l.SalesReport.Status != ConsignmentSalesReportStatus.Voided && l.SalesReport.PeriodStart >= endAt, ct);
            if (used) throw Conflict("A sales report after that date already uses this price. Review it first.");
            term.ValidToExclusive = endAt.ToUniversalTime();
            audit.Append(admin, ActorType.Admin, "consignment.price-term-ended", PriceTermSubject, term.Id, null, new { endAt, r.Reason });
        }, ct);
        return MapPriceTerm(await db.ConsignmentPriceTerms.AsNoTracking().SingleAsync(t => t.Id == id, ct));
    }

    public async Task<ConsignmentPriceTermResponse> WithdrawPriceTermAsync(Guid? actor, Guid id, ConsignmentTokenRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var term = await db.ConsignmentPriceTerms.SingleOrDefaultAsync(t => t.Id == id, ct) ?? throw Missing();
            Token(term.RowVersion, r.ConcurrencyToken);
            if (term.Status != ConsignmentPriceTermStatus.Draft) throw Conflict("Only a draft price can be withdrawn. End an approved price instead.");
            if (await db.ConsignmentSalesReportLines.AnyAsync(l => l.PriceTermId == term.Id && l.SalesReport.Status != ConsignmentSalesReportStatus.Voided, ct))
                throw Conflict("A sales report refers to this price. Change that report first.");
            term.Status = ConsignmentPriceTermStatus.Withdrawn;
            audit.Append(admin, ActorType.Admin, "consignment.price-term-withdrawn", PriceTermSubject, term.Id, null, null);
        }, ct);
        return MapPriceTerm(await db.ConsignmentPriceTerms.AsNoTracking().SingleAsync(t => t.Id == id, ct));
    }

    /// <summary>
    /// Offers a renewed version the previous version's approved prices as drafts.
    /// Nothing is approved automatically: each draft needs the partner's acceptance.
    /// </summary>
    public async Task<IReadOnlyList<ConsignmentPriceTermResponse>> CopyPriceTermsAsync(Guid? actor, CopyConsignmentPriceTermsRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var from = await db.ConsignmentAgreements.SingleOrDefaultAsync(a => a.Id == r.FromAgreementId, ct) ?? throw Missing();
            var to = await db.ConsignmentAgreements.SingleOrDefaultAsync(a => a.Id == r.ToAgreementId, ct) ?? throw Missing();
            if (from.Id == to.Id || from.MerchantId != to.MerchantId || to.Status == ConsignmentAgreementStatus.Closed)
                throw Bad("Copy prices into another open agreement version for the same partner.");
            var start = to.EffectiveFrom ?? time.GetUtcNow();
            var source = await db.ConsignmentPriceTerms.Where(t => t.AgreementId == from.Id && t.Status == ConsignmentPriceTermStatus.Approved
                && (t.ValidToExclusive == null || t.ValidToExclusive > start)).ToListAsync(ct);
            var existing = await db.ConsignmentPriceTerms.Where(t => t.AgreementId == to.Id && t.Status != ConsignmentPriceTermStatus.Withdrawn).ToListAsync(ct);
            foreach (var t in source)
            {
                var validFrom = t.ValidFrom > start ? t.ValidFrom : start;
                if (existing.Any(x => x.ProductVariantId == t.ProductVariantId && x.Kind == t.Kind && x.UnitNetPrice == t.UnitNetPrice && x.ValidFrom == validFrom))
                    continue;
                var copy = new ConsignmentPriceTerm { AgreementId = to.Id, ProductVariantId = t.ProductVariantId,
                    SkuSnapshot = t.SkuSnapshot, Kind = t.Kind, Name = t.Name, UnitNetPrice = t.UnitNetPrice, ValidFrom = validFrom,
                    ValidToExclusive = t.ValidToExclusive, Status = ConsignmentPriceTermStatus.Draft, CreatedByAdminUserId = admin };
                db.ConsignmentPriceTerms.Add(copy);
                await AddContributorAsync(PriceTermSubject, copy.Id, admin, "Created", ct);
            }
            audit.Append(admin, ActorType.Admin, "consignment.price-terms-copied", "ConsignmentAgreement", to.Id, null, new { from = from.Id, count = source.Count });
        }, ct);
        return await PriceTermsAsync(r.ToAgreementId, ct);
    }

    // --- Sales reports ---------------------------------------------------------------

    public async Task<(IReadOnlyList<ConsignmentSalesReportResponse> Items, int Total)> SalesReportsAsync(int page, int pageSize,
        Guid? merchantId, Guid? branchId, string? status, CancellationToken ct)
    {
        Page(page, pageSize);
        var q = db.ConsignmentSalesReports.AsNoTracking().AsQueryable();
        if (merchantId.HasValue) q = q.Where(x => x.MerchantId == merchantId);
        if (branchId.HasValue) q = q.Where(x => x.MerchantBranchId == branchId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var s = ParseEnum<ConsignmentSalesReportStatus>(status, "Choose a valid report status.");
            q = q.Where(x => x.Status == s);
        }
        var total = await q.CountAsync(ct);
        var ids = await q.OrderByDescending(x => x.PeriodStart).ThenByDescending(x => x.Version).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).Select(x => x.Id).ToListAsync(ct);
        var items = new List<ConsignmentSalesReportResponse>();
        foreach (var id in ids) items.Add(await SalesReportAsync(id, false, ct));
        return (items, total);
    }

    public Task<ConsignmentSalesReportResponse> GetSalesReportAsync(Guid id, CancellationToken ct) => SalesReportAsync(id, true, ct);

    public async Task<ConsignmentSalesReportResponse> CreateSalesReportAsync(Guid? actor, SaveConsignmentSalesReportRequest r, CancellationToken ct)
    {
        var key = Trim(r.IdempotencyKey) ?? Guid.NewGuid().ToString("N");
        if (key.Length > 80) throw Bad("Use a shorter submission reference.");
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            // A retry of the same submission returns what was saved, and only ever what was sent:
            // an identical retry is a replay, a changed one updates the draft its sender alone has
            // shaped, and anything else is a clear conflict, never the earlier values in silence.
            var replay = await db.ConsignmentSalesReports.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.IdempotencyKey == key, ct);
            if (replay is not null)
            {
                saved = replay.Id;
                if (SameReport(StoredRequest(replay, replay.Lines), r)) return;
                if (replay.Status != ConsignmentSalesReportStatus.Draft || replay.CreatedByAdminUserId != admin || !replay.ContributorHistoryComplete
                    || await db.ConsignmentRecordContributors.AnyAsync(c => c.SubjectType == SalesReportSubject && c.SubjectId == replay.Id && c.AdminUserId != admin, ct))
                    throw new ApiException(409, "submission_changed",
                        "This report was already saved with different values. Open the saved report and check it before making changes.");
                await ReplaceDraftAsync(await db.ConsignmentSalesReports.SingleAsync(x => x.Id == replay.Id, ct), r, admin, ct);
                return;
            }
            var report = new ConsignmentSalesReport { CreatedByAdminUserId = admin, Status = ConsignmentSalesReportStatus.Draft,
                Version = 1, IdempotencyKey = key };
            await ApplyReportAsync(report, r, ct);
            db.ConsignmentSalesReports.Add(report); saved = report.Id;
            await AddContributorAsync(SalesReportSubject, report.Id, admin, "Created", ct);
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-created", SalesReportSubject, report.Id, null,
                new { report.PartnerReference, report.PeriodStart, lines = report.Lines.Count });
        }, ct);
        return await SalesReportAsync(saved, true, ct);
    }

    public async Task<ConsignmentSalesReportResponse> UpdateSalesReportAsync(Guid? actor, Guid id, string? token,
        SaveConsignmentSalesReportRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var report = await db.ConsignmentSalesReports.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(report.RowVersion, token);
            if (report.Status != ConsignmentSalesReportStatus.Draft) throw Conflict("A recorded report keeps the values the partner reported. Create a correction instead.");
            if (report.SupersedesReportId is not null && (r.AgreementId != report.AgreementId || r.MerchantBranchId != report.MerchantBranchId))
                throw Conflict("A correction keeps its original partner, branch and agreement.");
            var stored = await db.ConsignmentSalesReportLines.AsNoTracking().Where(l => l.SalesReportId == report.Id).ToListAsync(ct);
            // Saving unchanged values is not an edit and makes nobody a contributor.
            if (SameReport(StoredRequest(report, stored), r)) return;
            await ReplaceDraftAsync(report, r, admin, ct);
        }, ct);
        return await SalesReportAsync(id, true, ct);
    }

    /// <summary>Replaces a draft's values wholesale, inside the caller's transaction, and records the editor.</summary>
    private async Task ReplaceDraftAsync(ConsignmentSalesReport report, SaveConsignmentSalesReportRequest r, Guid admin, CancellationToken ct)
    {
        await db.ConsignmentSalesReportLines.Where(l => l.SalesReportId == report.Id).ExecuteDeleteAsync(ct);
        await ApplyReportAsync(report, r, ct);
        db.Entry(report).Property(x => x.UpdatedAt).IsModified = true;
        await AddContributorAsync(SalesReportSubject, report.Id, admin, "Edited", ct);
        audit.Append(admin, ActorType.Admin, "consignment.sales-report-edited", SalesReportSubject, report.Id, null,
            new { report.PartnerReference, lines = report.Lines.Count });
    }

    public async Task<ConsignmentSalesReportResponse> RecordSalesReportAsync(Guid? actor, Guid id, ConsignmentTokenRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var report = await db.ConsignmentSalesReports.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(report.RowVersion, r.ConcurrencyToken);
            if (report.Status != ConsignmentSalesReportStatus.Draft) throw Conflict("Only a draft report can be recorded.");
            if (report.EvidenceReference.Trim().Length < 5)
                throw Bad("Record where the partner's report came from, for example the WhatsApp message date and sender.");
            if (report.Lines.Count == 0) throw Bad("Add at least one line before recording the report.");
            report.Status = ConsignmentSalesReportStatus.Recorded; report.RecordedByAdminUserId = admin; report.RecordedAt = time.GetUtcNow();
            await AddContributorAsync(SalesReportSubject, report.Id, admin, "Recorded", ct);
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-recorded", SalesReportSubject, report.Id, null,
                new { report.PartnerReference, report.Version, report.EvidenceLevel });
        }, ct);
        return await SalesReportAsync(id, true, ct);
    }

    public async Task<ConsignmentSalesReportResponse> VoidSalesReportAsync(Guid? actor, Guid id, ConsignmentTokenRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var report = await db.ConsignmentSalesReports.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(report.RowVersion, r.ConcurrencyToken);
            if (report.Status != ConsignmentSalesReportStatus.Draft) throw Conflict("Only a draft can be discarded. A recorded report stays in history.");
            report.Status = ConsignmentSalesReportStatus.Voided;
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-voided", SalesReportSubject, report.Id, null, null);
        }, ct);
        return await SalesReportAsync(id, true, ct);
    }

    public async Task<ConsignmentSalesReportResponse> DisputeSalesReportAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length < 10) throw Bad("Explain what needs correcting (at least 10 characters).");
        await RunAsync(actor, async admin => {
            var report = await db.ConsignmentSalesReports.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(report.RowVersion, r.ConcurrencyToken);
            if (report.Status != ConsignmentSalesReportStatus.Recorded) throw Conflict("Only a recorded, unverified report can be disputed.");
            report.Status = ConsignmentSalesReportStatus.Disputed; report.DisputedByAdminUserId = admin;
            report.DisputedAt = time.GetUtcNow(); report.DisputeReason = reason;
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-disputed", SalesReportSubject, report.Id, null, new { reason });
        }, ct);
        return await SalesReportAsync(id, true, ct);
    }

    /// <summary>
    /// Starts a new draft version from a verified or disputed report. The original stays unchanged.
    /// Starting it reopens reviewed figures, so it needs a reason and is audited on both versions.
    /// The copy itself contributes no figures, so it makes nobody a contributor.
    /// </summary>
    public async Task<ConsignmentSalesReportResponse> CorrectSalesReportAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length < 10) throw Bad("Explain what needs correcting (at least 10 characters).");
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            var original = await db.ConsignmentSalesReports.Include(x => x.Lines).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(original.RowVersion, r.ConcurrencyToken);
            if (original.Status is not (ConsignmentSalesReportStatus.Verified or ConsignmentSalesReportStatus.Disputed))
                throw Conflict("Only a verified or disputed report can be corrected.");
            if (await db.ConsignmentSalesReports.AnyAsync(x => x.SupersedesReportId == original.Id && x.Status != ConsignmentSalesReportStatus.Voided, ct))
                throw Conflict("A correction of this report already exists. Continue with that version.");
            var copy = new ConsignmentSalesReport {
                MerchantId = original.MerchantId, MerchantBranchId = original.MerchantBranchId, AgreementId = original.AgreementId,
                PeriodStart = original.PeriodStart, PeriodEndExclusive = original.PeriodEndExclusive, PartnerReference = original.PartnerReference,
                Version = original.Version + 1, SupersedesReportId = original.Id, ReportReceivedAt = original.ReportReceivedAt,
                EvidenceLevel = original.EvidenceLevel, EvidenceKind = original.EvidenceKind, EvidenceReference = original.EvidenceReference,
                Notes = original.Notes, Status = ConsignmentSalesReportStatus.Draft, CreatedByAdminUserId = admin,
                IdempotencyKey = Guid.NewGuid().ToString("N") };
            foreach (var l in original.Lines)
                copy.Lines.Add(new ConsignmentSalesReportLine { ProductVariantId = l.ProductVariantId, SkuSnapshot = l.SkuSnapshot,
                    ProductNameSnapshot = l.ProductNameSnapshot, LineType = l.LineType, PriceTermId = l.PriceTermId,
                    UnitListPriceSnapshot = l.UnitListPriceSnapshot, UnitNetPrice = l.UnitNetPrice, Quantity = l.Quantity,
                    RefundOfPeriodStart = l.RefundOfPeriodStart, RestockableQuantity = l.RestockableQuantity,
                    UnsellableReturnedQuantity = l.UnsellableReturnedQuantity, Notes = l.Notes,
                    SealedReturnConfirmed = l.SealedReturnConfirmed, SealedReturnEvidence = l.SealedReturnEvidence });
            db.ConsignmentSalesReports.Add(copy); saved = copy.Id;
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-correction-requested", SalesReportSubject, original.Id,
                new { status = original.Status.ToString(), original.Version }, new { correction = copy.Id, copy.Version, reason });
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-correction-started", SalesReportSubject, copy.Id, null,
                new { supersedes = original.Id, copy.Version, reason });
        }, ct);
        return await SalesReportAsync(saved, true, ct);
    }

    /// <summary>
    /// Recovery for a report whose contributor history is unknown: starts a new, empty version that
    /// supersedes it once verified. Its figures are entered afresh from the partner's evidence, so
    /// its history starts complete and earlier versions' unknown editors no longer bear on it. The
    /// original stays unchanged, and its verified postings are reversed exactly once as usual.
    /// </summary>
    public async Task<ConsignmentSalesReportResponse> ReenterSalesReportAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length < 10) throw Bad("Explain why this report is being re-entered (at least 10 characters).");
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            var original = await db.ConsignmentSalesReports.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(original.RowVersion, r.ConcurrencyToken);
            if (original.Status is not (ConsignmentSalesReportStatus.Verified or ConsignmentSalesReportStatus.Disputed))
                throw Conflict("Only a verified or disputed report can be re-entered. Dispute a recorded report first.");
            if (ContributorSegment(original, await ReportAncestorsAsync(original, ct)).Complete)
                throw Conflict("This report's history is complete. Use Correct report to change it.");
            if (await db.ConsignmentSalesReports.AnyAsync(x => x.SupersedesReportId == original.Id && x.Status != ConsignmentSalesReportStatus.Voided, ct))
                throw Conflict("A newer version of this report already exists. Continue with that version.");
            var copy = new ConsignmentSalesReport {
                MerchantId = original.MerchantId, MerchantBranchId = original.MerchantBranchId, AgreementId = original.AgreementId,
                PeriodStart = original.PeriodStart, PeriodEndExclusive = original.PeriodEndExclusive, PartnerReference = original.PartnerReference,
                Version = original.Version + 1, SupersedesReportId = original.Id, ReportReceivedAt = original.ReportReceivedAt,
                EvidenceLevel = original.EvidenceLevel, EvidenceKind = original.EvidenceKind, EvidenceReference = original.EvidenceReference,
                Status = ConsignmentSalesReportStatus.Draft, CreatedByAdminUserId = admin, IdempotencyKey = Guid.NewGuid().ToString("N"),
                ContributorHistoryComplete = true, StartsFreshContributorHistory = true };
            db.ConsignmentSalesReports.Add(copy); saved = copy.Id;
            await AddContributorAsync(SalesReportSubject, copy.Id, admin, "Created", ct);
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-reentry-requested", SalesReportSubject, original.Id,
                new { status = original.Status.ToString(), original.Version, contributorHistory = "unknown" }, new { reentry = copy.Id, copy.Version, reason });
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-reentry-started", SalesReportSubject, copy.Id, null,
                new { supersedes = original.Id, copy.Version, reason });
        }, ct);
        return await SalesReportAsync(saved, true, ct);
    }

    /// <summary>
    /// Founder or independent verification. Moves sold quantities out of sellable stock
    /// (and refunded ones back) in one transaction with the status change.
    /// </summary>
    public async Task<ConsignmentSalesReportResponse> VerifySalesReportAsync(Guid? actor, Guid id, ConsignmentReviewRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var report = await db.ConsignmentSalesReports.Include(x => x.Lines).Include(x => x.Agreement)
                .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(report.RowVersion, r.ConcurrencyToken);
            if (report.Status != ConsignmentSalesReportStatus.Recorded) throw Conflict("Only a recorded, unverified report can be verified.");
            var ancestors = await ReportAncestorsAsync(report, ct);
            // A report for a closed month is linked to what the count found only as the reviewer chooses.
            var late = await LatePlanAsync(report, ancestors.Select(a => a.Id).ToArray(), ct);
            var allocations = CheckAllocations(late, r.Allocations);
            var (issues, warnings, _) = await AssessReportAsync(report, ct, allocations);
            if (issues.Count > 0) throw Bad(issues[0]);
            if (warnings.Count > 0 && !r.AcknowledgeWarnings)
                throw new ApiException(409, "warnings_unacknowledged", "Review and acknowledge the warnings before verifying: " + string.Join(" ", warnings));
            // Anyone who shaped these figures, in this version or any version it corrects, is not independent.
            // Unknown history anywhere in that chain is never proof of independence.
            var (lineage, historyComplete) = ContributorSegment(report, ancestors);
            if (!historyComplete)
                await RequireSoloForUnknownHistoryAsync(UnknownReportHistory, ct);
            var self = !historyComplete || report.RecordedByAdminUserId == admin || await ContributedAsync(SalesReportSubject, lineage, admin, ct);
            // Linking the report to a count's findings settles them, so whoever counted isn't independent of that either.
            if (allocations.Count > 0 && await StocktakeContributorAsync([late!.ClosedBy.Id], admin, ct)) self = true;
            var review = await ReviewCore(admin, self, "verify-sales-report", $"{report.PartnerReference} v{report.Version}",
                r.SelfReview, Trim(r.Reason) ?? "Sales report verified", report.EvidenceReference, report.AgreementId, null,
                SalesReportSubject, report.Id, ct);
            if (self && !string.Equals(r.SelfReview!.ExternalEvidenceReference.Trim(), report.EvidenceReference.Trim(), StringComparison.OrdinalIgnoreCase))
                throw Bad("Self-review must reference the same evidence recorded on this report.");

            // The reversal of the version this replaces and this report's sales and returns are one
            // movement: only the final position must be valid, never an arbitrary intermediate one.
            // Any negative final bucket refuses the whole transaction.
            var effective = report.PeriodEndExclusive.AddTicks(-1);
            var verifiedAncestor = VerifiedAncestor(ancestors);
            await PostTogetherAsync(async () => {
                if (verifiedAncestor is not null)
                {
                    var lineIds = await db.ConsignmentSalesReportLines.Where(l => l.SalesReportId == verifiedAncestor.Id).Select(l => l.Id).ToListAsync(ct);
                    var posted = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.SourceType == ConsignmentLedgerSources.SalesLine
                        && lineIds.Contains(e.SourceLineId) && e.ReversesEntryId == null).ToListAsync(ct);
                    foreach (var entry in posted) await ReverseLedgerAsync(entry, admin, ct);
                }
                foreach (var l in report.Lines.Where(l => l.LineType == ConsignmentSalesLineType.Refund))
                {
                    if (l.RestockableQuantity > 0)
                        await PostLedgerAsync(new(report.MerchantId, report.MerchantBranchId, l.ProductVariantId, l.SkuSnapshot,
                            ConsignmentStockBucket.SoldUnidentified, ConsignmentStockBucket.Sellable, l.RestockableQuantity,
                            ConsignmentLedgerEntryTypes.CustomerReturnRestockable, ConsignmentLedgerSources.SalesLine, l.Id, effective), admin, ct);
                    if (l.UnsellableReturnedQuantity > 0)
                        await PostLedgerAsync(new(report.MerchantId, report.MerchantBranchId, l.ProductVariantId, l.SkuSnapshot,
                            ConsignmentStockBucket.SoldUnidentified, ConsignmentStockBucket.Unsellable, l.UnsellableReturnedQuantity,
                            ConsignmentLedgerEntryTypes.CustomerReturnUnsellable, ConsignmentLedgerSources.SalesLine, l.Id, effective), admin, ct);
                }
                foreach (var l in report.Lines.Where(l => l.LineType == ConsignmentSalesLineType.Sale))
                    await PostLedgerAsync(new(report.MerchantId, report.MerchantBranchId, l.ProductVariantId, l.SkuSnapshot,
                        ConsignmentStockBucket.Sellable, ConsignmentStockBucket.SoldUnidentified, l.Quantity,
                        ConsignmentLedgerEntryTypes.Sale, ConsignmentLedgerSources.SalesLine, l.Id, effective), admin, ct);
                // A report for a month a stocktake has already closed posts to the current month (the
                // ledger dates it now). Only the reviewer's links settle what that count found.
                if (late is not null) await ApplyLateReportAsync(report, late, allocations, review, admin, ct);
            }, ct);
            // Every earlier open version, disputed ones and the verified one this replaces, is now history.
            var replaced = ancestors.TakeWhile(a => a.Status != ConsignmentSalesReportStatus.Superseded).Select(a => a.Id).ToArray();
            foreach (var old in await db.ConsignmentSalesReports.Where(x => replaced.Contains(x.Id)).ToListAsync(ct))
                old.Status = ConsignmentSalesReportStatus.Superseded;

            report.Status = ConsignmentSalesReportStatus.Verified; report.VerifiedByAdminUserId = admin;
            report.VerifiedAt = time.GetUtcNow(); report.ReviewMode = review.ReviewMode;
            audit.Append(admin, ActorType.Admin, "consignment.sales-report-verified", SalesReportSubject, report.Id, null,
                new { report.PartnerReference, report.Version, review.ReviewMode, warnings });
            // The verified figures become the period's settlement statement and its pending sales commission,
            // in this same transaction: a verified report never exists without its settlement, or the reverse.
            await SettleVerifiedReportAsync(report, replaced, verifiedAncestor is not null, admin, ct);
        }, ct);
        return await SalesReportAsync(id, true, ct);
    }

    private async Task ApplyReportAsync(ConsignmentSalesReport report, SaveConsignmentSalesReportRequest r, CancellationToken ct)
    {
        var agreement = await db.ConsignmentAgreements.Include(a => a.Merchant).SingleOrDefaultAsync(a => a.Id == r.AgreementId, ct) ?? throw Missing();
        if (agreement.ApprovedAt is null || agreement.Status == ConsignmentAgreementStatus.Draft)
            throw Bad("Sales can only be reported under an approved agreement.");
        var branch = await db.MerchantBranches.SingleOrDefaultAsync(b => b.Id == r.MerchantBranchId && b.MerchantId == agreement.MerchantId, ct)
            ?? throw Bad("Choose a branch belonging to this partner.");
        var (start, end) = CanonicalPeriod(r.PeriodMonth, r.Half);
        // A period is cut only where an agreement version starts or ends inside it. A version ends
        // where an approved successor starts, even when its own signed end is later or open.
        var reportingEnd = await ReportingEndAsync(agreement, ct);
        var clampedStart = agreement.EffectiveFrom is { } from && from > start ? from : start;
        var clampedEnd = reportingEnd is { } to && to < end ? to : end;
        if (clampedStart < clampedEnd) { start = clampedStart; end = clampedEnd; }
        var reference = (Trim(r.PartnerReference) ?? throw Bad("Enter the partner's report reference.")).ToUpperInvariant();
        if (reference.Length > 100) throw Bad("Use a report reference of 100 characters or fewer.");
        var level = ParseEnum<ConsignmentEvidenceLevel>(r.EvidenceLevel, "Choose documented or summary evidence.");
        var kind = EvidenceKinds.FirstOrDefault(k => string.Equals(k, r.EvidenceKind?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw Bad("Choose how the partner sent the report.");
        if (r.ReportReceivedAt == default || r.ReportReceivedAt > time.GetUtcNow().AddMinutes(2))
            throw Bad("Enter when the partner's report was received; it can't be in the future.");
        if (r.EvidenceReference?.Trim().Length > 1000 || r.Notes?.Trim().Length > 2000) throw Bad("Shorten the evidence reference or notes.");
        if (r.Lines is null || r.Lines.Count is < 1 or > 60) throw Bad("Add between 1 and 60 lines.");

        if (report.SupersedesReportId is not null && (reference != report.PartnerReference || start != report.PeriodStart || end != report.PeriodEndExclusive))
            throw Bad("A correction keeps the original report reference and period. Change the quantities, prices or evidence instead.");
        if (report.SupersedesReportId is null)
        {
            if (await db.ConsignmentSalesReports.AnyAsync(x => x.Id != report.Id && x.MerchantId == agreement.MerchantId
                    && x.PartnerReference == reference && x.Version == report.Version, ct))
                throw Conflict("This partner already has a report with that reference. Use a different reference or correct the existing report.");
        }
        // Every version in this report's own correction chain covers the same period by design.
        var chain = (await ReportAncestorsAsync(report, ct)).Select(x => x.Id).Append(report.Id).ToList();
        var overlapping = await db.ConsignmentSalesReports.AnyAsync(x => !chain.Contains(x.Id) && x.MerchantBranchId == branch.Id
            && x.Status != ConsignmentSalesReportStatus.Voided && x.Status != ConsignmentSalesReportStatus.Superseded
            && x.PeriodStart < end && x.PeriodEndExclusive > start, ct);
        if (overlapping) throw Conflict("Another report already covers part of this period for this branch. Correct that report instead.");

        report.MerchantId = agreement.MerchantId; report.MerchantBranchId = branch.Id; report.AgreementId = agreement.Id;
        report.PeriodStart = start; report.PeriodEndExclusive = end; report.PartnerReference = reference;
        report.ReportReceivedAt = r.ReportReceivedAt.ToUniversalTime(); report.EvidenceLevel = level; report.EvidenceKind = kind;
        report.EvidenceReference = Trim(r.EvidenceReference) ?? ""; report.Notes = Trim(r.Notes);

        var variantIds = r.Lines.Select(l => l.ProductVariantId).Distinct().ToArray();
        var variants = await db.TagProductVariants.Include(v => v.TagProduct).Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        var termIds = r.Lines.Where(l => l.PriceTermId.HasValue).Select(l => l.PriceTermId!.Value).Distinct().ToArray();
        var terms = await db.ConsignmentPriceTerms.Include(t => t.Agreement).Where(t => termIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);
        // Standard prices from every version of this partner's agreement: a refund keeps the
        // pricing of the version its sale was made under, even after a renewal.
        var standards = await db.ConsignmentPriceTerms.Where(t => t.Agreement.MerchantId == agreement.MerchantId && t.Kind == ConsignmentPriceTermKind.Standard
            && t.Status == ConsignmentPriceTermStatus.Approved && variantIds.Contains(t.ProductVariantId)).ToListAsync(ct);
        // A refunded sale's period is identified by the start of an actual report at this branch.
        // Agreement versions can start a period mid-month, so any start is valid if a report has it.
        var origins = r.Lines.Where(l => l.RefundOfPeriodStart.HasValue).Select(l => l.RefundOfPeriodStart!.Value).Distinct().ToList();
        var reportedStarts = (await db.ConsignmentSalesReports.Where(x => x.MerchantBranchId == branch.Id
            && x.Status != ConsignmentSalesReportStatus.Voided && origins.Contains(x.PeriodStart)).Select(x => x.PeriodStart).ToListAsync(ct)).ToHashSet();
        // Unapproved prices have no term, so they stay distinct by the price the partner reported.
        var seen = new HashSet<(ConsignmentSalesLineType, Guid, Guid?, decimal, DateTimeOffset?)>();
        foreach (var line in r.Lines)
        {
            if (!variants.TryGetValue(line.ProductVariantId, out var variant)) throw Bad("Choose a tag option for every line.");
            var type = ParseEnum<ConsignmentSalesLineType>(line.LineType, "Choose a sale or a refund for every line.");
            if (line.Quantity is < 1 or > 10000) throw Bad($"{variant.Sku}: enter a quantity from 1 to 10,000.");
            if (!IsMoney(line.UnitNetPrice)) throw Bad($"{variant.Sku}: enter the actual selling price in MYR with at most two decimal places.");
            if (line.Notes?.Trim().Length > 1000) throw Bad("Shorten the line notes.");
            DateTimeOffset? refundOf = null;
            if (type == ConsignmentSalesLineType.Sale)
            {
                if (line.RestockableQuantity != 0 || line.UnsellableReturnedQuantity != 0 || line.RefundOfPeriodStart is not null)
                    throw Bad($"{variant.Sku}: returned quantities belong on a refund line.");
            }
            else
            {
                if (line.RefundOfPeriodStart is not { } original) throw Bad($"{variant.Sku}: say which sales period the refunded sale was in.");
                refundOf = original.ToOffset(MalaysiaOffset);
                if (refundOf > start) throw Bad($"{variant.Sku}: a refund can only refer to this period or an earlier one.");
                if (refundOf != start && !reportedStarts.Contains(refundOf.Value))
                    throw Bad($"{variant.Sku}: no sales report at this branch starts on {refundOf.Value.ToString("d MMM yyyy", CultureInfo.InvariantCulture)}. Choose the period of the refunded sale.");
                if (line.RestockableQuantity < 0 || line.UnsellableReturnedQuantity < 0
                    || line.RestockableQuantity + line.UnsellableReturnedQuantity > line.Quantity)
                    throw Bad($"{variant.Sku}: returned packages can't exceed the refunded quantity.");
                if (line.RestockableQuantity > 0 && (!line.SealedReturnConfirmed || Trim(line.SealedReturnEvidence) is not { Length: >= 5 and <= 300 }))
                    throw Bad($"{variant.Sku}: confirm the packages going back on the shelf came back sealed and unopened, and say how you know (5 to 300 characters).");
            }
            if (!seen.Add((type, variant.Id, line.PriceTermId, line.PriceTermId is null ? line.UnitNetPrice : 0m, refundOf)))
                throw Bad($"{variant.Sku}: combine lines with the same price into one line.");
            ConsignmentPriceTerm? term = null;
            if (line.PriceTermId is Guid termId)
            {
                // A sale uses this version's prices; a refund uses the price its sale was made at,
                // which may belong to an earlier version of this partner's agreement.
                if (!terms.TryGetValue(termId, out term) || term.ProductVariantId != variant.Id || term.Status == ConsignmentPriceTermStatus.Withdrawn
                    || (type == ConsignmentSalesLineType.Sale ? term.AgreementId != agreement.Id : term.Agreement.MerchantId != agreement.MerchantId))
                    throw Bad(type == ConsignmentSalesLineType.Sale
                        ? $"{variant.Sku}: choose a price from this agreement for this tag option."
                        : $"{variant.Sku}: choose the price the refunded sale was made at, from this partner's agreements.");
            }
            var (listAgreement, listStart, listEnd) = refundOf is { } soldFrom
                ? (term?.AgreementId ?? agreement.Id, soldFrom, HalfMonthEnd(soldFrom)) : (agreement.Id, start, end);
            var list = standards.Where(t => t.AgreementId == listAgreement && t.ValidFrom < listEnd && (t.ValidToExclusive == null || t.ValidToExclusive > listStart))
                .OrderByDescending(t => t.ValidFrom).FirstOrDefault()?.UnitNetPrice;
            // Added explicitly: a line with a preset key attached to an already-tracked report
            // would otherwise be treated as an existing row.
            var added = new ConsignmentSalesReportLine { SalesReportId = report.Id, ProductVariantId = variant.Id, SkuSnapshot = variant.Sku,
                ProductNameSnapshot = $"{variant.TagProduct.Name} · {variant.DisplayName}", LineType = type, PriceTermId = term?.Id,
                UnitListPriceSnapshot = list, UnitNetPrice = line.UnitNetPrice, Quantity = line.Quantity, RefundOfPeriodStart = refundOf,
                RestockableQuantity = type == ConsignmentSalesLineType.Refund ? line.RestockableQuantity : 0,
                UnsellableReturnedQuantity = type == ConsignmentSalesLineType.Refund ? line.UnsellableReturnedQuantity : 0,
                SealedReturnConfirmed = type == ConsignmentSalesLineType.Refund && line.RestockableQuantity > 0 && line.SealedReturnConfirmed,
                SealedReturnEvidence = type == ConsignmentSalesLineType.Refund && line.RestockableQuantity > 0 ? Trim(line.SealedReturnEvidence) : null,
                Notes = Trim(line.Notes) };
            db.ConsignmentSalesReportLines.Add(added);
            report.Lines.Add(added);
        }
    }

    /// <summary>Blocking issues and warnings that need acknowledgment, computed from current records.</summary>
    /// <remarks>
    /// Linkable: per SKU, the issue a reviewer's link to what the closing count found missing can resolve, and how
    /// many units must be linked. Only a shelf shortfall the count's open shortage fully covers qualifies; every
    /// other issue is structural. Verification still re-checks everything with the links supplied.
    /// </remarks>
    private async Task<(List<string> Issues, List<string> Warnings, Dictionary<Guid, (string Issue, int Units)> Linkable)> AssessReportAsync(
        ConsignmentSalesReport report, CancellationToken ct, IReadOnlyList<ConsignmentLateAllocationRequest>? allocations = null)
    {
        var issues = new List<string>();
        var warnings = new List<string>();
        var linkable = new Dictionary<Guid, (string Issue, int Units)>();
        var a = report.Agreement ?? await db.ConsignmentAgreements.AsNoTracking().SingleAsync(x => x.Id == report.AgreementId, ct);
        var reportingEnd = await ReportingEndAsync(a, ct);
        if (a.ApprovedAt is null || a.EffectiveFrom is null || report.PeriodStart < a.EffectiveFrom || reportingEnd is { } to && report.PeriodEndExclusive > to)
            issues.Add("This period is outside the agreement's approved dates. Verify it once a signed agreement version covers these dates.");
        // The period runs until its exclusive end, midnight Malaysia time, and not a moment less.
        if (time.GetUtcNow() < report.PeriodEndExclusive)
            issues.Add("This sales period hasn't ended yet. Verify it once the period is complete.");

        var termIds = report.Lines.Where(l => l.PriceTermId.HasValue).Select(l => l.PriceTermId!.Value).ToArray();
        var terms = await db.ConsignmentPriceTerms.AsNoTracking().Where(t => termIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);
        foreach (var l in report.Lines)
        {
            if (l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart > report.PeriodStart)
                issues.Add($"{l.SkuSnapshot}: a refund can only refer to this period or an earlier one.");
            if (l.RestockableQuantity > 0 && !l.SealedReturnConfirmed)
                issues.Add($"{l.SkuSnapshot}: nobody has confirmed the packages going back on the shelf came back sealed. Correct the report to record that check.");
            var money = l.UnitNetPrice.ToString("F2", CultureInfo.InvariantCulture);
            if (l.PriceTermId is not Guid termId || !terms.TryGetValue(termId, out var term))
            {
                issues.Add($"{l.SkuSnapshot}: RM{money} isn't an approved price. Dispute the report, or approve the promotion first if the partner genuinely ran one.");
                continue;
            }
            if (term.Status != ConsignmentPriceTermStatus.Approved) { issues.Add($"{l.SkuSnapshot}: the price \"{term.Name}\" isn't approved yet."); continue; }
            if (term.UnitNetPrice != l.UnitNetPrice)
                issues.Add($"{l.SkuSnapshot}: sold at RM{money}, but \"{term.Name}\" is RM{term.UnitNetPrice.ToString("F2", CultureInfo.InvariantCulture)}.");
            // A refund is checked against the verified sale it reverses (below), which was itself
            // only verified at a price valid in its own period.
            var termEnd = term.ValidToExclusive ?? DateTimeOffset.MaxValue;
            if (l.LineType == ConsignmentSalesLineType.Sale && (term.ValidFrom >= report.PeriodEndExclusive || termEnd <= report.PeriodStart))
                issues.Add($"{l.SkuSnapshot}: \"{term.Name}\" wasn't valid during this period.");
        }

        var ancestors = await ReportAncestorsAsync(report, ct);
        if (ancestors.Count > 0 && ancestors[0].Status is not (ConsignmentSalesReportStatus.Verified or ConsignmentSalesReportStatus.Disputed))
            issues.Add("The report this corrects is no longer open to correction.");
        var verifiedAncestor = VerifiedAncestor(ancestors);
        var previousLines = verifiedAncestor is null ? []
            : await db.ConsignmentSalesReportLines.AsNoTracking().Where(l => l.SalesReportId == verifiedAncestor.Id).ToListAsync(ct);
        var lineage = ancestors.Select(x => x.Id).Append(report.Id).ToArray();

        var late = await LatePlanAsync(report, ancestors.Select(x => x.Id).ToArray(), ct);
        // Simulate the whole posting, including the reversal of the version this replaces, on
        // current balances: verification can never leave any bucket below zero.
        foreach (var variant in report.Lines.Concat(previousLines).Select(l => l.ProductVariantId).Distinct())
        {
            var sku = report.Lines.Concat(previousLines).First(l => l.ProductVariantId == variant).SkuSnapshot;
            var sellable = await LedgerBalanceAsync(report.MerchantBranchId, variant, ConsignmentStockBucket.Sellable, ct);
            var unsellable = await LedgerBalanceAsync(report.MerchantBranchId, variant, ConsignmentStockBucket.Unsellable, ct);
            var sold = await LedgerBalanceAsync(report.MerchantBranchId, variant, ConsignmentStockBucket.SoldUnidentified, ct);
            foreach (var l in previousLines.Where(l => l.ProductVariantId == variant))
                if (l.LineType == ConsignmentSalesLineType.Sale) { sellable += l.Quantity; sold -= l.Quantity; }
                else { sold += l.RestockableQuantity + l.UnsellableReturnedQuantity; sellable -= l.RestockableQuantity; unsellable -= l.UnsellableReturnedQuantity; }
            foreach (var l in report.Lines.Where(l => l.ProductVariantId == variant))
                if (l.LineType == ConsignmentSalesLineType.Sale) { sellable -= l.Quantity; sold += l.Quantity; }
                else { sold -= l.RestockableQuantity + l.UnsellableReturnedQuantity; sellable += l.RestockableQuantity; unsellable += l.UnsellableReturnedQuantity; }
            // For a month already closed by a stocktake, the reviewer's links move explained shortages back to
            // the shelf, and the explanations of the version this replaces are withdrawn (back under investigation).
            if (late?.Skus.FirstOrDefault(x => x.VariantId == variant) is { } lateSku)
            {
                var withdrawn = lateSku.Withdrawn.Sum(w => w.Quantity);
                var withdrawnShortage = lateSku.Withdrawn.Where(w => late.Discrepancies[w.DiscrepancyId].Kind == ConsignmentDiscrepancyKind.Shortage).Sum(w => w.Quantity);
                var linkedShortage = lateSku.Explains == ConsignmentDiscrepancyKind.Shortage
                    ? (allocations ?? []).Where(a => lateSku.Candidates.Any(c => c.Discrepancy.Id == a.DiscrepancyId)).Sum(a => a.Quantity) : 0;
                sellable += linkedShortage - withdrawnShortage;
                var date = CountDayLabel(late.ClosedBy.CutoffAt);
                var open = lateSku.Candidates.Sum(c => c.OpenQuantity);
                var text = $"{sku}: the stocktake of {date} already closed this period, so this report is posted to the current month";
                if (open > 0)
                    text += lateSku.Explains == ConsignmentDiscrepancyKind.Shortage
                        ? $". That count found {open} missing. Link this report's sales to it only if the evidence shows they account for it"
                        : $". That count found {open} extra. Link this report's restocked returns to it only if the evidence shows they account for it";
                if (withdrawn > 0)
                    text += $". The version this replaces explained {withdrawn} of what that count found; verifying reopens {(withdrawn == 1 ? "it" : "them")} unless you link {(withdrawn == 1 ? "it" : "them")} again";
                warnings.Add(text + ".");
            }
            if (sellable < 0)
            {
                var shortfall = -sellable;
                var linkSku = late?.Skus.FirstOrDefault(x => x.VariantId == variant);
                var coverable = linkSku is { Explains: ConsignmentDiscrepancyKind.Shortage, Candidates.Count: > 0 }
                    && shortfall <= Math.Min(linkSku.Capacity, linkSku.Candidates.Sum(c => c.OpenQuantity));
                var text = coverable
                    ? $"{sku}: these sales are {shortfall} more than the sellable stock recorded at this branch. If they account for units the count of {CountDayLabel(late!.ClosedBy.CutoffAt)} found missing, link at least {shortfall} to that shortage with the evidence; otherwise dispute this report."
                    : $"{sku}: these sales are {shortfall} more than the sellable stock recorded at this branch. Check the delivery and earlier reports, or dispute this one.";
                issues.Add(text);
                if (coverable) linkable[variant] = (text, shortfall);
            }
            if (unsellable < 0)
                issues.Add($"{sku}: {-unsellable} of the unsellable packages this removes have already gone back to MyPetLink. Check the returns before correcting this report.");
            if (sold < 0)
                issues.Add($"{sku}: more packages came back than have been recorded as sold.");

            var activated = await db.ConsignmentUnits.AsNoTracking().CountAsync(u => u.Dispatch.MerchantBranchId == report.MerchantBranchId
                && u.ProductVariantId == variant && u.Status == ConsignmentUnitStatus.Received && u.ReceivingState == ConsignmentReceivingState.Good
                && u.SmartTag.ActivatedAt != null, ct);
            if (activated > Math.Max(sold, 0))
                warnings.Add($"{sku}: {activated} tags at this partner have been activated by customers, but only {Math.Max(sold, 0)} sales would be recorded. Activation isn't proof of sale, but check for unreported sales.");
        }

        // Every refund must be covered by verified sales of the same SKU, at the same approved price,
        // in the period it names. A correction is checked for every refund its sales support, so it
        // can never leave more verified refunds than verified sales, whatever it changes or removes.
        var refundKeys = report.Lines.Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.PriceTermId.HasValue && l.RefundOfPeriodStart.HasValue)
            .Select(l => (Variant: l.ProductVariantId, Term: l.PriceTermId!.Value, Origin: l.RefundOfPeriodStart!.Value));
        var saleKeys = report.Lines.Concat(previousLines).Where(l => l.LineType == ConsignmentSalesLineType.Sale && l.PriceTermId.HasValue)
            .Select(l => (Variant: l.ProductVariantId, Term: l.PriceTermId!.Value, Origin: report.PeriodStart));
        foreach (var (variant, termId, origin) in refundKeys.Concat(saleKeys).Distinct().ToList())
        {
            var elsewhere = await db.ConsignmentSalesReportLines.AsNoTracking().Where(l => l.SalesReport.MerchantBranchId == report.MerchantBranchId
                    && l.SalesReport.Status == ConsignmentSalesReportStatus.Verified && !lineage.Contains(l.SalesReportId)
                    && l.ProductVariantId == variant && l.PriceTermId == termId
                    && (l.LineType == ConsignmentSalesLineType.Sale && l.SalesReport.PeriodStart == origin
                        || l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart == origin))
                .GroupBy(l => l.LineType).Select(g => new { g.Key, Quantity = g.Sum(x => x.Quantity) }).ToListAsync(ct);
            var here = report.Lines.Where(l => l.ProductVariantId == variant && l.PriceTermId == termId).ToList();
            var sold = elsewhere.Where(x => x.Key == ConsignmentSalesLineType.Sale).Sum(x => x.Quantity)
                + (origin == report.PeriodStart ? here.Where(l => l.LineType == ConsignmentSalesLineType.Sale).Sum(l => l.Quantity) : 0);
            var refundsHere = here.Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart == origin).Sum(l => l.Quantity);
            var refunded = elsewhere.Where(x => x.Key == ConsignmentSalesLineType.Refund).Sum(x => x.Quantity) + refundsHere;
            if (refunded <= sold) continue;
            var sku = report.Lines.Concat(previousLines).First(l => l.ProductVariantId == variant).SkuSnapshot;
            var period = origin.ToOffset(MalaysiaOffset).ToString("d MMM yyyy", CultureInfo.InvariantCulture);
            issues.Add(refundsHere > 0
                ? $"{sku}: {refunded} refunds at this price, but only {sold} verified sales in the period starting {period}."
                : $"{sku}: this leaves {sold} verified sales at this price in the period starting {period}, but {refunded} refunds of those sales are already verified. Correct the refund report first.");
        }

        if (report.ReportReceivedAt > report.PeriodEndExclusive.AddDays(7))
            warnings.Add($"The partner's report arrived {(int)(report.ReportReceivedAt - report.PeriodEndExclusive).TotalDays} days after the period ended.");
        return (issues, warnings, linkable);
    }

    private async Task<ConsignmentSalesReportResponse> SalesReportAsync(Guid id, bool assess, CancellationToken ct)
    {
        var report = await db.ConsignmentSalesReports.AsNoTracking().Include(x => x.Lines).Include(x => x.Agreement)
            .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new ApiException(404, "consignment_not_found", "This sales report could not be found.");
        var merchant = await db.Merchants.AsNoTracking().Where(m => m.Id == report.MerchantId)
            .Select(m => m.TradingName ?? m.LegalBusinessName).SingleAsync(ct);
        var branch = await db.MerchantBranches.AsNoTracking().Where(b => b.Id == report.MerchantBranchId).Select(b => b.Name).SingleAsync(ct);
        var termIds = report.Lines.Where(l => l.PriceTermId.HasValue).Select(l => l.PriceTermId!.Value).ToArray();
        var terms = await db.ConsignmentPriceTerms.AsNoTracking().Where(t => termIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);
        var successor = await db.ConsignmentSalesReports.AsNoTracking()
            .Where(x => x.SupersedesReportId == report.Id && x.Status != ConsignmentSalesReportStatus.Voided).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        var open = report.Status is ConsignmentSalesReportStatus.Draft or ConsignmentSalesReportStatus.Recorded;
        var (issues, warnings, linkable) = assess && open ? await AssessReportAsync(report, ct)
            : (new List<string>(), new List<string>(), new Dictionary<Guid, (string Issue, int Units)>());
        var ancestors = await ReportAncestorsAsync(report, ct);
        var (_, historyComplete) = ContributorSegment(report, ancestors);
        var late = assess && open ? await LatePlanAsync(report, ancestors.Select(a => a.Id).ToArray(), ct) : null;
        var lines = report.Lines.OrderBy(l => l.LineType).ThenBy(l => l.SkuSnapshot).ThenByDescending(l => l.UnitNetPrice).Select(l => {
            var term = l.PriceTermId is Guid t && terms.TryGetValue(t, out var found) ? found : null;
            var sign = l.LineType == ConsignmentSalesLineType.Refund ? -1 : 1;
            var discount = l.UnitListPriceSnapshot is decimal list && list > l.UnitNetPrice ? (list - l.UnitNetPrice) * l.Quantity * sign : 0m;
            return new ConsignmentSalesLineResponse(l.Id, l.ProductVariantId, l.SkuSnapshot, l.ProductNameSnapshot, l.LineType.ToString(),
                l.PriceTermId, term?.Name, term?.Kind.ToString(), l.UnitListPriceSnapshot, l.UnitNetPrice, l.Quantity,
                l.UnitNetPrice * l.Quantity * sign, discount, l.RefundOfPeriodStart, l.RestockableQuantity, l.UnsellableReturnedQuantity, l.Notes,
                l.SealedReturnConfirmed, l.SealedReturnEvidence);
        }).ToArray();
        return new(report.Id, report.MerchantId, merchant, report.MerchantBranchId, branch, report.AgreementId, report.Agreement.Reference,
            report.Agreement.Version, report.PeriodStart, report.PeriodEndExclusive, report.PartnerReference, report.Version,
            report.SupersedesReportId, successor, report.ReportReceivedAt, report.EvidenceLevel.ToString(), report.EvidenceKind,
            report.EvidenceReference, report.Notes, report.Status.ToString(), report.CreatedAt, report.RecordedAt, report.VerifiedAt,
            report.ReviewMode, report.DisputedAt, report.DisputeReason, lines,
            lines.Where(l => l.LineType == "Sale").Sum(l => l.Quantity), lines.Where(l => l.LineType == "Refund").Sum(l => l.Quantity),
            lines.Sum(l => l.NetValue), issues, warnings, Convert.ToBase64String(report.RowVersion)) {
            ContributorHistoryComplete = historyComplete, LateReport = late is null ? null : MapLatePlan(late, linkable.ToDictionary(x => x.Key, x => x.Value.Units)),
            LinkResolvableIssues = linkable.Values.Select(x => x.Issue).ToArray() };
    }

    // --- Stock position ---------------------------------------------------------------

    public async Task<IReadOnlyList<ConsignmentStockPositionResponse>> StockPositionsAsync(Guid? merchantId, CancellationToken ct)
    {
        var fromLedger = db.ConsignmentStockLedgerEntries.Where(e => merchantId == null || e.MerchantId == merchantId).Select(e => e.MerchantBranchId);
        var fromCustody = db.ConsignmentDispatches.Where(d => d.MerchantBranchId != null && d.Status != ConsignmentDispatchStatus.Cancelled
            && (merchantId == null || d.Agreement.MerchantId == merchantId)).Select(d => d.MerchantBranchId!.Value);
        var branchIds = await fromLedger.Union(fromCustody).Distinct().ToListAsync(ct);
        var result = new List<ConsignmentStockPositionResponse>();
        foreach (var branchId in branchIds) result.Add(await StockPositionAsync(branchId, ct));
        return result.OrderBy(p => p.MerchantName).ThenBy(p => p.BranchName).ToArray();
    }

    private async Task<ConsignmentStockPositionResponse> StockPositionAsync(Guid branchId, CancellationToken ct)
    {
        var branch = await db.MerchantBranches.AsNoTracking().Include(b => b.Merchant).SingleAsync(b => b.Id == branchId, ct);
        var into = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.MerchantBranchId == branchId)
            .GroupBy(e => new { e.ProductVariantId, e.ToBucket }).Select(g => new { g.Key.ProductVariantId, Bucket = g.Key.ToBucket, Quantity = g.Sum(x => x.Quantity) }).ToListAsync(ct);
        var outOf = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.MerchantBranchId == branchId)
            .GroupBy(e => new { e.ProductVariantId, e.FromBucket }).Select(g => new { g.Key.ProductVariantId, Bucket = g.Key.FromBucket, Quantity = g.Sum(x => x.Quantity) }).ToListAsync(ct);
        int Balance(Guid variant, ConsignmentStockBucket bucket) =>
            into.Where(x => x.ProductVariantId == variant && x.Bucket == bucket).Sum(x => x.Quantity)
            - outOf.Where(x => x.ProductVariantId == variant && x.Bucket == bucket).Sum(x => x.Quantity);

        var counted = db.ConsignmentStockLedgerEntries.Where(e => e.SourceType == ConsignmentLedgerSources.Unit
            && e.EntryType == ConsignmentLedgerEntryTypes.UnitCountedAtPartner && e.ReversesEntryId == null).Select(e => e.SourceLineId);
        var inCustody = db.ConsignmentUnits.AsNoTracking().Where(u => u.Dispatch.MerchantBranchId == branchId
            && u.Status == ConsignmentUnitStatus.Received && u.ReceivingState == ConsignmentReceivingState.Good);
        var custodyUnits = await inCustody.GroupBy(u => u.ProductVariantId).Select(g => new { ProductVariantId = g.Key, Units = g.Count() }).ToListAsync(ct);
        var activatedUnits = await inCustody.Where(u => u.SmartTag.ActivatedAt != null).GroupBy(u => u.ProductVariantId)
            .Select(g => new { ProductVariantId = g.Key, Units = g.Count() }).ToListAsync(ct);
        var untrackedUnits = await inCustody.Where(u => !counted.Contains(u.Id)).GroupBy(u => u.ProductVariantId)
            .Select(g => new { ProductVariantId = g.Key, Units = g.Count() }).ToListAsync(ct);
        var holds = await db.ConsignmentUnits.AsNoTracking().Where(u => u.Dispatch.MerchantBranchId == branchId
                && u.Status == ConsignmentUnitStatus.Dispatched && u.ReceivingState != ConsignmentReceivingState.Good)
            .GroupBy(u => u.ProductVariantId).Select(g => new { ProductVariantId = g.Key, Units = g.Count() }).ToListAsync(ct);

        var recorded = await db.ConsignmentSalesReports.AsNoTracking().Include(r => r.Lines)
            .Where(r => r.MerchantBranchId == branchId && r.Status == ConsignmentSalesReportStatus.Recorded).ToListAsync(ct);
        var correctedIds = recorded.Where(r => r.SupersedesReportId.HasValue).Select(r => r.SupersedesReportId!.Value).ToArray();
        var corrected = await db.ConsignmentSalesReports.AsNoTracking().Include(r => r.Lines)
            .Where(r => correctedIds.Contains(r.Id) && r.Status == ConsignmentSalesReportStatus.Verified).ToListAsync(ct);
        int Pending(Guid variant, bool restock) =>
            recorded.SelectMany(r => r.Lines).Where(l => l.ProductVariantId == variant)
                .Sum(l => restock ? l.RestockableQuantity : l.LineType == ConsignmentSalesLineType.Sale ? l.Quantity : 0)
            - corrected.SelectMany(r => r.Lines).Where(l => l.ProductVariantId == variant)
                .Sum(l => restock ? l.RestockableQuantity : l.LineType == ConsignmentSalesLineType.Sale ? l.Quantity : 0);

        var discrepancies = await db.ConsignmentStockDiscrepancies.AsNoTracking().Where(d => d.MerchantBranchId == branchId
                && d.Status == ConsignmentDiscrepancyStatus.Open).GroupBy(d => new { d.ProductVariantId, d.Kind })
            .Select(g => new { g.Key.ProductVariantId, g.Key.Kind, Open = g.Sum(x => x.OpenQuantity), Count = g.Count() }).ToListAsync(ct);
        var variantIds = into.Select(x => x.ProductVariantId).Concat(custodyUnits.Select(x => x.ProductVariantId)).Concat(holds.Select(x => x.ProductVariantId))
            .Concat(recorded.SelectMany(r => r.Lines).Select(l => l.ProductVariantId)).Distinct().ToArray();
        var variants = await db.TagProductVariants.AsNoTracking().Include(v => v.TagProduct).Where(v => variantIds.Contains(v.Id)).ToListAsync(ct);
        var skus = variants.OrderBy(v => v.Sku).Select(v => {
            var sellable = Balance(v.Id, ConsignmentStockBucket.Sellable);
            var unsellable = Balance(v.Id, ConsignmentStockBucket.Unsellable);
            var investigation = Balance(v.Id, ConsignmentStockBucket.Investigation);
            var sold = Balance(v.Id, ConsignmentStockBucket.SoldUnidentified);
            var lost = Balance(v.Id, ConsignmentStockBucket.LostUnidentified);
            var units = custodyUnits.SingleOrDefault(x => x.ProductVariantId == v.Id)?.Units ?? 0;
            var unverifiedSold = Pending(v.Id, false);
            var unverifiedRestock = Pending(v.Id, true);
            return new ConsignmentSkuPositionResponse(v.Id, v.Sku, $"{v.TagProduct.Name} · {v.DisplayName}", sellable, unsellable, investigation,
                sold, lost, unverifiedSold, unverifiedRestock, sellable - unverifiedSold + unverifiedRestock, units,
                units == sellable + unsellable + investigation + sold + lost,
                untrackedUnits.SingleOrDefault(x => x.ProductVariantId == v.Id)?.Units ?? 0,
                holds.SingleOrDefault(x => x.ProductVariantId == v.Id)?.Units ?? 0,
                activatedUnits.SingleOrDefault(x => x.ProductVariantId == v.Id)?.Units ?? 0) {
                OpenSurplus = discrepancies.Where(d => d.ProductVariantId == v.Id && d.Kind == ConsignmentDiscrepancyKind.Surplus).Sum(d => d.Open),
                OpenDiscrepancies = discrepancies.Where(d => d.ProductVariantId == v.Id).Sum(d => d.Count) };
        }).ToArray();
        var lastVerified = await db.ConsignmentSalesReports.AsNoTracking()
            .Where(r => r.MerchantBranchId == branchId && r.Status == ConsignmentSalesReportStatus.Verified)
            .MaxAsync(r => (DateTimeOffset?)r.PeriodEndExclusive, ct);
        var disputed = await db.ConsignmentSalesReports.AsNoTracking()
            .CountAsync(r => r.MerchantBranchId == branchId && r.Status == ConsignmentSalesReportStatus.Disputed, ct);
        var closed = await LastClosedCutoffAsync(branchId, ct);
        return new(branch.MerchantId, branch.Merchant.TradingName ?? branch.Merchant.LegalBusinessName, branch.Id, branch.Name,
            skus, lastVerified, recorded.Count, disputed) {
            LastClosedCountDate = closed is { } c ? CountDateOf(c) : null,
            OpenDiscrepancies = discrepancies.Sum(d => d.Count),
            StocktakeInProgress = await db.ConsignmentStocktakes.AnyAsync(x => x.MerchantBranchId == branchId
                && (x.Status == ConsignmentStocktakeStatus.Draft || x.Status == ConsignmentStocktakeStatus.Recorded), ct) };
    }

    /// <summary>
    /// Brings deliveries received before SKU tracking existed into the ledger, using the
    /// same source keys as the live hooks, so running it twice changes nothing.
    /// </summary>
    public async Task<ConsignmentStockPositionResponse> StartStockTrackingAsync(Guid? actor, StartConsignmentStockTrackingRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length < 10) throw Bad("Give a reason of at least 10 characters.");
        await RunAsync(actor, async admin => {
            if (!await db.MerchantBranches.AnyAsync(b => b.Id == r.MerchantBranchId, ct)) throw Missing();
            var units = await db.ConsignmentUnits.Include(u => u.Dispatch).ThenInclude(d => d.Agreement)
                .Include(u => u.Dispatch).ThenInclude(d => d.HandoverRecords)
                .Where(u => u.Dispatch.MerchantBranchId == r.MerchantBranchId && u.ReceivingState == ConsignmentReceivingState.Good)
                .OrderBy(u => u.Id).ToListAsync(ct);
            var posted = 0;
            foreach (var u in units)
            {
                var d = u.Dispatch;
                var entry = await PostLedgerAsync(new(d.Agreement.MerchantId, r.MerchantBranchId, u.ProductVariantId, u.SkuSnapshot,
                    ConsignmentStockBucket.External, ConsignmentStockBucket.Sellable, 1, ConsignmentLedgerEntryTypes.UnitCountedAtPartner,
                    ConsignmentLedgerSources.Unit, u.Id, d.PartnerReceivedAt ?? d.ReceivedAt ?? d.DispatchedAt ?? time.GetUtcNow()), admin, ct);
                if (entry is not null) posted++;
            }
            foreach (var u in units.Where(u => u.Status is ConsignmentUnitStatus.ReturnedQuarantine or ConsignmentUnitStatus.Released or ConsignmentUnitStatus.WrittenOff))
                await PostLedgerAsync(new(u.Dispatch.Agreement.MerchantId, r.MerchantBranchId, u.ProductVariantId, u.SkuSnapshot,
                    ConsignmentStockBucket.Sellable, ConsignmentStockBucket.External, 1, ConsignmentLedgerEntryTypes.UnitReturned,
                    ConsignmentLedgerSources.Unit, u.Id, u.ReturnedAt ?? time.GetUtcNow()), admin, ct);
            // A handover is keyed by the record that began it, never by a later evidence correction,
            // so a handover the live hook already posted is recognised here and never posted twice.
            foreach (var u in units.Where(u => u.Status == ConsignmentUnitStatus.ExternalHandover))
            {
                var (sourceType, sourceId) = HandoverSource(u.Dispatch.HandoverRecords, u);
                await PostLedgerAsync(new(u.Dispatch.Agreement.MerchantId, r.MerchantBranchId, u.ProductVariantId, u.SkuSnapshot,
                    ConsignmentStockBucket.Sellable, ConsignmentStockBucket.External, 1, ConsignmentLedgerEntryTypes.IdentifiedHandover,
                    sourceType, sourceId, time.GetUtcNow()), admin, ct);
            }
            audit.Append(admin, ActorType.Admin, "consignment.stock-tracking-started", "MerchantBranch", r.MerchantBranchId, null,
                new { reason, units = units.Count, newlyCounted = posted });
        }, ct);
        return await StockPositionAsync(r.MerchantBranchId, ct);
    }

    // --- Exports ------------------------------------------------------------------------

    public async Task<byte[]> StockLedgerCsvAsync(Guid? actor, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        ExportRange(from, to);
        var rows = await db.ConsignmentStockLedgerEntries.AsNoTracking().Where(e => e.EffectiveAt >= from && e.EffectiveAt < to)
            .OrderBy(e => e.EffectiveAt).ThenBy(e => e.PostedAt).ThenBy(e => e.Id).Take(10001).ToListAsync(ct);
        if (rows.Count > 10000) throw Bad("Choose a shorter period (maximum 10,000 records).");
        var names = await BranchNamesAsync(rows.Select(r => r.MerchantBranchId), ct);
        var text = new StringBuilder();
        text.AppendLine(CsvRow("Entry ID", "Merchant", "Branch", "SKU", "From", "To", "Quantity", "Entry type", "Source type", "Source ID",
            "Reverses entry", "Effective UTC", "Posted UTC", "Prior-period correction", "Actor admin ID"));
        foreach (var e in rows)
        {
            var (merchant, branch) = names[e.MerchantBranchId];
            text.AppendLine(CsvRow(e.Id.ToString(), merchant, branch, e.SkuSnapshot, e.FromBucket.ToString(), e.ToBucket.ToString(),
                e.Quantity.ToString(CultureInfo.InvariantCulture), e.EntryType, e.SourceType, e.SourceLineId.ToString(),
                e.ReversesEntryId?.ToString() ?? "", e.EffectiveAt.ToString("O"), e.PostedAt.ToString("O"),
                e.IsPriorPeriodCorrection ? "Yes" : "No", e.ActorAdminUserId.ToString()));
        }
        await RunAsync(actor, admin => { audit.Append(admin, ActorType.Admin, "consignment.stock-ledger-exported", "ConsignmentStockLedger", null, null, new { from, to, rows.Count }); return Task.CompletedTask; }, ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
    }

    public async Task<byte[]> SalesReportsCsvAsync(Guid? actor, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        ExportRange(from, to);
        var reports = await db.ConsignmentSalesReports.AsNoTracking().Include(r => r.Lines).Include(r => r.Agreement)
            .Where(r => r.PeriodStart >= from && r.PeriodStart < to && r.Status != ConsignmentSalesReportStatus.Voided)
            .OrderBy(r => r.PeriodStart).ThenBy(r => r.PartnerReference).ThenBy(r => r.Version).ToListAsync(ct);
        if (reports.Sum(r => r.Lines.Count) > 10000) throw Bad("Choose a shorter period (maximum 10,000 lines).");
        var names = await BranchNamesAsync(reports.Select(r => r.MerchantBranchId), ct);
        var termIds = reports.SelectMany(r => r.Lines).Where(l => l.PriceTermId.HasValue).Select(l => l.PriceTermId!.Value).Distinct().ToArray();
        var terms = await db.ConsignmentPriceTerms.AsNoTracking().Where(t => termIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);
        var text = new StringBuilder();
        text.AppendLine(CsvRow("Report ID", "Merchant", "Branch", "Agreement", "Agreement version", "Period start", "Period end (exclusive)",
            "Partner reference", "Report version", "Status", "Evidence level", "Evidence kind", "Evidence reference", "Line type", "SKU",
            "Price", "Price kind", "Approved list price MYR", "Actual net price MYR", "Quantity", "Net value MYR", "Promotional discount MYR",
            "Refund of period", "Restockable returns", "Unsellable returns", "Recorded UTC", "Verified UTC", "Review mode", "Verification"));
        static string Money(decimal? value) => value?.ToString("F2", CultureInfo.InvariantCulture) ?? "";
        foreach (var r in reports)
        {
            var (merchant, branch) = names[r.MerchantBranchId];
            foreach (var l in r.Lines.OrderBy(l => l.LineType).ThenBy(l => l.SkuSnapshot))
            {
                var term = l.PriceTermId is Guid t && terms.TryGetValue(t, out var found) ? found : null;
                var sign = l.LineType == ConsignmentSalesLineType.Refund ? -1 : 1;
                var discount = l.UnitListPriceSnapshot is decimal list && list > l.UnitNetPrice ? (list - l.UnitNetPrice) * l.Quantity * sign : 0m;
                text.AppendLine(CsvRow(r.Id.ToString(), merchant, branch, r.Agreement.Reference, r.Agreement.Version.ToString(CultureInfo.InvariantCulture),
                    r.PeriodStart.ToString("O"), r.PeriodEndExclusive.ToString("O"), r.PartnerReference, r.Version.ToString(CultureInfo.InvariantCulture),
                    r.Status.ToString(), r.EvidenceLevel.ToString(), r.EvidenceKind, r.EvidenceReference, l.LineType.ToString(), l.SkuSnapshot,
                    term?.Name ?? "Unapproved price", term?.Kind.ToString() ?? "", Money(l.UnitListPriceSnapshot), Money(l.UnitNetPrice),
                    l.Quantity.ToString(CultureInfo.InvariantCulture), Money(l.UnitNetPrice * l.Quantity * sign), Money(discount),
                    l.RefundOfPeriodStart?.ToString("O") ?? "", l.RestockableQuantity.ToString(CultureInfo.InvariantCulture),
                    l.UnsellableReturnedQuantity.ToString(CultureInfo.InvariantCulture), r.RecordedAt?.ToString("O") ?? "",
                    r.VerifiedAt?.ToString("O") ?? "", r.ReviewMode ?? "",
                    r.Status == ConsignmentSalesReportStatus.Verified ? "Verified report; not an invoice, payment or commission record" : "Not verified"));
            }
        }
        await RunAsync(actor, admin => { audit.Append(admin, ActorType.Admin, "consignment.sales-reports-exported", SalesReportSubject, null, null, new { from, to, reports = reports.Count }); return Task.CompletedTask; }, ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
    }

    private async Task<Dictionary<Guid, (string Merchant, string Branch)>> BranchNamesAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var distinct = ids.Distinct().ToArray();
        return await db.MerchantBranches.AsNoTracking().Where(b => distinct.Contains(b.Id))
            .Select(b => new { b.Id, Merchant = b.Merchant.TradingName ?? b.Merchant.LegalBusinessName, b.Name })
            .ToDictionaryAsync(b => b.Id, b => (b.Merchant, b.Name), ct);
    }

    // --- Helpers ---------------------------------------------------------------------

    private static string CsvRow(params string[] values) => string.Join(',', values.Select(AdminExportSanitizer.Csv));

    private static void ExportRange(DateTimeOffset from, DateTimeOffset to)
    {
        if (from == default || to <= from || to - from > TimeSpan.FromDays(366))
            throw Bad("Choose an export period of up to 366 days. The end is exclusive.");
    }

    private static bool IsMoney(decimal value) => value >= 0 && value <= 999999.99m && decimal.Round(value, 2) == value;

    private static T ParseEnum<T>(string? value, string message) where T : struct, Enum =>
        Enum.TryParse<T>(value?.Trim(), true, out var parsed) && Enum.IsDefined(parsed) && !int.TryParse(value, out _) ? parsed : throw Bad(message);

    /// <summary>The fixed half-month sales period, in Malaysia time.</summary>
    private static (DateTimeOffset Start, DateTimeOffset End) CanonicalPeriod(string? month, int half)
    {
        if (!DateTime.TryParseExact(month?.Trim(), "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var m) || half is not (1 or 2))
            throw Bad("Choose the sales period: the month, and the 1st–15th or the 16th to month end.");
        var start = new DateTimeOffset(m.Year, m.Month, half == 1 ? 1 : 16, 0, 0, 0, MalaysiaOffset);
        return (start, HalfMonthEnd(start));
    }

    private static DateTimeOffset HalfMonthEnd(DateTimeOffset start)
    {
        var local = start.ToOffset(MalaysiaOffset);
        return local.Day < 16
            ? new DateTimeOffset(local.Year, local.Month, 16, 0, 0, 0, MalaysiaOffset)
            : new DateTimeOffset(local.Year, local.Month, 1, 0, 0, 0, MalaysiaOffset).AddMonths(1);
    }

    // --- Contributors, version history and submission content ---------------------------

    private async Task AddContributorAsync(string subjectType, Guid subjectId, Guid admin, string role, CancellationToken ct)
    {
        if (db.ChangeTracker.Entries<ConsignmentRecordContributor>().Any(e => e.Entity.SubjectType == subjectType
                && e.Entity.SubjectId == subjectId && e.Entity.AdminUserId == admin)
            || await db.ConsignmentRecordContributors.AnyAsync(c => c.SubjectType == subjectType && c.SubjectId == subjectId && c.AdminUserId == admin, ct))
            return;
        db.ConsignmentRecordContributors.Add(new ConsignmentRecordContributor { SubjectType = subjectType, SubjectId = subjectId,
            AdminUserId = admin, Role = role, FirstContributedAt = time.GetUtcNow() });
    }

    /// <summary>Whether an admin contributed to any of these subjects. Disabling or re-enabling them changes nothing.</summary>
    private Task<bool> ContributedAsync(string subjectType, IReadOnlyCollection<Guid> subjectIds, Guid admin, CancellationToken ct) =>
        db.ConsignmentRecordContributors.AnyAsync(c => c.SubjectType == subjectType && subjectIds.Contains(c.SubjectId) && c.AdminUserId == admin, ct);

    private sealed record ReportAncestor(Guid Id, ConsignmentSalesReportStatus Status, bool HistoryComplete, bool StartsFresh);

    /// <summary>The earlier versions a report corrects, nearest first.</summary>
    private async Task<List<ReportAncestor>> ReportAncestorsAsync(ConsignmentSalesReport report, CancellationToken ct)
    {
        var result = new List<ReportAncestor>();
        for (var next = report.SupersedesReportId; next is Guid id && result.Count < 1000;)
        {
            var row = await db.ConsignmentSalesReports.AsNoTracking().Where(x => x.Id == id)
                .Select(x => new { x.Id, x.Status, x.SupersedesReportId, x.ContributorHistoryComplete, x.StartsFreshContributorHistory }).SingleAsync(ct);
            result.Add(new(row.Id, row.Status, row.ContributorHistoryComplete, row.StartsFreshContributorHistory));
            next = row.SupersedesReportId;
        }
        return result;
    }

    /// <summary>
    /// The verified version a correction replaces. A correction of a disputed correction still
    /// replaces the last verified version, so its postings are reversed exactly once.
    /// </summary>
    private static ReportAncestor? VerifiedAncestor(IEnumerable<ReportAncestor> ancestors) =>
        ancestors.TakeWhile(a => a.Status != ConsignmentSalesReportStatus.Superseded)
            .FirstOrDefault(a => a.Status == ConsignmentSalesReportStatus.Verified);

    /// <summary>
    /// The versions whose contributors bear on a report's figures: the report and the versions it
    /// corrects, back to one re-entered from evidence. Complete only if every one kept its history.
    /// </summary>
    private static (Guid[] Ids, bool Complete) ContributorSegment(ConsignmentSalesReport report, IEnumerable<ReportAncestor> ancestors)
    {
        var ids = new List<Guid> { report.Id };
        var complete = report.ContributorHistoryComplete;
        if (!report.StartsFreshContributorHistory)
            foreach (var ancestor in ancestors)
            {
                ids.Add(ancestor.Id);
                complete &= ancestor.HistoryComplete;
                if (ancestor.StartsFresh) break;
            }
        return (ids.ToArray(), complete);
    }

    private const string UnknownReportHistory = "Earlier edits to this sales report weren't recorded, so nobody can verify it as an independent reviewer. "
        + "Re-enter it from the partner's evidence (dispute it first if it's only recorded), or self-review it in Solo Mode.";

    /// <summary>Unknown contributor history can only be self-reviewed, which only Solo Mode allows.</summary>
    private async Task RequireSoloForUnknownHistoryAsync(string message, CancellationToken ct)
    {
        var mode = await db.ConsignmentApprovalPolicies.AsNoTracking().Select(p => (ConsignmentApprovalMode?)p.Mode).SingleOrDefaultAsync(ct);
        if (mode != ConsignmentApprovalMode.Solo) throw new ApiException(403, "contributor_history_incomplete", message);
    }

    /// <summary>
    /// Where reporting under an agreement version ends: its own end, or the start of a later approved
    /// version of the same agreement if that comes first. Signed terms are never rewritten.
    /// </summary>
    private async Task<DateTimeOffset?> ReportingEndAsync(ConsignmentAgreement a, CancellationToken ct)
    {
        var successorStart = await db.ConsignmentAgreements.AsNoTracking().Where(x => x.MerchantId == a.MerchantId && x.Reference == a.Reference
            && x.Version > a.Version && x.ApprovedAt != null && x.EffectiveFrom != null).MinAsync(x => x.EffectiveFrom, ct);
        return successorStart is { } next && (a.EffectiveTo is null || next < a.EffectiveTo) ? next : a.EffectiveTo;
    }

    /// <summary>A price term's editable values as stored, compared field by field with their own type semantics.</summary>
    private sealed record PriceTermValues(Guid ProductVariantId, ConsignmentPriceTermKind Kind, string Name, decimal UnitNetPrice,
        DateTimeOffset ValidFrom, DateTimeOffset? ValidToExclusive, string? ApprovalEvidenceReference);

    private static PriceTermValues PriceTermContent(ConsignmentPriceTerm t) =>
        new(t.ProductVariantId, t.Kind, t.Name, t.UnitNetPrice, t.ValidFrom, t.ValidToExclusive, t.ApprovalEvidenceReference);

    private sealed record ReportHeaderValues(Guid AgreementId, Guid BranchId, string PeriodMonth, int Half, string Reference,
        DateTimeOffset ReceivedAt, string EvidenceLevel, string EvidenceKind, string EvidenceReference, string? Notes);

    private sealed record ReportLineValues(Guid VariantId, string LineType, Guid? PriceTermId, decimal UnitNetPrice, int Quantity,
        DateTimeOffset? RefundOfPeriodStart, int Restockable, int Unsellable, string? Notes, bool SealedConfirmed, string? SealedEvidence);

    /// <summary>
    /// Whether two submissions say the same thing, normalised the way it is stored and compared value by
    /// value: text, amounts and instants each with their own equality, never as joined text.
    /// </summary>
    private static bool SameReport(SaveConsignmentSalesReportRequest a, SaveConsignmentSalesReportRequest b) =>
        ReportHeader(a) == ReportHeader(b) && ReportLines(a).SequenceEqual(ReportLines(b));

    private static ReportHeaderValues ReportHeader(SaveConsignmentSalesReportRequest r) =>
        new(r.AgreementId, r.MerchantBranchId, r.PeriodMonth?.Trim() ?? "", r.Half, (r.PartnerReference?.Trim() ?? "").ToUpperInvariant(),
            r.ReportReceivedAt, (r.EvidenceLevel?.Trim() ?? "").ToUpperInvariant(), (r.EvidenceKind?.Trim() ?? "").ToUpperInvariant(),
            Trim(r.EvidenceReference) ?? "", Trim(r.Notes));

    private static ReportLineValues[] ReportLines(SaveConsignmentSalesReportRequest r) =>
        (r.Lines ?? []).Select(l => {
            var restock = l.RestockableQuantity > 0;
            return new ReportLineValues(l.ProductVariantId, (l.LineType?.Trim() ?? "").ToUpperInvariant(), l.PriceTermId, l.UnitNetPrice, l.Quantity,
                l.RefundOfPeriodStart, l.RestockableQuantity, l.UnsellableReturnedQuantity, Trim(l.Notes), restock && l.SealedReturnConfirmed,
                restock ? Trim(l.SealedReturnEvidence) : null);
        })
        // A total order over every field, so equal collections of lines line up the same way.
        .OrderBy(l => l.VariantId).ThenBy(l => l.LineType, StringComparer.Ordinal).ThenBy(l => l.PriceTermId).ThenBy(l => l.UnitNetPrice)
        .ThenBy(l => l.RefundOfPeriodStart?.UtcTicks).ThenBy(l => l.Quantity).ThenBy(l => l.Restockable).ThenBy(l => l.Unsellable)
        .ThenBy(l => l.Notes, StringComparer.Ordinal).ThenBy(l => l.SealedConfirmed).ThenBy(l => l.SealedEvidence, StringComparer.Ordinal)
        .ToArray();

    /// <summary>A saved report expressed as the submission that would produce it.</summary>
    private static SaveConsignmentSalesReportRequest StoredRequest(ConsignmentSalesReport x, IEnumerable<ConsignmentSalesReportLine> lines)
    {
        var local = x.PeriodStart.ToOffset(MalaysiaOffset);
        return new(x.AgreementId, x.MerchantBranchId, local.ToString("yyyy-MM", CultureInfo.InvariantCulture), local.Day < 16 ? 1 : 2,
            x.PartnerReference, x.ReportReceivedAt, x.EvidenceLevel.ToString(), x.EvidenceKind, x.EvidenceReference, x.Notes,
            lines.Select(l => new ConsignmentSalesLineRequest(l.ProductVariantId, l.LineType.ToString(), l.PriceTermId, l.UnitNetPrice,
                l.Quantity, l.RefundOfPeriodStart, l.RestockableQuantity, l.UnsellableReturnedQuantity, l.Notes,
                l.SealedReturnConfirmed, l.SealedReturnEvidence)).ToArray());
    }

    private static DateTimeOffset StartOfMalaysiaDay(DateTimeOffset value)
    {
        var local = value.ToOffset(MalaysiaOffset);
        return new DateTimeOffset(local.Year, local.Month, local.Day, 0, 0, 0, MalaysiaOffset);
    }

    private static ConsignmentPriceTermResponse MapPriceTerm(ConsignmentPriceTerm t) => new(t.Id, t.AgreementId, t.ProductVariantId,
        t.SkuSnapshot, t.Kind.ToString(), t.Name, t.UnitNetPrice, t.ValidFrom, t.ValidToExclusive, t.ApprovalEvidenceReference,
        t.Status.ToString(), t.ApprovedAt, t.ReviewMode, Convert.ToBase64String(t.RowVersion), t.ContributorHistoryComplete);
}
