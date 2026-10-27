using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// The financial layer over verified partner sales. A verified report version produces
// a settlement revision: what the partner owes MyPetLink for the period, and the sales
// commission it carries. Commission accrues as Pending and becomes Payable only when
// that period's remittance has been received in full.
//
// Rounding: line values are exact (a two-decimal price times whole units). The partner's
// commission is rounded once per commission-rate group, two decimals, midpoint away from
// zero, never per tag. Sales commission is a fixed amount per unit, so it never rounds.
public sealed partial class ConsignmentService
{
    private const string SettlementSubject = "ConsignmentSettlement";
    private const string ServicingSource = "ServicingAssignment";
    private const string OperatorSource = "OperatorResolution";

    private sealed record CommissionGroupKey(Guid SalespersonId, SalesCommissionType Type, decimal UnitAmount);

    /// <summary>
    /// One salesperson's commission on one kind of sale in one period: the period's own verified
    /// sales less every verified refund of them, wherever the refund was reported.
    /// </summary>
    private sealed class CommissionGroupTarget
    {
        public int SaleUnits;
        public decimal SaleValue;
        public int RefundUnits;
        public Guid? RuleId;
        public string PolicyCode = "";
        /// <summary>Refunded units by the period start of the report that reported them.</summary>
        public Dictionary<DateTimeOffset, int> RefundsBySource = [];
        public int TargetUnits => Math.Max(SaleUnits - RefundUnits, 0);
    }

    private sealed record RefundOfPeriod(DateTimeOffset SourcePeriodStart, Guid PriceTermId, int Quantity);
    private sealed record PlannedRecovery(Guid CausedBySettlementId, SalesCommission Origin, Guid? PayoutId, int Quantity, decimal UnitAmount);

    private sealed class CommissionPlan
    {
        public readonly List<SalesCommission> Reverse = [];
        public readonly List<SalesCommission> Demote = [];
        public readonly List<(CommissionGroupKey Key, CommissionGroupTarget Target, int Units)> Issue = [];
        public readonly List<PlannedRecovery> Recoveries = [];
        public bool ChangesLedger => Reverse.Count > 0 || Demote.Count > 0 || Issue.Count > 0;
    }

    // --- Verification hook ---------------------------------------------------

