using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ISalesReportingService
{
    Task<SalesPerformanceReportResponse> GetPerformanceAsync(SalesReportQuery query, CancellationToken cancellationToken);
    Task<CommissionFinancialReportResponse> GetFinancialAsync(SalesReportQuery query, CancellationToken cancellationToken);
    Task<SalespersonPerformanceReportResponse> GetSalespersonPerformanceAsync(Guid salespersonId, SalesReportQuery query, CancellationToken cancellationToken);
    Task<SalespersonFinancialReportResponse> GetSalespersonFinancialAsync(Guid salespersonId, SalesReportQuery query, CancellationToken cancellationToken);
    Task<(IReadOnlyCollection<ResellerPortfolioItemResponse> Items, int Total)> ListPortfolioAsync(Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken);
    Task<(IReadOnlyCollection<ResellerPortfolioFinancialItemResponse> Items, int Total)> ListPortfolioFinancialAsync(Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken);
    Task<(IReadOnlyCollection<SalesCommissionResponse> Items, int Total)> ListCommissionsAsync(CommissionLedgerQuery query, CancellationToken cancellationToken);
    Task<AdminTagInventoryExport> ExportCommissionLedgerAsync(Guid? actorUserId, CommissionLedgerQuery query, CancellationToken cancellationToken);
    Task<AdminTagInventoryExport> ExportPortfolioAsync(Guid? actorUserId, Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken);
}

/// <summary>
/// Read-only sales/accounting projections. Source-event dates are intentional:
/// paid retail uses PaymentConfirmedAt, wholesale uses MerchantPayment.PaymentDate,
/// earned ledger uses CalculatedAt, and payout/reversal activity uses its own timestamp.
/// </summary>
public sealed class SalesReportingService : ISalesReportingService
{
    private const int MaxExportRows = 10_000;
    private static readonly TimeSpan EndingSoonWindow = TimeSpan.FromDays(30);
    private readonly MyPetLinkDbContext _db;
    private readonly IAuditLogService _audit;
    private readonly TimeProvider _time;

    public SalesReportingService(MyPetLinkDbContext db, IAuditLogService audit, TimeProvider time)
    {
        _db = db;
        _audit = audit;
        _time = time;
    }

    public async Task<SalesPerformanceReportResponse> GetPerformanceAsync(
        SalesReportQuery query, CancellationToken cancellationToken)
    {
        var range = ValidateRange(query);
        var channel = ParseChannel(query.Channel);
        var retail = await RetailMetricsAsync(range, query.SalespersonId, channel, cancellationToken);
        var merchant = await MerchantMetricsAsync(range, query.SalespersonId, channel, cancellationToken);
        var relationships = await RelationshipMetricsAsync(query.SalespersonId, channel, cancellationToken);

        var eligibleDirect = FilterCommissionDimensions(_db.SalesCommissions.AsNoTracking(), query.SalespersonId,
                channel, SalesCommissionType.DirectRetailPercentage)
            .Where(item => item.TagOrder!.PaymentConfirmedAt >= range.From
                           && item.TagOrder.PaymentConfirmedAt < range.ToExclusive);
        var revenueRankingRows = await eligibleDirect
            .GroupBy(item => new { item.SalespersonId, item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot })
            .Select(group => new
            {
                group.Key.SalespersonId, group.Key.SalespersonCodeSnapshot,
                group.Key.SalespersonNameSnapshot, Value = group.Sum(item => item.CommissionBaseAmount)
            })
            .OrderByDescending(item => item.Value).ThenBy(item => item.SalespersonCodeSnapshot)
            .Take(10).ToListAsync(cancellationToken);
        var revenueRanking = revenueRankingRows.Select(item => new SalespersonRankingItem(
            item.SalespersonId, item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot, item.Value)).ToArray();
        var directOrderIds = eligibleDirect.Select(item => item.TagOrderId!.Value);
        var unitsRankingRows = await _db.TagOrderItems.AsNoTracking()
            .Where(item => directOrderIds.Contains(item.OrderId))
            .GroupBy(item => new { item.Order.SalespersonId, item.Order.SalespersonCodeSnapshot, item.Order.SalespersonNameSnapshot })
            .Select(group => new
            {
                group.Key.SalespersonId, group.Key.SalespersonCodeSnapshot,
                group.Key.SalespersonNameSnapshot, Value = group.Sum(item => item.Quantity)
            })
            .OrderByDescending(item => item.Value).ThenBy(item => item.SalespersonCodeSnapshot)
            .Take(10).ToListAsync(cancellationToken);
        var unitsRanking = unitsRankingRows.Select(item => new SalespersonRankingItem(
            item.SalespersonId!.Value, item.SalespersonCodeSnapshot!, item.SalespersonNameSnapshot!, item.Value)).ToArray();

        var activations = ActivationMerchants(range, query.SalespersonId, channel);
        var activationRankingRows = await activations
            .GroupBy(merchant => new
            {
                merchant.AcquiredBySalespersonId,
                merchant.AcquiredBySalespersonCodeSnapshot,
                merchant.AcquiredBySalespersonNameSnapshot
            })
            .Select(group => new
            {
                group.Key.AcquiredBySalespersonId, group.Key.AcquiredBySalespersonCodeSnapshot,
                group.Key.AcquiredBySalespersonNameSnapshot, Value = group.Count()
            })
            .OrderByDescending(item => item.Value).ThenBy(item => item.AcquiredBySalespersonCodeSnapshot)
            .Take(10).ToListAsync(cancellationToken);
        var activationRanking = activationRankingRows.Select(item => new SalespersonRankingItem(
            item.AcquiredBySalespersonId!.Value, item.AcquiredBySalespersonCodeSnapshot!,
            item.AcquiredBySalespersonNameSnapshot!, item.Value)).ToArray();

        return new(range, retail, merchant, relationships, revenueRanking, unitsRanking, activationRanking);
    }