    /// <summary>
    /// Records the settlement for a report that has just been verified, inside the verification
    /// transaction. A period first verified before settlements existed is left alone: its money
    /// was handled outside the system and is never back-filled here. Refunds in the report then
    /// adjust the commission of the periods whose sales they reverse.
    /// </summary>
    private async Task SettleVerifiedReportAsync(ConsignmentSalesReport report, IReadOnlyCollection<Guid> replaced,
        bool replacedVerifiedVersion, Guid admin, CancellationToken ct)
    {
        var settlement = await db.ConsignmentSettlements
            .SingleOrDefaultAsync(s => s.MerchantBranchId == report.MerchantBranchId && s.PeriodStart == report.PeriodStart, ct);
        if (settlement is null && replacedVerifiedVersion)
        {
            audit.Append(admin, ActorType.Admin, "consignment.settlement-not-started", SalesReportSubject, report.Id, null,
                new { reason = "This period was verified before settlements were recorded; it stays outside the settlement ledger." });
        }
        else
        {
            if (settlement is null)
            {
                var now = time.GetUtcNow();
                settlement = new ConsignmentSettlement
                {
                    SettlementNumber = await numbers.NextConsignmentSettlementNumberAsync(now, ct),
                    MerchantId = report.MerchantId, MerchantBranchId = report.MerchantBranchId, AgreementId = report.AgreementId,
                    PeriodStart = report.PeriodStart, PeriodEndExclusive = report.PeriodEndExclusive,
                    SalesReportId = report.Id, SalesReportVersion = report.Version, Status = ConsignmentSettlementStatus.AwaitingPayment,
                    CreatedAt = now, UpdatedAt = now,
                };
                await AttributeAutomaticallyAsync(settlement, ct);
                db.ConsignmentSettlements.Add(settlement);
                audit.Append(admin, ActorType.Admin, "consignment.settlement-opened", SettlementSubject, settlement.Id, null,
                    new { settlement.SettlementNumber, settlement.PeriodStart, attribution = settlement.AttributionStatus.ToString(),
                        settlement.SalespersonId, settlement.CommissionPolicyCode, settlement.AttributionIssue });
            }
            await ReviseSettlementAsync(settlement, report, $"Sales report {report.PartnerReference} v{report.Version} verified",
                admin, report, replaced, onlyIfCommissionChanges: false, ct);
        }

        // A refund of an earlier period's sale reduces that period's commission, for the salesperson and at
        // the rate that sale earned. A correction that drops a refund restores it, so both versions count.
        var origins = report.Lines.Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart != report.PeriodStart)
            .Select(l => l.RefundOfPeriodStart!.Value).ToList();
        if (replaced.Count > 0)
            origins.AddRange(await db.ConsignmentSalesReportLines.AsNoTracking()
                .Where(l => replaced.Contains(l.SalesReportId) && l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart != report.PeriodStart)
                .Select(l => l.RefundOfPeriodStart!.Value).ToListAsync(ct));
        foreach (var start in origins.Distinct().OrderBy(x => x))
        {
            var origin = await db.ConsignmentSettlements.SingleOrDefaultAsync(x => x.MerchantBranchId == report.MerchantBranchId && x.PeriodStart == start, ct);
            if (origin is null) continue;
            await ReviseSettlementAsync(origin, await SettlementReportAsync(origin, ct),
                $"Refunds in sales report {report.PartnerReference} v{report.Version} changed this period's commission",
                admin, report, replaced, onlyIfCommissionChanges: true, ct);
        }
    }

    // --- Attribution -----------------------------------------------------------

    /// <summary>
    /// The salesperson who earns a period's commission is the merchant's servicing representative,
    /// but only when exactly one representative covered the whole period. A reported period has
    /// no sale dates, so a mid-period reassignment can't be split fairly: an operator decides.
    /// </summary>
    private async Task AttributeAutomaticallyAsync(ConsignmentSettlement s, CancellationToken ct)
    {
        var rows = await MerchantServicingHistory.OverlappingAsync(db, s.MerchantId, s.PeriodStart, s.PeriodEndExclusive, ct);
        if (rows.Count == 0)
        {
            NeedsResolution(s, "No servicing representative was recorded for this partner during the period. Choose who earns its commission, or record that nobody does.");
            return;
        }
        var only = rows[0];
        if (rows.Count > 1 || only.EffectiveFrom > s.PeriodStart || only.EffectiveToExclusive is { } to && to < s.PeriodEndExclusive)
        {
            var names = string.Join(", ", rows.Select(r => r.SalespersonNameSnapshot).Distinct());
            NeedsResolution(s, rows.Count > 1
                ? $"The servicing representative changed during this period ({names}). Reported sales have no dates, so choose who earns this period's commission."
                : $"{names} was the servicing representative for only part of this period. Choose who earns this period's commission.");
            return;
        }
        var salesperson = await db.Salespersons.AsNoTracking().SingleAsync(x => x.Id == only.SalespersonId, ct);
        if (!salesperson.IsActive)
        {
            NeedsResolution(s, $"{salesperson.Name} is inactive. Choose who earns this period's commission, or record that nobody does.");
            return;
        }
        await ResolveAttributionAsync(s, salesperson, ServicingSource, automatic: true, ct);
    }

    private static void NeedsResolution(ConsignmentSettlement s, string issue)
    {
        s.AttributionStatus = ConsignmentAttributionStatus.NeedsResolution;
        s.AttributionIssue = issue;
        s.AttributionSource = null;
        s.SalespersonId = null; s.SalespersonCodeSnapshot = null; s.SalespersonNameSnapshot = null;
        s.CommissionPolicyCode = null; s.PolicyAssignmentId = null;
    }

    /// <summary>
    /// Fixes who earns the period, then, separately, whether their commission terms cover it. Only
    /// terms in force for the whole period make it commissionable: reported sales carry no sale
    /// dates, so a period the terms cover only partly earns nothing rather than a guessed share.
    /// Naming the salesperson never extends their terms.
    /// </summary>
    private async Task ResolveAttributionAsync(ConsignmentSettlement s, Salesperson? salesperson, string source,
        bool automatic, CancellationToken ct)
    {
        s.AttributionStatus = ConsignmentAttributionStatus.Resolved;
        s.AttributionIssue = null;
        s.AttributionSource = source;
        s.SalespersonId = salesperson?.Id;
        s.SalespersonCodeSnapshot = salesperson?.SalespersonCode;
        s.SalespersonNameSnapshot = salesperson?.Name;
        s.CommissionPolicyCode = null; s.PolicyAssignmentId = null;
        if (salesperson is null) return;
        var policies = await OverlappingPoliciesAsync(salesperson.Id, s, ct);
        var covering = policies.FirstOrDefault(p => Covers(p, s));
        if (covering is null && policies.Count > 0 && automatic)
        {
            // Automatic attribution asks a person to look at it; the decision still never pays the uncovered part.
            NeedsResolution(s, $"{salesperson.Name}'s commission terms start or end during this period. Confirm who earns this period's commission.");
            return;
        }
        s.CommissionPolicyCode = covering?.PolicyCode;
        s.PolicyAssignmentId = covering?.Id;
    }

    private Task<List<SalespersonPolicyAssignment>> OverlappingPoliciesAsync(Guid salespersonId, ConsignmentSettlement s, CancellationToken ct) =>
        db.SalespersonPolicyAssignments.AsNoTracking()
            .Where(p => p.SalespersonId == salespersonId && p.EffectiveFrom < s.PeriodEndExclusive
                && (p.EffectiveToExclusive == null || p.EffectiveToExclusive > s.PeriodStart))
            .OrderBy(p => p.EffectiveFrom).ToListAsync(ct);

    private static bool Covers(SalespersonPolicyAssignment p, ConsignmentSettlement s) =>
        p.EffectiveFrom <= s.PeriodStart && p.AcceptedAt <= s.PeriodStart
        && (p.EffectiveToExclusive == null || p.EffectiveToExclusive >= s.PeriodEndExclusive);

    // --- Revision ----------------------------------------------------------------

    /// <summary>
    /// Recalculates a settlement from its verified report and writes a new revision. With
    /// <paramref name="onlyIfCommissionChanges"/> (a later period's refunds touching this one), nothing is
    /// written unless the period's commission or recovery actually changes.
    /// </summary>
    private async Task<bool> ReviseSettlementAsync(ConsignmentSettlement s, ConsignmentSalesReport report, string reason, Guid admin,
        ConsignmentSalesReport? live, IReadOnlyCollection<Guid> replaced, bool onlyIfCommissionChanges, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var lines = report.Lines.OrderBy(l => l.LineType).ThenBy(l => l.SkuSnapshot).ThenBy(l => l.Id).ToList();
        var termIds = lines.Where(l => l.PriceTermId.HasValue).Select(l => l.PriceTermId!.Value).Distinct().ToArray();
        var terms = await db.ConsignmentPriceTerms.AsNoTracking().Include(t => t.Agreement)
            .Where(t => termIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ct);
        if (lines.Any(l => l.PriceTermId is not Guid id || !terms.ContainsKey(id)))
            throw Conflict("Every verified line needs an approved price before its settlement can be calculated.");

        // Evidence only: who earned the sale a refund of an earlier period reverses. That period's own
        // settlement carries the commission effect.
        var origins = lines.Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart != report.PeriodStart)
            .Select(l => l.RefundOfPeriodStart!.Value).Distinct().ToList();
        var originCommission = new Dictionary<(DateTimeOffset, Guid), (Guid Salesperson, decimal Unit, Guid? Rule)>();
        if (origins.Count > 0)
        {
            var originSettlements = await db.ConsignmentSettlements.AsNoTracking()
                .Where(x => x.MerchantBranchId == report.MerchantBranchId && origins.Contains(x.PeriodStart))
                .Select(x => new { x.Id, x.PeriodStart, x.Revision }).ToListAsync(ct);
            foreach (var origin in originSettlements)
                foreach (var line in await db.ConsignmentSettlementLines.AsNoTracking()
                             .Where(l => l.RevisionRecord!.SettlementId == origin.Id && l.RevisionRecord.Revision == origin.Revision
                                 && l.LineType == ConsignmentSalesLineType.Sale && l.CommissionSalespersonId != null)
                             .Select(l => new { l.PriceTermId, l.CommissionSalespersonId, l.CommissionUnitAmount, l.CommissionRuleId }).ToListAsync(ct))
                    originCommission.TryAdd((origin.PeriodStart, line.PriceTermId),
                        (line.CommissionSalespersonId!.Value, line.CommissionUnitAmount!.Value, line.CommissionRuleId));
        }

        // A period keeps the first rate it was ever calculated at for each kind of sale, across every
        // revision, even one where that kind was absent: a later rule never re-prices a correction.
        var settledRates = new Dictionary<ConsignmentPriceTermKind, (decimal Unit, Guid? Rule)>();
        if (s.Revision > 0 && s.SalespersonId is Guid earner)
            foreach (var line in await db.ConsignmentSettlementLines.AsNoTracking()
                         .Where(l => l.RevisionRecord!.SettlementId == s.Id && l.LineType == ConsignmentSalesLineType.Sale
                             && l.CommissionSalespersonId == earner && l.CommissionUnitAmount != null)
                         .OrderBy(l => l.RevisionRecord!.Revision).ThenBy(l => l.Id)
                         .Select(l => new { l.PriceKind, l.CommissionUnitAmount, l.CommissionRuleId }).ToListAsync(ct))
                settledRates.TryAdd(line.PriceKind, (line.CommissionUnitAmount!.Value, line.CommissionRuleId));

        var revisionLines = new List<ConsignmentSettlementLine>();
        var missingRates = new SortedSet<string>(StringComparer.Ordinal);
        var rateCache = new Dictionary<SalesCommissionType, CommissionRule?>();
        var groups = new Dictionary<CommissionGroupKey, CommissionGroupTarget>();
        var termGroup = new Dictionary<Guid, CommissionGroupKey>();
        foreach (var l in lines.OrderBy(l => l.LineType == ConsignmentSalesLineType.Refund))
        {
            var term = terms[l.PriceTermId!.Value];
            var refund = l.LineType == ConsignmentSalesLineType.Refund;
            var amount = l.UnitNetPrice * l.Quantity * (refund ? -1 : 1);
            // A sale counts under this report's agreement version; a refund under the version its sale was made in.
            var rate = refund ? term.Agreement.PartnerCommissionPercentage : report.Agreement.PartnerCommissionPercentage;
            var type = term.Kind == ConsignmentPriceTermKind.Standard
                ? SalesCommissionType.ConsignmentStandardPerUnit : SalesCommissionType.ConsignmentPromotionPerUnit;
            (Guid Salesperson, decimal Unit, Guid? Rule)? commission = null;
            if (!refund)
            {
                if (s.SalespersonId is not Guid seller || s.CommissionPolicyCode is not string policy) { }
                else if (settledRates.TryGetValue(term.Kind, out var settled))
                    commission = (seller, settled.Unit, settled.Rule);
                else
                {
                    if (!rateCache.TryGetValue(type, out var rule))
                        rateCache[type] = rule = await ConsignmentRateAsync(type, seller, policy, s.PeriodStart, ct);
                    if (rule?.FixedAmount is decimal unit) { commission = (seller, unit, rule.Id); settledRates[term.Kind] = (unit, rule.Id); }
                    else missingRates.Add(term.Kind.ToString());
                }
                if (commission is { } c)
                {
                    var key = new CommissionGroupKey(c.Salesperson, type, c.Unit);
                    if (!groups.TryGetValue(key, out var target))
                        groups[key] = target = new CommissionGroupTarget { RuleId = c.Rule, PolicyCode = s.CommissionPolicyCode! };
                    target.SaleUnits += l.Quantity;
                    target.SaleValue += amount;
                    termGroup[term.Id] = key;
                }
            }
            else if (l.RefundOfPeriodStart == report.PeriodStart)
            {
                var sameTerm = revisionLines.FirstOrDefault(x => x.LineType == ConsignmentSalesLineType.Sale
                    && x.PriceTermId == term.Id && x.CommissionSalespersonId != null);
                if (sameTerm is not null) commission = (sameTerm.CommissionSalespersonId!.Value, sameTerm.CommissionUnitAmount!.Value, sameTerm.CommissionRuleId);
            }
            else if (originCommission.TryGetValue((l.RefundOfPeriodStart!.Value, term.Id), out var found)) commission = found;

            revisionLines.Add(new ConsignmentSettlementLine
            {
                SourceReportLineId = l.Id, LineType = l.LineType, ProductVariantId = l.ProductVariantId, SkuSnapshot = l.SkuSnapshot,
                PriceTermId = term.Id, PriceKind = term.Kind, UnitPrice = l.UnitNetPrice, Quantity = l.Quantity, Amount = amount,
                MerchantCommissionPercentage = rate, RefundOfPeriodStart = refund ? l.RefundOfPeriodStart : null,
                CommissionSalespersonId = commission?.Salesperson, CommissionUnitAmount = commission?.Unit, CommissionRuleId = commission?.Rule,
            });
        }
        // Every verified refund of this period's sales, including those reported in later periods.
        foreach (var r in await RefundsOfPeriodAsync(s.MerchantBranchId, s.PeriodStart, live, replaced, ct))
            if (termGroup.TryGetValue(r.PriceTermId, out var key))
            {
                var target = groups[key];
                target.RefundUnits += r.Quantity;
                target.RefundsBySource[r.SourcePeriodStart] = target.RefundsBySource.GetValueOrDefault(r.SourcePeriodStart) + r.Quantity;
            }

        // The partner's commission: one rounding per rate group, over the exact signed group total.
        var merchantCommission = revisionLines.GroupBy(l => l.MerchantCommissionPercentage)
            .Sum(g => MerchantSalesTotals.Round(g.Sum(l => l.Amount) * g.Key / 100m));
        var sales = revisionLines.Where(l => l.LineType == ConsignmentSalesLineType.Sale).ToList();
        var refunds = revisionLines.Where(l => l.LineType == ConsignmentSalesLineType.Refund).ToList();
        var standardSales = sales.Where(l => l.PriceKind == ConsignmentPriceTermKind.Standard).Sum(l => l.Amount);
        var promotionSales = sales.Where(l => l.PriceKind == ConsignmentPriceTermKind.Promotion).Sum(l => l.Amount);
        var refundAmount = -refunds.Sum(l => l.Amount);
        var eligible = standardSales + promotionSales - refundAmount;
        var expected = eligible - merchantCommission;
        var satisfied = IsSatisfied(StatusFor(expected, s.ReceivedAmount));

        await LockSettlementCommissionAsync(s.Id, ct);
        var rows = await db.SalesCommissions.Include(c => c.PayoutItems.Where(i => i.ReleasedAt == null)).ThenInclude(i => i.CommissionPayout)
            .Where(c => c.ConsignmentSettlementId == s.Id && c.Status != SalesCommissionStatus.Reversed).ToListAsync(ct);
        var previousRecoveries = await db.ConsignmentCommissionRecoveries.AsNoTracking()
            .Where(x => x.SettlementId == s.Id && x.SettlementRevision == s.Revision).ToListAsync(ct);
        var plan = await PlanCommissionAsync(s, groups, rows, satisfied, ct);
        if (onlyIfCommissionChanges && !plan.ChangesLedger && SameRecoveries(plan.Recoveries, previousRecoveries)) return false;

        var revision = new ConsignmentSettlementRevision
        {
            SettlementId = s.Id, Revision = s.Revision + 1, SalesReportId = report.Id, SalesReportVersion = report.Version,
            Reason = reason.Length > 500 ? reason[..500] : reason, SalespersonId = s.SalespersonId,
            CommissionPolicyCode = s.CommissionPolicyCode, CreatedAt = now, CreatedByAdminUserId = admin,
        };
        foreach (var line in revisionLines) revision.Lines.Add(line);
        s.StandardQuantity = revision.StandardQuantity = sales.Where(l => l.PriceKind == ConsignmentPriceTermKind.Standard).Sum(l => l.Quantity);
        s.StandardSales = revision.StandardSales = standardSales;
        s.PromotionQuantity = revision.PromotionQuantity = sales.Where(l => l.PriceKind == ConsignmentPriceTermKind.Promotion).Sum(l => l.Quantity);
        s.PromotionSales = revision.PromotionSales = promotionSales;
        s.RefundQuantity = revision.RefundQuantity = refunds.Sum(l => l.Quantity);
        s.RefundAmount = revision.RefundAmount = refundAmount;
        s.EligibleSales = revision.EligibleSales = eligible;
        s.MerchantCommission = revision.MerchantCommission = merchantCommission;
        s.ExpectedRemittance = revision.ExpectedRemittance = expected;
        s.SalesCommissionTarget = revision.SalesCommissionTarget = groups.Sum(g => g.Value.TargetUnits * g.Key.UnitAmount);
        revision.CommissionRecoveryRequired = plan.Recoveries.Sum(r => r.Quantity * r.UnitAmount);
        s.Revision = revision.Revision;
        s.SalesReportId = report.Id; s.SalesReportVersion = report.Version; s.AgreementId = report.AgreementId;
        s.CommissionNote = await CommissionNoteForAsync(s, missingRates, ct);
        s.UpdatedAt = now;
        ApplySettlementStatus(s, now);

        await ApplyCommissionPlanAsync(s, report, plan, admin, now, ct);
        db.ConsignmentSettlementRevisions.Add(revision);
        if (IsSatisfied(s.Status)) await PromotePendingCommissionAsync(s, now, ct);
        foreach (var r in plan.Recoveries)
            db.ConsignmentCommissionRecoveries.Add(new ConsignmentCommissionRecovery
            {
                SettlementId = s.Id, SettlementRevision = s.Revision, CausedBySettlementId = r.CausedBySettlementId,
                SalespersonId = r.Origin.SalespersonId, OriginCommissionId = r.Origin.Id, CommissionPayoutId = r.PayoutId,
                Quantity = r.Quantity, UnitAmount = r.UnitAmount, Amount = r.Quantity * r.UnitAmount, CreatedAt = now,
            });
        audit.Append(admin, ActorType.Admin, "consignment.settlement-revised", SettlementSubject, s.Id, null,
            new { s.SettlementNumber, revision.Revision, reason, report = report.Id, report.Version, s.EligibleSales, s.MerchantCommission,
                s.ExpectedRemittance, s.ReceivedAmount, status = s.Status.ToString(), s.SalesCommissionTarget,
                recoveries = plan.Recoveries.Select(r => new { r.CausedBySettlementId, origin = r.Origin.Id, r.PayoutId, r.Quantity, r.UnitAmount }),
                s.CommissionNote });
        // Persist this period before totals are read back, so a later period in the same transaction sees it.
        await db.SaveChangesAsync(ct);
        await RefreshRecoveryTotalsAsync(previousRecoveries.Select(r => r.CausedBySettlementId)
            .Concat(plan.Recoveries.Select(r => r.CausedBySettlementId)).Append(s.Id), ct);
        return true;
    }

    /// <summary>Every verified refund of one period's sales, from any report at the branch, including the one being verified.</summary>
    private async Task<List<RefundOfPeriod>> RefundsOfPeriodAsync(Guid branch, DateTimeOffset periodStart, ConsignmentSalesReport? live,
        IReadOnlyCollection<Guid> replaced, CancellationToken ct)
    {
        var liveId = live?.Id;
        var result = await db.ConsignmentSalesReportLines.AsNoTracking()
            .Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart == periodStart && l.PriceTermId != null
                && l.SalesReport.MerchantBranchId == branch && l.SalesReport.Status == ConsignmentSalesReportStatus.Verified
                && !replaced.Contains(l.SalesReportId) && l.SalesReportId != liveId)
            .Select(l => new RefundOfPeriod(l.SalesReport.PeriodStart, l.PriceTermId!.Value, l.Quantity)).ToListAsync(ct);
        if (live is not null && live.MerchantBranchId == branch)
            result.AddRange(live.Lines.Where(l => l.LineType == ConsignmentSalesLineType.Refund && l.RefundOfPeriodStart == periodStart && l.PriceTermId != null)
                .Select(l => new RefundOfPeriod(live.PeriodStart, l.PriceTermId!.Value, l.Quantity)));
        return result;
    }

    private async Task<string?> CommissionNoteForAsync(ConsignmentSettlement s, IReadOnlyCollection<string> missingRates, CancellationToken ct)
    {
        if (s.AttributionStatus == ConsignmentAttributionStatus.NeedsResolution) return "Commission waits until the salesperson for this period is confirmed.";
        if (s.SalespersonId is not Guid seller) return "No salesperson earns commission on this period.";
        if (s.CommissionPolicyCode is null)
        {
            var policies = await OverlappingPoliciesAsync(seller, s, ct);
            if (policies.FirstOrDefault(p => Covers(p, s)) is { } covering)
                return $"{s.SalespersonNameSnapshot}'s {covering.PolicyCode} terms, recorded after this period was calculated, cover it. Recalculate the period to apply them.";
            if (policies.FirstOrDefault() is { } partial)
                return $"{s.SalespersonNameSnapshot}'s {partial.PolicyCode} terms cover only part of this period (from {partial.EffectiveFrom.ToOffset(MalaysiaOffset):d MMM yyyy}"
                    + (partial.EffectiveToExclusive is { } end ? $" until {end.ToOffset(MalaysiaOffset):d MMM yyyy}" : "")
                    + "). Reported sales carry no sale dates, so this period earns no commission under them.";
            return $"{s.SalespersonNameSnapshot} has no recorded commission terms that pay consignment commission for this period.";
        }
        return missingRates.Count > 0
            ? $"No active {s.CommissionPolicyCode} rate covers {string.Join(" and ", missingRates).ToLowerInvariant()} sales in this period. Add the rate, then recalculate."
            : null;
    }

    /// <summary>The per-unit rate for one salesperson under their policy: their own rule first, then the global rate card.</summary>
    private async Task<CommissionRule?> ConsignmentRateAsync(SalesCommissionType type, Guid salesperson, string policy,
        DateTimeOffset at, CancellationToken ct)
    {
        var eligible = db.CommissionRules.AsNoTracking().Where(r => r.CommissionType == type && r.IsActive && r.PolicyCode == policy
            && r.Currency == MerchantSalesConstants.Currency && r.EffectiveFrom <= at && (r.EffectiveTo == null || r.EffectiveTo > at));
        return await eligible.Where(r => r.SalespersonId == salesperson).OrderByDescending(r => r.EffectiveFrom).FirstOrDefaultAsync(ct)
            ?? await eligible.Where(r => r.SalespersonId == null).OrderByDescending(r => r.EffectiveFrom).FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// Works out how the period's ledger rows must change. Unpaid rows of a changed group are reversed
    /// and re-issued at the new quantity; paid rows are never touched. Unpaid rows of a period the partner
    /// no longer has fully paid go back to Pending, even when their quantity is unchanged. Anything already
    /// paid above the entitlement becomes a recovery obligation, attributed to the settlement whose report
    /// caused it. A row reserved in a prepared payout refuses any change to it.
    /// </summary>
    private async Task<CommissionPlan> PlanCommissionAsync(ConsignmentSettlement s, Dictionary<CommissionGroupKey, CommissionGroupTarget> targets,
        List<SalesCommission> rows, bool satisfied, CancellationToken ct)
    {
        var plan = new CommissionPlan();
        var keys = targets.Keys.Concat(rows.Select(r => new CommissionGroupKey(r.SalespersonId, r.CommissionType, r.CommissionFixedAmountSnapshot!.Value)))
            .Distinct().OrderBy(k => k.SalespersonId).ThenBy(k => k.Type).ThenBy(k => k.UnitAmount).ToList();
        var sources = new Dictionary<DateTimeOffset, Guid>();
        foreach (var key in keys)
        {
            var target = targets.GetValueOrDefault(key) ?? new CommissionGroupTarget();
            var group = rows.Where(r => r.SalespersonId == key.SalespersonId && r.CommissionType == key.Type
                && r.CommissionFixedAmountSnapshot == key.UnitAmount).ToList();
            var paid = group.Where(r => r.Status == SalesCommissionStatus.Paid)
                .OrderByDescending(r => r.PaidAt).ThenByDescending(r => r.CalculatedAt).ThenBy(r => r.Id).ToList();
            var paidUnits = paid.Sum(r => r.QualifiedQuantity ?? 0);
            var unpaid = group.Where(r => r.Status is SalesCommissionStatus.Pending or SalesCommissionStatus.Payable).ToList();
            var reserved = unpaid.Where(r => r.PayoutItems.Any(i => i.ReleasedAt == null)).ToList();
            if (paidUnits + unpaid.Sum(r => r.QualifiedQuantity ?? 0) != target.TargetUnits)
            {
                if (reserved.Count > 0)
                    throw Conflict($"Settlement {s.SettlementNumber}'s commission is reserved in payout {PayoutNumbers(reserved)}, and this change alters it. "
                        + "Cancel that payout, then try again: the corrected commission can then be prepared again.");
                plan.Reverse.AddRange(unpaid);
                if (target.TargetUnits > paidUnits) plan.Issue.Add((key, target, target.TargetUnits - paidUnits));
            }
            else if (!satisfied && unpaid.Any(r => r.Status == SalesCommissionStatus.Payable))
            {
                // Same quantity, but the partner no longer has this period paid in full (a corrected price raised what is due).
                if (reserved.Any(r => r.Status == SalesCommissionStatus.Payable))
                    throw Conflict($"This change leaves settlement {s.SettlementNumber} not fully paid, and its commission is reserved in payout {PayoutNumbers(reserved)}. "
                        + "Cancel that payout, then try again: the commission waits until the partner pays the corrected amount.");
                plan.Demote.AddRange(unpaid.Where(r => r.Status == SalesCommissionStatus.Payable));
            }

            var excess = paidUnits - target.TargetUnits;
            if (excess <= 0) continue;
            // Who caused the over-payment: a correction of this period's own sales first, then later refunds, most recent first.
            var causes = new List<(Guid Cause, int Units)>();
            var own = Math.Min(excess, Math.Max(paidUnits - target.SaleUnits, 0));
            if (own > 0) causes.Add((s.Id, own));
            var left = excess - own;
            foreach (var (start, units) in target.RefundsBySource.OrderByDescending(x => x.Key))
            {
                if (left == 0) break;
                if (!sources.TryGetValue(start, out var source))
                    sources[start] = source = start == s.PeriodStart ? s.Id
                        : await db.ConsignmentSettlements.AsNoTracking().Where(x => x.MerchantBranchId == s.MerchantBranchId && x.PeriodStart == start)
                            .Select(x => (Guid?)x.Id).SingleOrDefaultAsync(ct) ?? s.Id;
                var take = Math.Min(left, units);
                causes.Add((source, take)); left -= take;
            }
            if (left > 0) causes.Add((s.Id, left));
            // Allocate each cause to the most recently paid rows first, keeping each row's payout.
            var remaining = paid.Select(r => (Row: r, Units: r.QualifiedQuantity ?? 0)).ToList();
            var index = 0;
            foreach (var (cause, units) in causes)
            {
                var need = units;
                while (need > 0 && index < remaining.Count)
                {
                    var take = Math.Min(need, remaining[index].Units);
                    var row = remaining[index].Row;
                    var payout = row.PayoutItems.FirstOrDefault(i => i.ReleasedAt == null && i.CommissionPayout?.Status == CommissionPayoutStatus.Paid)?.CommissionPayoutId;
                    var existing = plan.Recoveries.FindIndex(p => p.CausedBySettlementId == cause && p.Origin.Id == row.Id);
                    if (existing >= 0) plan.Recoveries[existing] = plan.Recoveries[existing] with { Quantity = plan.Recoveries[existing].Quantity + take };
                    else plan.Recoveries.Add(new(cause, row, payout, take, key.UnitAmount));
                    remaining[index] = (row, remaining[index].Units - take);
                    need -= take;
                    if (remaining[index].Units == 0) index++;
                }
            }
        }
        return plan;
    }

    private static string PayoutNumbers(IEnumerable<SalesCommission> rows) => string.Join(", ", rows
        .SelectMany(r => r.PayoutItems.Where(i => i.ReleasedAt == null)).Select(i => i.CommissionPayout?.PayoutNumber).Where(n => n is not null).Distinct());

    private static bool SameRecoveries(IReadOnlyList<PlannedRecovery> planned, IReadOnlyList<ConsignmentCommissionRecovery> current) =>
        planned.Select(p => (p.CausedBySettlementId, p.Origin.Id, p.Quantity)).OrderBy(x => x.CausedBySettlementId).ThenBy(x => x.Id)
            .SequenceEqual(current.Select(c => (c.CausedBySettlementId, c.OriginCommissionId, c.Quantity)).OrderBy(x => x.CausedBySettlementId).ThenBy(x => x.OriginCommissionId));

    private async Task ApplyCommissionPlanAsync(ConsignmentSettlement s, ConsignmentSalesReport report, CommissionPlan plan, Guid admin,
        DateTimeOffset now, CancellationToken ct)
    {
        var satisfied = IsSatisfied(s.Status);
        foreach (var row in plan.Reverse)
        {
            row.Status = SalesCommissionStatus.Reversed;
            row.ReversedAt = now; row.ReversedByAdminUserId = admin; row.UpdatedAt = now;
            row.ReversalReason = $"Replaced by settlement {s.SettlementNumber} revision {s.Revision} (sales report v{report.Version}).";
        }
        foreach (var row in plan.Demote)
        {
            row.Status = SalesCommissionStatus.Pending;
            row.PayableAt = null; row.UpdatedAt = now;
            audit.Append(admin, ActorType.Admin, "consignment.commission-back-to-pending", "SalesCommission", row.Id, new { status = "Payable" },
                new { status = "Pending", s.SettlementNumber, s.Revision, reason = "The partner no longer has this period paid in full." });
        }
        var people = new Dictionary<Guid, Salesperson>();
        foreach (var (key, target, units) in plan.Issue)
        {
            if (!people.TryGetValue(key.SalespersonId, out var person))
                people[key.SalespersonId] = person = await db.Salespersons.AsNoTracking().SingleAsync(x => x.Id == key.SalespersonId, ct);
            var rule = target.RuleId is Guid ruleId ? await db.CommissionRules.AsNoTracking().SingleOrDefaultAsync(r => r.Id == ruleId, ct) : null;
            var baseAmount = target.SaleUnits > 0 ? Math.Max(0m, MerchantSalesTotals.Round(target.SaleValue * units / target.SaleUnits)) : 0m;
            db.SalesCommissions.Add(new SalesCommission
            {
                SourceType = SalesCommissionSourceType.ConsignmentSettlement, CommissionType = key.Type,
                MerchantId = s.MerchantId, ConsignmentSettlementId = s.Id, ConsignmentSettlementRevision = s.Revision,
                ConsignmentSalesReportId = report.Id, MerchantBranchId = s.MerchantBranchId,
                SalespersonId = key.SalespersonId, SalespersonCodeSnapshot = person.SalespersonCode, SalespersonNameSnapshot = person.Name,
                CommissionFixedAmountSnapshot = key.UnitAmount, CommissionRuleId = rule?.Id, CommissionRuleEffectiveFromSnapshot = rule?.EffectiveFrom,
                QualifiedQuantity = units, PolicyCode = target.PolicyCode, CommissionBaseAmount = baseAmount,
                CommissionAmount = units * key.UnitAmount, Currency = MerchantSalesConstants.Currency,
                Status = satisfied ? SalesCommissionStatus.Payable : SalesCommissionStatus.Pending, PayableAt = satisfied ? now : null,
                CalculatedAt = now, CreatedAt = now, UpdatedAt = now,
            });
        }
    }

    /// <summary>
    /// A settlement's shown recovery is the current obligations its own report caused, wherever the
    /// over-paid commission was earned. Recomputed from the records after every revision.
    /// </summary>
    private async Task RefreshRecoveryTotalsAsync(IEnumerable<Guid> settlementIds, CancellationToken ct)
    {
        foreach (var id in settlementIds.Distinct())
        {
            var total = await CurrentRecoveries().Where(r => r.CausedBySettlementId == id).SumAsync(r => (decimal?)r.Amount, ct) ?? 0m;
            var settlement = await db.ConsignmentSettlements.SingleAsync(x => x.Id == id, ct);
            settlement.CommissionRecoveryRequired = total;
        }
    }

    /// <summary>The recovery obligations in force: those written with each owning settlement's latest revision.</summary>
    private IQueryable<ConsignmentCommissionRecovery> CurrentRecoveries() =>
        db.ConsignmentCommissionRecoveries.AsNoTracking().Where(r => r.SettlementRevision == r.Settlement!.Revision);

    private async Task LockSettlementCommissionAsync(Guid settlementId, CancellationToken ct)
    {
        // The same row locks, by key and in the same order, that a payout takes before reserving or paying
        // commission, so neither can act on a stale view of the other. Locking "WHERE ConsignmentSettlementId"
        // directly is not enough: the settlement index covers that query, so it would lock only index keys,
        // which a payout never touches.
        if (!db.Database.IsSqlServer()) return;
        var ids = await db.SalesCommissions.AsNoTracking().Where(c => c.ConsignmentSettlementId == settlementId)
            .Select(c => c.Id).ToListAsync(ct);
        foreach (var id in ids.OrderBy(id => id))
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT 1 FROM [SalesCommissions] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {id}", ct);
    }

    private async Task PromotePendingCommissionAsync(ConsignmentSettlement s, DateTimeOffset now, CancellationToken ct)
    {
        await LockSettlementCommissionAsync(s.Id, ct);
        var pending = await db.SalesCommissions.Where(c => c.ConsignmentSettlementId == s.Id && c.Status == SalesCommissionStatus.Pending).ToListAsync(ct);
        foreach (var row in pending.Concat(db.ChangeTracker.Entries<SalesCommission>()
                     .Where(e => e.State == EntityState.Added && e.Entity.ConsignmentSettlementId == s.Id && e.Entity.Status == SalesCommissionStatus.Pending)
                     .Select(e => e.Entity)).Distinct())
        {
            row.Status = SalesCommissionStatus.Payable;
            row.PayableAt = now; row.UpdatedAt = now;
        }
    }

    private static bool IsSatisfied(ConsignmentSettlementStatus status) =>
        status is ConsignmentSettlementStatus.Settled or ConsignmentSettlementStatus.CreditDue;

    /// <summary>
    /// Settled means everything due was received. CreditDue means the partner is owed money: either
    /// they paid more than a corrected statement needs, or refunds exceeded the period's sales.
    /// </summary>
    private static void ApplySettlementStatus(ConsignmentSettlement s, DateTimeOffset now)
    {
        s.Status = StatusFor(s.ExpectedRemittance, s.ReceivedAmount);
        s.SettledAt = IsSatisfied(s.Status) ? s.SettledAt ?? now : null;
    }

    private static ConsignmentSettlementStatus StatusFor(decimal expected, decimal received) =>
        expected <= 0m
            ? (expected == 0m && received == 0m ? ConsignmentSettlementStatus.Settled : ConsignmentSettlementStatus.CreditDue)
            : received == 0m ? ConsignmentSettlementStatus.AwaitingPayment
            : received < expected ? ConsignmentSettlementStatus.PartiallyReceived
            : received == expected ? ConsignmentSettlementStatus.Settled : ConsignmentSettlementStatus.CreditDue;

    // --- Operator actions --------------------------------------------------------

    public async Task<ConsignmentSettlementResponse> RecordSettlementReceiptAsync(Guid? actor, Guid id,
        RecordConsignmentSettlementReceiptRequest r, CancellationToken ct)
    {
        var method = ParseEnum<MerchantPaymentMethod>(r.Method, "Choose how the partner paid.");
        if (r.Amount <= 0m || !IsMoney(r.Amount)) throw Bad("Enter the amount received in MYR, above zero with at most two decimal places.");
        // Canonical text: trimmed, Unicode NFC, empty as none. Stored and compared exactly like this.
        var reference = CanonicalText(r.Reference);
        if (reference is null || reference.Length is < 3 or > 200) throw Bad("Enter the bank or payment reference (3 to 200 characters).");
        var notes = CanonicalText(r.Notes);
        if (notes?.Length > 2000) throw Bad("Keep notes to 2,000 characters or fewer.");
        var key = Trim(r.IdempotencyKey);
        if (key is null || key.Length is < 8 or > 80) throw Bad("Reload the form and try again.");
        var today = DateOnly.FromDateTime(time.GetUtcNow().ToOffset(MalaysiaOffset).DateTime);
        if (r.ReceivedOn == default || r.ReceivedOn > today) throw Bad("Enter the date the money arrived. It can't be in the future.");
        // A structured, length-safe encoding: no choice of reference or notes can collide with another.
        var fingerprint = "v2:" + Convert.ToHexString(SHA256.HashData(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new object?[] {
            id.ToString("N"), r.ReceivedOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            r.Amount.ToString("0.00", CultureInfo.InvariantCulture), method.ToString(), reference, notes })));

        await RunAsync(actor, async admin => {
            var existing = await db.ConsignmentSettlementReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.IdempotencyKey == key, ct);
            if (existing is not null)
            {
                // A retried submission returns what the first one recorded; the same key never records a second receipt.
                // The comparison is field by field against what was stored, so it also holds for receipts
                // recorded before the fingerprint format changed, and no free text can hide a changed detail.
                var same = existing.SettlementId == id && existing.ReceivedOn == r.ReceivedOn && existing.Amount == r.Amount
                    && existing.Method == method && string.Equals(CanonicalText(existing.Reference), reference, StringComparison.Ordinal)
                    && string.Equals(CanonicalText(existing.Notes), notes, StringComparison.Ordinal);
                if (!same)
                    throw Conflict("This request was already used for a receipt with different details. Reload the form and try again.");
                return;
            }
            var s = await db.ConsignmentSettlements.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw SettlementMissing();
            if (r.ReceivedOn < DateOnly.FromDateTime(s.PeriodStart.ToOffset(MalaysiaOffset).DateTime))
                throw Bad("The money can't have arrived before the sales period started.");
            var outstanding = Math.Max(s.ExpectedRemittance, 0m) - s.ReceivedAmount;
            if (outstanding <= 0m) throw Conflict("Nothing is outstanding for this period.");
            if (r.Amount > outstanding)
                throw Bad($"That is more than the outstanding balance of RM{outstanding.ToString("N2", CultureInfo.InvariantCulture)}. Record the amount actually due, and resolve any overpayment with the partner.");
            var now = time.GetUtcNow();
            var receipt = new ConsignmentSettlementReceipt
            {
                SettlementId = s.Id, ReceivedOn = r.ReceivedOn, Amount = r.Amount, Method = method, Reference = reference, Notes = notes,
                IdempotencyKey = key, RequestFingerprint = fingerprint, RecordedByAdminUserId = admin, RecordedAt = now, CreatedAt = now, UpdatedAt = now,
            };
            db.ConsignmentSettlementReceipts.Add(receipt);
            var before = new { s.ReceivedAmount, status = s.Status.ToString() };
            s.ReceivedAmount += r.Amount; s.UpdatedAt = now;
            ApplySettlementStatus(s, now);
            if (IsSatisfied(s.Status)) await PromotePendingCommissionAsync(s, now, ct);
            audit.Append(admin, ActorType.Admin, "consignment.settlement-receipt-recorded", SettlementSubject, s.Id, before,
                new { receipt.Id, receipt.ReceivedOn, receipt.Amount, method = method.ToString(), receipt.Reference, s.ReceivedAmount, status = s.Status.ToString() });
        }, ct);
        return await SettlementAsync(id, ct);
    }

    public async Task<ConsignmentSettlementResponse> VoidSettlementReceiptAsync(Guid? actor, Guid id, Guid receiptId,
        VoidConsignmentSettlementReceiptRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length is < 10 or > 1000) throw Bad("Explain why this receipt is void (10 to 1,000 characters).");
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentSettlements.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw SettlementMissing();
            var receipt = await db.ConsignmentSettlementReceipts.SingleOrDefaultAsync(x => x.Id == receiptId && x.SettlementId == id, ct)
                ?? throw SettlementMissing();
            Token(receipt.RowVersion, r.ConcurrencyToken);
            if (receipt.VoidedAt is not null) throw Conflict("This receipt is already void.");
            // Once a period is settled its commission may already be payable or paid; un-settling it is not possible in this phase.
            if (IsSatisfied(s.Status))
                throw Conflict("This period is settled, so its receipts can no longer be voided. Record any correction with the partner outside the system for now.");
            var now = time.GetUtcNow();
            receipt.VoidedAt = now; receipt.VoidedByAdminUserId = admin; receipt.VoidReason = reason;
            var before = new { s.ReceivedAmount, status = s.Status.ToString() };
            s.ReceivedAmount -= receipt.Amount; s.UpdatedAt = now;
            ApplySettlementStatus(s, now);
            audit.Append(admin, ActorType.Admin, "consignment.settlement-receipt-voided", SettlementSubject, s.Id, before,
                new { receipt.Id, receipt.Amount, reason, s.ReceivedAmount, status = s.Status.ToString() });
        }, ct);
        return await SettlementAsync(id, ct);
    }

    /// <summary>Names who earns a period that could not be attributed automatically, or records that nobody does.</summary>
    public async Task<ConsignmentSettlementResponse> ResolveSettlementAttributionAsync(Guid? actor, Guid id,
        ResolveConsignmentAttributionRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length is < 10 or > 1000) throw Bad("Explain how you decided who earns this period (10 to 1,000 characters).");
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentSettlements.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw SettlementMissing();
            Token(s.RowVersion, r.ConcurrencyToken);
            if (s.AttributionStatus != ConsignmentAttributionStatus.NeedsResolution)
                throw Conflict("This period's salesperson is already decided. Earned commission is never moved to someone else.");
            Salesperson? salesperson = null;
            if (r.SalespersonId is Guid chosen)
                salesperson = await db.Salespersons.AsNoTracking().SingleOrDefaultAsync(x => x.Id == chosen, ct)
                    ?? throw Bad("Choose an existing salesperson.");
            var issue = s.AttributionIssue;
            await ResolveAttributionAsync(s, salesperson, OperatorSource, automatic: false, ct);
            var now = time.GetUtcNow();
            s.AttributionResolvedAt = now; s.AttributionResolvedByAdminUserId = admin; s.AttributionResolutionReason = reason;
            audit.Append(admin, ActorType.Admin, "consignment.settlement-attribution-resolved", SettlementSubject, s.Id,
                new { issue }, new { s.SalespersonId, s.CommissionPolicyCode, reason });
            await ReviseSettlementAsync(s, await SettlementReportAsync(s, ct), "Salesperson confirmed by an administrator", admin,
                null, [], onlyIfCommissionChanges: false, ct);
        }, ct);
        return await SettlementAsync(id, ct);
    }

    /// <summary>
    /// Recalculates from the same verified report: picks up a rate added after verification, or retries
    /// automatic attribution. Already-decided attribution and paid rows are never changed.
    /// </summary>
    public async Task<ConsignmentSettlementResponse> RecalculateSettlementAsync(Guid? actor, Guid id,
        RecalculateConsignmentSettlementRequest r, CancellationToken ct)
    {
        var reason = Trim(r.Reason);
        if (reason is null || reason.Length is < 10 or > 500) throw Bad("Explain why this period is being recalculated (10 to 500 characters).");
        await RunAsync(actor, async admin => {
            var s = await db.ConsignmentSettlements.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw SettlementMissing();
            Token(s.RowVersion, r.ConcurrencyToken);
            if (s.AttributionStatus == ConsignmentAttributionStatus.NeedsResolution) await AttributeAutomaticallyAsync(s, ct);
            else await ApplyLateRecordedTermsAsync(s, reason, admin, ct);
            await ReviseSettlementAsync(s, await SettlementReportAsync(s, ct), $"Recalculated: {reason}", admin,
                null, [], onlyIfCommissionChanges: false, ct);
        }, ct);
        return await SettlementAsync(id, ct);
    }

    /// <summary>
    /// Corrects a period whose salesperson had accepted commission terms before it began, but whose
    /// terms were only recorded after it was calculated. The salesperson never changes; only the terms
    /// already proven to cover the whole period (accepted and effective by its start) apply. A period
    /// with commission already paid or reserved for that salesperson is left alone, and every
    /// application is audited with the terms before and after.
    /// </summary>
    private async Task ApplyLateRecordedTermsAsync(ConsignmentSettlement s, string reason, Guid admin, CancellationToken ct)
    {
        if (s.SalespersonId is not Guid seller || s.CommissionPolicyCode is not null) return;
        var covering = (await OverlappingPoliciesAsync(seller, s, ct)).FirstOrDefault(p => Covers(p, s));
        if (covering is null) return;
        if (await db.SalesCommissions.AnyAsync(c => c.ConsignmentSettlementId == s.Id && c.SalespersonId == seller
                && (c.Status == SalesCommissionStatus.Paid || c.PayoutItems.Any(i => i.ReleasedAt == null)), ct))
            throw Conflict("This period already has paid or reserved commission for this salesperson, so its terms can't be changed here.");
        var before = new { s.CommissionPolicyCode, s.PolicyAssignmentId };
        s.CommissionPolicyCode = covering.PolicyCode;
        s.PolicyAssignmentId = covering.Id;
        audit.Append(admin, ActorType.Admin, "consignment.settlement-commission-terms-applied", SettlementSubject, s.Id, before,
            new { s.CommissionPolicyCode, s.PolicyAssignmentId, covering.AcceptedAt, covering.EffectiveFrom, covering.AgreementReference,
                salesperson = seller, reason });
    }

    private async Task<ConsignmentSalesReport> SettlementReportAsync(ConsignmentSettlement s, CancellationToken ct) =>
        await db.ConsignmentSalesReports.Include(x => x.Lines).Include(x => x.Agreement).SingleAsync(x => x.Id == s.SalesReportId, ct);

    // --- Queries -----------------------------------------------------------------

    public async Task<(IReadOnlyList<ConsignmentSettlementSummaryResponse> Items, int Total)> SettlementsAsync(int page, int pageSize,
        Guid? merchantId, string? status, string? attention, CancellationToken ct)
    {
        Page(page, pageSize);
        var q = db.ConsignmentSettlements.AsNoTracking().AsQueryable();
        if (merchantId is Guid m) q = q.Where(x => x.MerchantId == m);
        if (!string.IsNullOrWhiteSpace(status)) { var parsed = ParseEnum<ConsignmentSettlementStatus>(status, "Choose a valid settlement status."); q = q.Where(x => x.Status == parsed); }
        q = attention?.Trim().ToLowerInvariant() switch
        {
            null or "" => q,
            "attribution" => q.Where(x => x.AttributionStatus == ConsignmentAttributionStatus.NeedsResolution),
            "outstanding" => q.Where(x => x.Status == ConsignmentSettlementStatus.AwaitingPayment || x.Status == ConsignmentSettlementStatus.PartiallyReceived),
            "recovery" => q.Where(x => x.CommissionRecoveryRequired > 0 || x.Status == ConsignmentSettlementStatus.CreditDue),
            _ => throw Bad("Choose a valid filter."),
        };
        var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.PeriodStart).ThenBy(x => x.SettlementNumber).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return (await SummariesAsync(rows, ct), total);
    }

    public Task<ConsignmentSettlementResponse> GetSettlementAsync(Guid id, CancellationToken ct) => SettlementAsync(id, ct);

    private async Task<ConsignmentSettlementResponse> SettlementAsync(Guid id, CancellationToken ct)
    {
        db.ChangeTracker.Clear();
        var s = await db.ConsignmentSettlements.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw SettlementMissing();
        var summary = (await SummariesAsync([s], ct))[0];
        var agreement = await db.ConsignmentAgreements.AsNoTracking().Where(a => a.Id == s.AgreementId)
            .Select(a => new { a.Reference, a.Version }).SingleAsync(ct);
        var revisions = await db.ConsignmentSettlementRevisions.AsNoTracking().Where(x => x.SettlementId == id)
            .OrderByDescending(x => x.Revision).ToListAsync(ct);
        var current = revisions.FirstOrDefault();
        var lines = current is null ? [] : await db.ConsignmentSettlementLines.AsNoTracking().Where(l => l.RevisionId == current.Id)
            .OrderBy(l => l.LineType).ThenBy(l => l.SkuSnapshot).ThenByDescending(l => l.UnitPrice).ToListAsync(ct);
        var receipts = await db.ConsignmentSettlementReceipts.AsNoTracking().Where(x => x.SettlementId == id)
            .OrderBy(x => x.ReceivedOn).ThenBy(x => x.RecordedAt).ToListAsync(ct);
        var commissions = await db.SalesCommissions.AsNoTracking().Include(c => c.PayoutItems).ThenInclude(i => i.CommissionPayout)
            .Where(c => c.ConsignmentSettlementId == id).OrderBy(c => c.CalculatedAt).ThenBy(c => c.Id).ToListAsync(ct);
        var recoveries = await CurrentRecoveries().Where(r => r.SettlementId == id || r.CausedBySettlementId == id)
            .Join(db.ConsignmentSettlements.AsNoTracking(), r => r.CausedBySettlementId, c => c.Id, (r, cause) => new
            {
                r.Id, r.SettlementId, OriginNumber = r.Settlement!.SettlementNumber, OriginStart = r.Settlement.PeriodStart,
                r.CausedBySettlementId, CauseNumber = cause.SettlementNumber, CauseStart = cause.PeriodStart,
                Salesperson = r.OriginCommission!.SalespersonNameSnapshot,
                Payout = db.CommissionPayouts.Where(p => p.Id == r.CommissionPayoutId).Select(p => p.PayoutNumber).FirstOrDefault(),
                r.Quantity, r.UnitAmount, r.Amount,
            })
            .OrderBy(r => r.OriginStart).ThenBy(r => r.CauseStart).ThenBy(r => r.Salesperson).ThenBy(r => r.Id).ToListAsync(ct);
        return new(summary, agreement.Reference, agreement.Version,
            lines.Select(l => new ConsignmentSettlementLineResponse(l.SourceReportLineId, l.LineType.ToString(), l.SkuSnapshot, l.PriceKind.ToString(),
                l.UnitPrice, l.Quantity, l.Amount, l.MerchantCommissionPercentage, l.RefundOfPeriodStart, l.CommissionSalespersonId, l.CommissionUnitAmount)).ToArray(),
            revisions.Select(x => new ConsignmentSettlementRevisionResponse(x.Revision, x.SalesReportId, x.SalesReportVersion, x.Reason, x.EligibleSales,
                x.MerchantCommission, x.ExpectedRemittance, x.SalesCommissionTarget, x.CommissionRecoveryRequired, x.CreatedAt)).ToArray(),
            receipts.Select(x => new ConsignmentSettlementReceiptResponse(x.Id, x.ReceivedOn, x.Amount, x.Method.ToString(), x.Reference, x.Notes,
                x.RecordedAt, x.VoidedAt, x.VoidReason, Convert.ToBase64String(x.RowVersion))).ToArray(),
            commissions.Select(c => {
                var claim = c.PayoutItems.Where(i => i.ReleasedAt == null).OrderByDescending(i => i.CreatedAt).FirstOrDefault();
                var state = claim?.CommissionPayout?.Status switch
                {
                    CommissionPayoutStatus.Prepared => "ReservedInPreparedPayout",
                    CommissionPayoutStatus.Paid => "IncludedInPaidPayout",
                    _ => "Unclaimed",
                };
                return new ConsignmentSettlementCommissionResponse(c.Id, c.SalespersonId, c.SalespersonNameSnapshot, c.CommissionType.ToString(),
                    c.QualifiedQuantity ?? 0, c.CommissionFixedAmountSnapshot ?? 0m, c.CommissionAmount, c.Status.ToString(),
                    c.ConsignmentSettlementRevision ?? 0, c.PolicyCode, c.CalculatedAt, c.PayableAt, c.PaidAt, c.ReversedAt, c.ReversalReason,
                    claim?.CommissionPayout?.PayoutNumber, state);
            }).ToArray(),
            s.AttributionResolvedAt, s.AttributionResolutionReason,
            recoveries.Select(r => new ConsignmentCommissionRecoveryResponse(r.Id, r.SettlementId, r.OriginNumber, r.OriginStart,
                r.CausedBySettlementId, r.CauseNumber, r.CauseStart, r.Salesperson, r.Payout, r.Quantity, r.UnitAmount, r.Amount)).ToArray());
    }

    private async Task<IReadOnlyList<ConsignmentSettlementSummaryResponse>> SummariesAsync(IReadOnlyList<ConsignmentSettlement> rows, CancellationToken ct)
    {
        var ids = rows.Select(r => r.Id).ToArray();
        var totals = await db.SalesCommissions.AsNoTracking().Where(c => c.ConsignmentSettlementId != null && ids.Contains(c.ConsignmentSettlementId.Value))
            .GroupBy(c => new { c.ConsignmentSettlementId, c.Status }).Select(g => new { g.Key.ConsignmentSettlementId, g.Key.Status, Amount = g.Sum(x => x.CommissionAmount) })
            .ToListAsync(ct);
        var names = await BranchNamesAsync(rows.Select(r => r.MerchantBranchId), ct);
        decimal Total(Guid id, SalesCommissionStatus status) => totals.Where(t => t.ConsignmentSettlementId == id && t.Status == status).Sum(t => t.Amount);
        return rows.Select(s => new ConsignmentSettlementSummaryResponse(s.Id, s.SettlementNumber, s.MerchantId,
            names.TryGetValue(s.MerchantBranchId, out var n) ? n.Merchant : "", s.MerchantBranchId, names.TryGetValue(s.MerchantBranchId, out n) ? n.Branch : "",
            s.PeriodStart, s.PeriodEndExclusive, s.SalesReportId, s.SalesReportVersion, s.Revision, s.Status.ToString(),
            s.StandardQuantity, s.StandardSales, s.PromotionQuantity, s.PromotionSales, s.RefundQuantity, s.RefundAmount, s.EligibleSales,
            s.MerchantCommission, s.ExpectedRemittance, s.ReceivedAmount, Math.Max(s.ExpectedRemittance - s.ReceivedAmount, 0m),
            Math.Max(s.ReceivedAmount - s.ExpectedRemittance, 0m), s.AttributionStatus.ToString(), s.AttributionIssue, s.AttributionSource,
            s.SalespersonId, s.SalespersonNameSnapshot, s.CommissionPolicyCode, Total(s.Id, SalesCommissionStatus.Pending),
            Total(s.Id, SalesCommissionStatus.Payable), Total(s.Id, SalesCommissionStatus.Paid), s.CommissionRecoveryRequired, s.CommissionNote,
            Convert.ToBase64String(s.RowVersion))).ToArray();
    }

    /// <summary>A plain statement of one settlement: its verified lines, the partner's commission, what is due and what arrived.</summary>
    public async Task<byte[]> SettlementStatementCsvAsync(Guid? actor, Guid id, CancellationToken ct)
    {
        var s = await SettlementAsync(id, ct);
        var sum = s.Summary;
        string M(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);
        string D(DateTimeOffset v) => v.ToOffset(MalaysiaOffset).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var rows = new List<string[]>
        {
            new[] { "Settlement", sum.SettlementNumber }, new[] { "Partner", sum.MerchantName }, new[] { "Branch", sum.BranchName },
            new[] { "Agreement", $"{s.AgreementReference} v{s.AgreementVersion}" },
            new[] { "Period", $"{D(sum.PeriodStart)} to {D(sum.PeriodEndExclusive.AddTicks(-1))}" },
            new[] { "Sales report version", sum.SalesReportVersion.ToString(CultureInfo.InvariantCulture) },
            new[] { "Statement revision", sum.Revision.ToString(CultureInfo.InvariantCulture) }, Array.Empty<string>(),
            new[] { "Line", "SKU", "Price", "Unit price (MYR)", "Quantity", "Customer value (MYR)", "Partner commission %", "Refund of period" },
        };
        rows.AddRange(s.Lines.Select(l => new[] { l.LineType, l.Sku, l.PriceKind, M(l.UnitPrice), l.Quantity.ToString(CultureInfo.InvariantCulture),
            M(l.Amount), M(l.MerchantCommissionPercentage), l.RefundOfPeriodStart is { } p ? D(p) : "" }));
        rows.Add(Array.Empty<string>());
        rows.AddRange(new[]
        {
            new[] { "Standard sales", sum.StandardQuantity.ToString(CultureInfo.InvariantCulture), M(sum.StandardSales) },
            new[] { "Promotion sales", sum.PromotionQuantity.ToString(CultureInfo.InvariantCulture), M(sum.PromotionSales) },
            new[] { "Refunds", sum.RefundQuantity.ToString(CultureInfo.InvariantCulture), M(-sum.RefundAmount) },
            new[] { "Eligible customer sales", "", M(sum.EligibleSales) },
            new[] { "Partner commission", "", M(-sum.MerchantCommission) },
            new[] { "Due to MyPetLink", "", M(sum.ExpectedRemittance) },
            new[] { "Received", "", M(sum.ReceivedAmount) },
            new[] { "Outstanding", "", M(sum.Outstanding) },
            new[] { "Status", sum.Status },
        });
        rows.Add(Array.Empty<string>());
        rows.Add(new[] { "Received on", "Amount (MYR)", "Method", "Reference", "Void" });
        rows.AddRange(s.Receipts.Select(x => new[] { x.ReceivedOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), M(x.Amount), x.Method, x.Reference,
            x.VoidedAt is null ? "" : "Void: " + x.VoidReason }));
        var admin = await db.AdminUsers.AsNoTracking().Where(a => a.UserId == actor).Select(a => (Guid?)a.Id).SingleOrDefaultAsync(ct);
        audit.Append(admin, ActorType.Admin, "consignment.settlement-statement-downloaded", SettlementSubject, id, null, new { sum.SettlementNumber, sum.Revision });
        await db.SaveChangesAsync(ct);
        var builder = new StringBuilder();
        foreach (var row in rows) builder.AppendLine(string.Join(',', row.Select(AdminExportSanitizer.Csv)));
        return new UTF8Encoding(true).GetBytes(builder.ToString());
    }

    private static string? CanonicalText(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().Normalize(NormalizationForm.FormC);

    private static ApiException SettlementMissing() => new(404, "consignment_not_found", "This settlement or receipt could not be found.");
}