    public async Task<CommissionFinancialReportResponse> GetFinancialAsync(
        SalesReportQuery query, CancellationToken cancellationToken)
    {
        var range = ValidateRange(query);
        var channel = ParseChannel(query.Channel);
        var type = ParseCommissionType(query.CommissionType);
        var baseQuery = FilterCommissionDimensions(_db.SalesCommissions.AsNoTracking(), query.SalespersonId, channel, type);
        var earned = baseQuery.Where(item => item.CalculatedAt >= range.From && item.CalculatedAt < range.ToExclusive);
        var accounting = await AccountingAsync(baseQuery, earned, range, cancellationToken);
        var rankingRows = await earned
            .GroupBy(item => new { item.SalespersonId, item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot })
            .Select(group => new
            {
                group.Key.SalespersonId, group.Key.SalespersonCodeSnapshot,
                group.Key.SalespersonNameSnapshot, Value = group.Sum(item => item.CommissionAmount)
            })
            .OrderByDescending(item => item.Value).ThenBy(item => item.SalespersonCodeSnapshot)
            .Take(10).ToListAsync(cancellationToken);
        var rankings = rankingRows.Select(item => new SalespersonRankingItem(
            item.SalespersonId, item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot, item.Value)).ToArray();
        return new(range, accounting, rankings);
    }

    public async Task<SalespersonPerformanceReportResponse> GetSalespersonPerformanceAsync(
        Guid salespersonId, SalesReportQuery query, CancellationToken cancellationToken)
    {
        var salesperson = await RequireSalespersonAsync(salespersonId, cancellationToken);
        query.SalespersonId = salespersonId;
        var range = ValidateRange(query);
        var channel = ParseChannel(query.Channel);
        var retail = await RetailMetricsAsync(range, salespersonId, channel, cancellationToken);
        var merchant = await MerchantMetricsAsync(range, salespersonId, channel, cancellationToken);
        var repeat = FilterCommissionDimensions(_db.SalesCommissions.AsNoTracking(), salespersonId, channel,
                SalesCommissionType.ResellerRepeatPercentage)
            .Where(item => item.MerchantPayment!.PaymentDate >= range.From
                           && item.MerchantPayment.PaymentDate < range.ToExclusive);
        var repeatRows = await repeat.GroupBy(_ => 1).Select(group => new
        {
            Orders = group.Select(item => item.MerchantOrderId).Distinct().Count(),
            Revenue = group.Sum(item => item.CommissionBaseAmount)
        }).SingleOrDefaultAsync(cancellationToken);
        var lifetime = 0m;
        if (channel != ReportChannel.Retail)
        {
            var lifetimePayments = _db.MerchantPayments.AsNoTracking()
                .Where(payment => payment.MerchantOrder!.Merchant!.AcquiredBySalespersonId == salespersonId);
            if (await lifetimePayments.AnyAsync(
                    payment => payment.Currency != MerchantSalesConstants.Currency, cancellationToken))
                throw UnsupportedCurrency();
            lifetime = await lifetimePayments
                .SumAsync(payment => (decimal?)payment.MerchantOrder!.MerchandiseSubtotal
                                     - payment.MerchantOrder!.DiscountTotal, cancellationToken) ?? 0m;
        }

        return new(salesperson.Id, salesperson.SalespersonCode, salesperson.Name, range,
            retail, merchant, repeatRows?.Orders ?? 0, repeatRows?.Revenue ?? 0m, lifetime);
    }

    public async Task<SalespersonFinancialReportResponse> GetSalespersonFinancialAsync(
        Guid salespersonId, SalesReportQuery query, CancellationToken cancellationToken)
    {
        await RequireSalespersonAsync(salespersonId, cancellationToken);
        query.SalespersonId = salespersonId;
        var range = ValidateRange(query);
        var channel = ParseChannel(query.Channel);
        var type = ParseCommissionType(query.CommissionType);
        var baseQuery = FilterCommissionDimensions(_db.SalesCommissions.AsNoTracking(), salespersonId, channel, type);
        var earned = baseQuery.Where(item => item.CalculatedAt >= range.From && item.CalculatedAt < range.ToExclusive);
        var grouped = await earned.GroupBy(_ => 1).Select(group => new
        {
            Direct = group.Where(item => item.CommissionType == SalesCommissionType.DirectRetailPercentage).Sum(item => item.CommissionAmount),
            DirectReversed = group.Where(item => item.CommissionType == SalesCommissionType.DirectRetailPercentage && item.Status == SalesCommissionStatus.Reversed).Sum(item => item.CommissionAmount),
            Acquisition = group.Where(item => item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).Sum(item => item.CommissionAmount),
            Repeat = group.Where(item => item.CommissionType == SalesCommissionType.ResellerRepeatPercentage).Sum(item => item.CommissionAmount)
        }).SingleOrDefaultAsync(cancellationToken);
        return new(salespersonId, range, grouped?.Direct ?? 0m, grouped?.DirectReversed ?? 0m,
            grouped?.Acquisition ?? 0m, grouped?.Repeat ?? 0m,
            await AccountingAsync(baseQuery, earned, range, cancellationToken));
    }

    public async Task<(IReadOnlyCollection<ResellerPortfolioItemResponse> Items, int Total)> ListPortfolioAsync(
        Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken)
    {
        await RequireSalespersonAsync(salespersonId, cancellationToken);
        var merchants = PortfolioMerchants(salespersonId, query);
        var total = await merchants.CountAsync(cancellationToken);
        var page = await merchants.OrderBy(item => item.MerchantCode)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(item => new
            {
                Merchant = item,
                AcquiredCode = item.AcquiredBySalespersonCodeSnapshot,
                AcquiredName = item.AcquiredBySalespersonNameSnapshot,
                AssignedCode = item.AssignedSalesperson != null ? item.AssignedSalesperson.SalespersonCode : null,
                AssignedName = item.AssignedSalesperson != null ? item.AssignedSalesperson.Name : null,
                ActivationOrder = item.FirstQualifyingMerchantOrder != null ? item.FirstQualifyingMerchantOrder.MerchantOrderNumber : null
            }).ToListAsync(cancellationToken);
        var ids = page.Select(item => item.Merchant.Id).ToArray();
        if (await _db.MerchantPayments.AsNoTracking().AnyAsync(
                item => ids.Contains(item.MerchantOrder!.MerchantId)
                        && item.Currency != MerchantSalesConstants.Currency, cancellationToken))
            throw UnsupportedCurrency();
        var wholesale = await _db.MerchantPayments.AsNoTracking().Where(item => ids.Contains(item.MerchantOrder!.MerchantId))
            .GroupBy(item => item.MerchantOrder!.MerchantId)
            .Select(group => new { MerchantId = group.Key, Value = group.Sum(item => item.MerchantOrder!.MerchandiseSubtotal - item.MerchantOrder.DiscountTotal) })
            .ToDictionaryAsync(item => item.MerchantId, item => item.Value, cancellationToken);
        var repeat = await _db.SalesCommissions.AsNoTracking()
            .Where(item => item.MerchantId.HasValue && ids.Contains(item.MerchantId.Value) && item.CommissionType == SalesCommissionType.ResellerRepeatPercentage)
            .GroupBy(item => item.MerchantId!.Value)
            .Select(group => new { MerchantId = group.Key, Value = group.Sum(item => item.CommissionBaseAmount) })
            .ToDictionaryAsync(item => item.MerchantId, item => item.Value, cancellationToken);
        var now = _time.GetUtcNow();
        return (page.Select(item => new ResellerPortfolioItemResponse(
            item.Merchant.Id, item.Merchant.MerchantCode,
            item.Merchant.TradingName ?? item.Merchant.LegalBusinessName,
            item.Merchant.CommissionPlan.ToString(), item.Merchant.AcquiredBySalespersonId,
            item.AcquiredCode, item.AcquiredName, item.Merchant.AssignedSalespersonId,
            item.AssignedCode, item.AssignedName, item.Merchant.FirstQualifyingPaidOrderAt,
            item.Merchant.FirstQualifyingMerchantOrderId, item.ActivationOrder,
            item.Merchant.RepeatCommissionEligibleUntil, RelationshipState(item.Merchant, now),
            wholesale.GetValueOrDefault(item.Merchant.Id), repeat.GetValueOrDefault(item.Merchant.Id))).ToArray(), total);
    }

    public async Task<(IReadOnlyCollection<ResellerPortfolioFinancialItemResponse> Items, int Total)> ListPortfolioFinancialAsync(
        Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken)
    {
        var (portfolio, total) = await ListPortfolioAsync(salespersonId, query, cancellationToken);
        var ids = portfolio.Select(item => item.MerchantId).ToArray();
        if (await _db.SalesCommissions.AsNoTracking().AnyAsync(
                item => item.MerchantId.HasValue && ids.Contains(item.MerchantId.Value)
                        && item.Currency != MerchantSalesConstants.Currency, cancellationToken))
            throw UnsupportedCurrency();
        var rows = await _db.Merchants.AsNoTracking().Where(item => ids.Contains(item.Id))
            .Select(item => new ResellerPortfolioFinancialItemResponse(
                item.Id, item.RepeatCommissionPercentageSnapshot,
                _db.SalesCommissions.Where(c => c.MerchantId == item.Id && c.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).Sum(c => (decimal?)c.CommissionAmount) ?? 0m,
                _db.SalesCommissions.Where(c => c.MerchantId == item.Id && c.CommissionType == SalesCommissionType.ResellerRepeatPercentage).Sum(c => (decimal?)c.CommissionAmount) ?? 0m,
                MerchantSalesConstants.Currency))
            .ToListAsync(cancellationToken);
        return (rows, total);
    }

    public async Task<(IReadOnlyCollection<SalesCommissionResponse> Items, int Total)> ListCommissionsAsync(
        CommissionLedgerQuery query, CancellationToken cancellationToken)
    {
        var filtered = CommissionLedger(query);
        var total = await filtered.CountAsync(cancellationToken);
        var entities = await filtered.Include(item => item.Merchant).Include(item => item.MerchantOrder).Include(item => item.TagOrder)
            .Include(item => item.PayoutItems).ThenInclude(item => item.CommissionPayout)
            .OrderByDescending(item => item.CalculatedAt).ThenByDescending(item => item.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(cancellationToken);
        var rows = entities.Select(CommissionResponse).ToArray();
        return (rows, total);
    }

    public async Task<AdminTagInventoryExport> ExportCommissionLedgerAsync(
        Guid? actorUserId, CommissionLedgerQuery query, CancellationToken cancellationToken)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var filtered = CommissionLedger(query);
        var count = await filtered.CountAsync(cancellationToken);
        if (count > MaxExportRows) throw ExportLimit();
        var entities = await filtered.Include(item => item.Merchant).Include(item => item.MerchantOrder).Include(item => item.TagOrder)
            .Include(item => item.PayoutItems).ThenInclude(item => item.CommissionPayout)
            .OrderBy(item => item.CalculatedAt).ThenBy(item => item.Id).ToListAsync(cancellationToken);
        var rows = entities.Select(CommissionResponse).ToArray();
        var headers = new[] { "Earned At (UTC)", "Seller Code", "Seller", "Channel", "Commission Type", "Status", "Source Number", "Merchant", "Eligible Base", "Percentage Snapshot", "Fixed Amount Snapshot", "Commission", "Currency", "Paid At (UTC)", "Reversed At (UTC)", "Reversal Reason", "Payout Claim State", "Payout Number", "Recovery Required", "Legacy Individual Payment" };
        var csvRows = rows.Select(item => new[]
        {
            ExportDate(item.CalculatedAt), item.SalespersonCode, item.SalespersonName, item.SourceType,
            item.CommissionType, item.Status, item.SourceOrderNumber, item.MerchantName ?? "",
            item.CommissionBaseAmount.ToString("0.00", CultureInfo.InvariantCulture),
            item.CommissionPercentage?.ToString("0.00", CultureInfo.InvariantCulture) ?? "",
            item.CommissionFixedAmount?.ToString("0.00", CultureInfo.InvariantCulture) ?? "",
            item.CommissionAmount.ToString("0.00", CultureInfo.InvariantCulture), item.Currency,
            ExportDate(item.PaidAt), ExportDate(item.ReversedAt), item.ReversalReason ?? "",
            item.PayoutClaimState, item.PayoutNumber ?? "", item.RequiresRecovery ? "Yes" : "No",
            item.PayoutClaimState == "LegacyIndividualPaid" ? "Yes" : "No"
        });
        await AuditExportAsync(admin, "sales-commissions.export", "SalesCommission", count,
            new { query.From, query.ToExclusive, query.SalespersonId, query.Channel, query.CommissionType, query.Status, query.MerchantId, query.Search }, cancellationToken);
        return CsvExport("mypetlink-commission-ledger", headers, csvRows);
    }

    public async Task<AdminTagInventoryExport> ExportPortfolioAsync(
        Guid? actorUserId, Guid salespersonId, ResellerPortfolioQuery query, CancellationToken cancellationToken)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        var exportQuery = new ResellerPortfolioQuery { Page = 1, PageSize = 100, Search = query.Search, State = query.State };
        var source = PortfolioMerchants(salespersonId, query);
        var count = await source.CountAsync(cancellationToken);
        if (count > MaxExportRows) throw ExportLimit();
        var all = new List<ResellerPortfolioItemResponse>();
        for (var page = 1; page <= Math.Max(1, (int)Math.Ceiling(count / 100m)); page++)
        {
            exportQuery.Page = page;
            var (items, _) = await ListPortfolioAsync(salespersonId, exportQuery, cancellationToken);
            all.AddRange(items);
        }
        var allIds = all.Select(item => item.MerchantId).ToArray();
        var financialQuery = _db.SalesCommissions.AsNoTracking().Where(item => item.MerchantId.HasValue && allIds.Contains(item.MerchantId.Value));
        if (await financialQuery.AnyAsync(
                item => item.Currency != MerchantSalesConstants.Currency, cancellationToken))
            throw UnsupportedCurrency();
        var commissions = await financialQuery.GroupBy(item => item.MerchantId!.Value).Select(group => new
        {
            MerchantId = group.Key,
            Acquisition = group.Where(item => item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).Sum(item => item.CommissionAmount),
            Repeat = group.Where(item => item.CommissionType == SalesCommissionType.ResellerRepeatPercentage).Sum(item => item.CommissionAmount)
        }).ToDictionaryAsync(item => item.MerchantId, cancellationToken);
        var percentages = await _db.Merchants.AsNoTracking().Where(item => allIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, item => item.RepeatCommissionPercentageSnapshot, cancellationToken);
        var headers = new[] { "Merchant Code", "Merchant", "Plan", "Acquired By", "Currently Assigned To", "Activation Date (UTC)", "Activation Order", "Repeat Percentage", "Repeat Eligible Until (UTC)", "State", "Lifetime Wholesale Revenue", "Eligible Repeat Revenue", "Acquisition Bonus", "Repeat Commission", "Currency" };
        var csvRows = all.Select(item => new[]
        {
            item.MerchantCode, item.MerchantName, item.CommissionPlan, item.AcquiredBySalespersonName ?? "",
            item.AssignedSalespersonName ?? "", ExportDate(item.ActivationDate), item.ActivationOrderNumber ?? "",
            percentages.GetValueOrDefault(item.MerchantId)?.ToString("0.00", CultureInfo.InvariantCulture) ?? "",
            ExportDate(item.RepeatEligibleUntil), item.RelationshipState,
            item.LifetimeWholesaleRevenue.ToString("0.00", CultureInfo.InvariantCulture),
            item.RepeatEligibleRevenue.ToString("0.00", CultureInfo.InvariantCulture),
            commissions.GetValueOrDefault(item.MerchantId)?.Acquisition.ToString("0.00", CultureInfo.InvariantCulture) ?? "0.00",
            commissions.GetValueOrDefault(item.MerchantId)?.Repeat.ToString("0.00", CultureInfo.InvariantCulture) ?? "0.00",
            MerchantSalesConstants.Currency
        });
        await AuditExportAsync(admin, "reseller-portfolio.export", "Merchant", count,
            new { salespersonId, query.Search, query.State }, cancellationToken);
        return CsvExport("mypetlink-reseller-relationships", headers, csvRows);
    }

    private IQueryable<SalesCommission> CommissionLedger(CommissionLedgerQuery query)
    {
        var range = ValidateRange(query);
        var result = FilterCommissionDimensions(_db.SalesCommissions.AsNoTracking(), query.SalespersonId,
            ParseChannel(query.Channel), ParseCommissionType(query.CommissionType))
            .Where(item => item.CalculatedAt >= range.From && item.CalculatedAt < range.ToExclusive);
        var status = ParseStatus(query.Status);
        if (status.HasValue) result = result.Where(item => item.Status == status.Value);
        if (query.MerchantId.HasValue) result = result.Where(item => item.MerchantId == query.MerchantId.Value);
        if (query.PayableAndUnclaimed == true)
            result = result.Where(item => item.Status == SalesCommissionStatus.Payable
                && !item.PayoutItems.Any(claim => claim.ReleasedAt == null));
        var search = query.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
            result = result.Where(item =>
                (item.MerchantOrder != null && item.MerchantOrder.MerchantOrderNumber.Contains(search))
                || (item.TagOrder != null && item.TagOrder.OrderNumber.Contains(search)));
        return result;
    }

    private async Task<RetailPerformanceMetrics> RetailMetricsAsync(SalesReportRange range, Guid? salespersonId, ReportChannel channel, CancellationToken token)
    {
        if (channel == ReportChannel.Merchant) return new(0, 0, 0m, 0, 0, 0m);
        var orders = RetailOrders(range, salespersonId, channel);
        if (await orders.AnyAsync(item => item.Currency != MerchantSalesConstants.Currency, token))
            throw UnsupportedCurrency();
        var orderIds = orders.Select(order => order.Id);
        var orderCount = await orders.CountAsync(token);
        var totals = await _db.TagOrderItems.AsNoTracking().Where(item => orderIds.Contains(item.OrderId))
            .GroupBy(_ => 1).Select(group => new
        {
            Units = group.Sum(item => item.Quantity), Revenue = group.Sum(item => item.FinalAmount)
        }).SingleOrDefaultAsync(token);
        var eligibleCommissions = _db.SalesCommissions.AsNoTracking()
            .Where(item => item.CommissionType == SalesCommissionType.DirectRetailPercentage
                           && item.TagOrder!.PaymentConfirmedAt >= range.From && item.TagOrder.PaymentConfirmedAt < range.ToExclusive
                           && (!salespersonId.HasValue || item.SalespersonId == salespersonId.Value));
        var eligible = await eligibleCommissions.GroupBy(_ => 1).Select(group => new
            {
                Orders = group.Select(item => item.TagOrderId).Distinct().Count(),
                Revenue = group.Sum(item => item.CommissionBaseAmount)
            }).SingleOrDefaultAsync(token);
        var eligibleOrderIds = eligibleCommissions.Select(item => item.TagOrderId!.Value);
        var eligibleUnits = await _db.TagOrderItems.AsNoTracking()
            .Where(item => eligibleOrderIds.Contains(item.OrderId))
            .SumAsync(item => (int?)item.Quantity, token) ?? 0;
        return new(orderCount, totals?.Units ?? 0, totals?.Revenue ?? 0m,
            eligible?.Orders ?? 0, eligibleUnits, eligible?.Revenue ?? 0m);
    }

    private IQueryable<TagOrder> RetailOrders(SalesReportRange range, Guid? salespersonId, ReportChannel channel)
    {
        var orders = _db.TagOrders.AsNoTracking().Where(order =>
            order.PaymentStatus == PaymentStatus.Confirmed && order.PaymentConfirmedAt >= range.From
            && order.PaymentConfirmedAt < range.ToExclusive && order.SalespersonId != null);
        if (salespersonId.HasValue) orders = orders.Where(order => order.SalespersonId == salespersonId.Value);
        if (channel == ReportChannel.Merchant) orders = orders.Where(_ => false);
        return orders;
    }

    private async Task<MerchantPerformanceMetrics> MerchantMetricsAsync(SalesReportRange range, Guid? salespersonId, ReportChannel channel, CancellationToken token)
    {
        if (channel == ReportChannel.Retail) return new(0, 0m, 0);
        var payments = _db.MerchantPayments.AsNoTracking().Where(payment => payment.PaymentDate >= range.From && payment.PaymentDate < range.ToExclusive);
        if (salespersonId.HasValue)
            payments = payments.Where(payment => payment.MerchantOrder!.Merchant!.CommissionPlan == MerchantCommissionPlan.AcquisitionAndRepeat
                ? payment.MerchantOrder.Merchant.AcquiredBySalespersonId == salespersonId.Value
                : payment.MerchantOrder.SalespersonId == salespersonId.Value);
        if (await payments.AnyAsync(item => item.Currency != MerchantSalesConstants.Currency, token))
            throw UnsupportedCurrency();
        var totals = await payments.GroupBy(_ => 1).Select(group => new
        {
            Orders = group.Select(item => item.MerchantOrderId).Distinct().Count(),
            Revenue = group.Sum(item => item.MerchantOrder!.MerchandiseSubtotal - item.MerchantOrder.DiscountTotal)
        }).SingleOrDefaultAsync(token);
        var activations = await ActivationMerchants(range, salespersonId, channel).CountAsync(token);
        return new(totals?.Orders ?? 0, totals?.Revenue ?? 0m, activations);
    }

    private IQueryable<Merchant> ActivationMerchants(SalesReportRange range, Guid? salespersonId, ReportChannel channel)
    {
        var merchants = _db.Merchants.AsNoTracking().Where(item => item.FirstQualifyingPaidOrderAt >= range.From && item.FirstQualifyingPaidOrderAt < range.ToExclusive && item.AcquiredBySalespersonId != null);
        if (salespersonId.HasValue) merchants = merchants.Where(item => item.AcquiredBySalespersonId == salespersonId.Value);
        if (channel == ReportChannel.Retail) merchants = merchants.Where(_ => false);
        return merchants;
    }

    private async Task<ResellerRelationshipMetrics> RelationshipMetricsAsync(Guid? salespersonId, ReportChannel channel, CancellationToken token)
    {
        if (channel == ReportChannel.Retail) return new(0, 0, 0, 0, 0);
        var now = _time.GetUtcNow(); var soon = now + EndingSoonWindow;
        var merchants = _db.Merchants.AsNoTracking().Where(item => item.AcquiredBySalespersonId != null);
        if (salespersonId.HasValue) merchants = merchants.Where(item => item.AcquiredBySalespersonId == salespersonId.Value);
        var grouped = await merchants.GroupBy(_ => 1).Select(group => new
        {
            Total = group.Count(),
            Active = group.Count(item => item.FirstQualifyingPaidOrderAt != null && item.RepeatCommissionEligibleUntil > soon),
            EndingSoon = group.Count(item => item.FirstQualifyingPaidOrderAt != null && item.RepeatCommissionEligibleUntil > now && item.RepeatCommissionEligibleUntil <= soon),
            Expired = group.Count(item => item.FirstQualifyingPaidOrderAt != null
                                          && (item.RepeatCommissionEligibleUntil == null
                                              || item.RepeatCommissionEligibleUntil <= now)),
            NotActivated = group.Count(item => item.FirstQualifyingPaidOrderAt == null)
        }).SingleOrDefaultAsync(token);
        return new(grouped?.Total ?? 0, grouped?.Active ?? 0, grouped?.EndingSoon ?? 0, grouped?.Expired ?? 0, grouped?.NotActivated ?? 0);
    }

    private static IQueryable<SalesCommission> FilterCommissionDimensions(IQueryable<SalesCommission> query, Guid? salespersonId, ReportChannel channel, SalesCommissionType? type)
    {
        if (salespersonId.HasValue) query = query.Where(item => item.SalespersonId == salespersonId.Value);
        if (channel == ReportChannel.Retail) query = query.Where(item => item.SourceType == SalesCommissionSourceType.TagOrder);
        if (channel == ReportChannel.Merchant) query = query.Where(item => item.SourceType == SalesCommissionSourceType.MerchantOrder);
        if (type.HasValue) query = query.Where(item => item.CommissionType == type.Value);
        return query;
    }

    private static async Task<CommissionAccountingMetrics> AccountingAsync(IQueryable<SalesCommission> dimensions, IQueryable<SalesCommission> earned, SalesReportRange range, CancellationToken token)
    {
        if (await dimensions.AnyAsync(item => item.Currency != MerchantSalesConstants.Currency
                && ((item.CalculatedAt >= range.From && item.CalculatedAt < range.ToExclusive)
                    || (item.PaidAt >= range.From && item.PaidAt < range.ToExclusive)
                    || (item.ReversedAt >= range.From && item.ReversedAt < range.ToExclusive)), token))
            throw UnsupportedCurrency();
        var current = await earned.GroupBy(_ => 1).Select(group => new
        {
            Gross = group.Sum(item => item.CommissionAmount),
            Valid = group.Where(item => item.Status != SalesCommissionStatus.Reversed).Sum(item => item.CommissionAmount),
            Payable = group.Where(item => item.Status == SalesCommissionStatus.Payable).Sum(item => item.CommissionAmount),
            Paid = group.Where(item => item.Status == SalesCommissionStatus.Paid).Sum(item => item.CommissionAmount),
            Reversed = group.Where(item => item.Status == SalesCommissionStatus.Reversed).Sum(item => item.CommissionAmount)
        }).SingleOrDefaultAsync(token);
        var cashPaid = await dimensions.Where(item => item.PaidAt >= range.From && item.PaidAt < range.ToExclusive)
            .SumAsync(item => (decimal?)item.CommissionAmount, token) ?? 0m;
        var reversals = await dimensions.Where(item => item.ReversedAt >= range.From && item.ReversedAt < range.ToExclusive)
            .SumAsync(item => (decimal?)item.CommissionAmount, token) ?? 0m;
        return new(current?.Gross ?? 0m, current?.Valid ?? 0m, current?.Payable ?? 0m,
            current?.Paid ?? 0m, current?.Reversed ?? 0m, cashPaid, reversals, MerchantSalesConstants.Currency);
    }

    private IQueryable<Merchant> PortfolioMerchants(Guid salespersonId, ResellerPortfolioQuery query)
    {
        var now = _time.GetUtcNow(); var soon = now + EndingSoonWindow;
        var result = _db.Merchants.AsNoTracking().Where(item => item.AcquiredBySalespersonId == salespersonId);
        var search = query.Search?.Trim();
        if (!string.IsNullOrEmpty(search)) result = result.Where(item => item.MerchantCode.Contains(search) || item.LegalBusinessName.Contains(search) || (item.TradingName != null && item.TradingName.Contains(search)));
        result = query.State?.Trim().ToLowerInvariant() switch
        {
            "notactivated" => result.Where(item => item.FirstQualifyingPaidOrderAt == null),
            "active" => result.Where(item => item.FirstQualifyingPaidOrderAt != null && item.RepeatCommissionEligibleUntil > soon),
            "endingsoon" => result.Where(item => item.FirstQualifyingPaidOrderAt != null && item.RepeatCommissionEligibleUntil > now && item.RepeatCommissionEligibleUntil <= soon),
            "expired" => result.Where(item => item.FirstQualifyingPaidOrderAt != null
                                               && (item.RepeatCommissionEligibleUntil == null
                                                   || item.RepeatCommissionEligibleUntil <= now)),
            null or "" => result,
            _ => throw Validation("state", "Choose a valid relationship state.")
        };
        return result;
    }

    private static string RelationshipState(Merchant merchant, DateTimeOffset now)
    {
        if (!merchant.FirstQualifyingPaidOrderAt.HasValue) return "NotActivated";
        if (!merchant.RepeatCommissionEligibleUntil.HasValue
            || merchant.RepeatCommissionEligibleUntil <= now) return "Expired";
        return merchant.RepeatCommissionEligibleUntil <= now + EndingSoonWindow ? "EndingSoon" : "Active";
    }

    private static SalesCommissionResponse CommissionResponse(SalesCommission item)
    {
        var claim = item.PayoutItems
            .Where(entry => entry.ReleasedAt == null)
            .OrderByDescending(entry => entry.CreatedAt)
            .FirstOrDefault();
        var claimState = claim?.CommissionPayout?.Status switch
        {
            CommissionPayoutStatus.Prepared => "ReservedInPreparedPayout",
            CommissionPayoutStatus.Paid => "IncludedInPaidPayout",
            _ when item.Status == SalesCommissionStatus.Paid => "LegacyIndividualPaid",
            _ => "Unclaimed",
        };
        var requiresRecovery = claim?.CommissionPayout?.Status == CommissionPayoutStatus.Paid
            && item.Status == SalesCommissionStatus.Reversed;
        return new(
        item.Id, item.SourceType.ToString(), item.CommissionType.ToString(), item.MerchantOrderId,
        item.MerchantPaymentId, item.TagOrderId, item.MerchantId,
        item.Merchant != null ? item.Merchant.TradingName ?? item.Merchant.LegalBusinessName : null,
        item.SourceType == SalesCommissionSourceType.MerchantOrder
            ? item.MerchantOrder?.MerchantOrderNumber ?? ""
            : item.TagOrder?.OrderNumber ?? "",
        item.SalespersonId, item.SalespersonCodeSnapshot, item.SalespersonNameSnapshot,
        item.CommissionPercentageSnapshot, item.CommissionFixedAmountSnapshot, item.CommissionBaseAmount,
        item.CommissionAmount, item.Currency, item.CommissionRuleId, item.CommissionRuleEffectiveFromSnapshot,
        item.Status.ToString(), item.CalculatedAt, item.PaidAt, item.PaidByAdminUserId, item.ReversedAt,
        item.ReversedByAdminUserId, item.ReversalReason, item.InternalNote, claimState,
        claim?.CommissionPayoutId, claim?.CommissionPayout?.PayoutNumber, requiresRecovery,
        Convert.ToBase64String(item.RowVersion));
    }

    private static SalesReportRange ValidateRange(SalesReportQuery query)
    {
        if (!query.From.HasValue) throw Validation("from", "Choose a start date and time.");
        if (!query.ToExclusive.HasValue) throw Validation("toExclusive", "Choose an end date and time.");
        var from = query.From.Value.ToUniversalTime(); var to = query.ToExclusive.Value.ToUniversalTime();
        if (to <= from) throw Validation("toExclusive", "The end must be later than the start.");
        if (to - from > TimeSpan.FromDays(366 * 5)) throw Validation("toExclusive", "Choose a range of five years or less.");
        return new(from, to);
    }

    private static ReportChannel ParseChannel(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        null or "" or "all" => ReportChannel.All,
        "retail" or "tagorder" => ReportChannel.Retail,
        "merchant" or "merchantorder" => ReportChannel.Merchant,
        _ => throw Validation("channel", "Choose retail, merchant, or all channels.")
    };
    private static SalesCommissionType? ParseCommissionType(string? value) => string.IsNullOrWhiteSpace(value) ? null
        : Enum.TryParse<SalesCommissionType>(value, true, out var parsed) ? parsed
        : throw Validation("commissionType", "Choose a valid commission type.");
    private static SalesCommissionStatus? ParseStatus(string? value) => string.IsNullOrWhiteSpace(value) ? null
        : Enum.TryParse<SalesCommissionStatus>(value, true, out var parsed) ? parsed
        : throw Validation("status", "Choose a valid commission status.");

    private async Task<Salesperson> RequireSalespersonAsync(Guid id, CancellationToken token) =>
        await _db.Salespersons.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id, token)
        ?? throw new ApiException(404, "salesperson_not_found", "That salesperson no longer exists.");
    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken token)
    {
        if (!userId.HasValue) throw new ApiException(401, "unauthorized", "Authentication is required.");
        return await _db.AdminUsers.SingleOrDefaultAsync(item => item.UserId == userId.Value && item.IsActive && item.DisabledAt == null, token)
               ?? throw new ApiException(403, "forbidden", "You do not have permission to export this report.");
    }
    private async Task AuditExportAsync(AdminUser admin, string action, string entity, int count, object filters, CancellationToken token)
    {
        _audit.Append(admin.UserId, ActorType.Admin, action, entity, null, null, new { rowCount = count, filters });
        await _db.SaveChangesAsync(token);
    }
    private static AdminTagInventoryExport CsvExport(string prefix, string[] headers, IEnumerable<string[]> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', headers.Select(AdminExportSanitizer.Csv)));
        foreach (var row in rows) builder.AppendLine(string.Join(',', row.Select(AdminExportSanitizer.Csv)));
        return new($"{prefix}-{DateTimeOffset.UtcNow:yyyyMMdd-HHmm}.csv", "text/csv; charset=utf-8", new UTF8Encoding(true).GetBytes(builder.ToString()));
    }
    private static string ExportDate(DateTimeOffset? value) => value?.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "";
    private static ApiException ExportLimit() => Validation("filters", $"Narrow the filters to {MaxExportRows} rows or fewer before exporting.");
    private static ApiException UnsupportedCurrency() => new(409, "unsupported_report_currency", "This report contains a currency that is not supported yet.");
    private static ApiException Validation(string key, string message) => new(400, "validation_failed", "Please check the submitted fields.", new Dictionary<string, string[]> { [key] = [message] });
    private enum ReportChannel { All, Retail, Merchant }
}
