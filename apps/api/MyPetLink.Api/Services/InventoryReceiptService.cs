using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IInventoryReceiptService
{
    Task<IReadOnlyCollection<InventoryReceiptSkuOption>> GetOptionsAsync(
        CancellationToken cancellationToken = default);
    Task<(IReadOnlyCollection<InventoryReceiptResponse> Items, int Total)> ListAsync(
        InventoryReceiptQuery query, CancellationToken cancellationToken = default);
    Task<InventoryReceiptResponse> CreateAsync(
        Guid? actorUserId, CreateInventoryReceiptRequest request,
        CancellationToken cancellationToken = default);
    Task<ProfitabilityReportResponse> GetProfitabilityAsync(
        ProfitabilityReportQuery query, CancellationToken cancellationToken = default);
}

public sealed class InventoryReceiptService : IInventoryReceiptService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly IBusinessReferenceGenerator _references;
    private readonly TimeProvider _timeProvider;

    public InventoryReceiptService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IBusinessReferenceGenerator references,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _references = references;
        _timeProvider = timeProvider;
    }

    public async Task<IReadOnlyCollection<InventoryReceiptSkuOption>> GetOptionsAsync(
        CancellationToken cancellationToken = default)
    {
        var variants = await _dbContext.TagProductVariants.AsNoTracking()
            .Where(variant => variant.ArchivedAt == null)
            .OrderBy(variant => variant.TagProduct.SortOrder)
            .ThenBy(variant => variant.SortOrder)
            .Select(variant => new
            {
                variant.Id,
                variant.Sku,
                ProductName = variant.TagProduct.Name,
                VariantName = variant.DisplayName,
                Batches = variant.SmartTagBatches
                    .Where(batch => batch.ArchivedAt == null)
                    .OrderByDescending(batch => batch.GeneratedAt)
                    .Select(batch => new InventoryReceiptBatchOption(
                        batch.Id,
                        batch.BatchNo,
                        batch.Quantity,
                        batch.SmartTags.Count(tag =>
                            tag.InventoryReceiptId == null
                            && tag.Status == SmartTagStatus.Unclaimed
                            && tag.OwnerUserId == null
                            && tag.PetId == null
                            && tag.OrderId == null
                            && tag.ArchivedAt == null
                            && tag.DeletedAt == null
                            && !_dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                                allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null))))
                    .ToArray(),
            })
            .ToListAsync(cancellationToken);
        return variants.Select(variant => new InventoryReceiptSkuOption(
            variant.Id, variant.Sku, variant.ProductName, variant.VariantName, variant.Batches)).ToArray();
    }

    public async Task<(IReadOnlyCollection<InventoryReceiptResponse> Items, int Total)> ListAsync(
        InventoryReceiptQuery query, CancellationToken cancellationToken = default)
    {
        var rows = _dbContext.InventoryReceipts.AsNoTracking().AsQueryable();
        // A corrected receipt no longer owns any stock, so it is not part of
        // the working list unless the caller is reviewing correction history.
        if (!query.IncludeSuperseded)
            rows = rows.Where(InventoryReceiptRules.IsActive);
        if (query.ProductVariantId.HasValue)
            rows = rows.Where(row => row.TagProductVariantId == query.ProductVariantId);
        if (query.BatchId.HasValue)
            rows = rows.Where(row => row.SmartTagBatchId == query.BatchId);
        if (query.ReceivedFrom.HasValue)
            rows = rows.Where(row => row.ReceivedAt >= query.ReceivedFrom);
        if (query.ReceivedTo.HasValue)
            rows = rows.Where(row => row.ReceivedAt < query.ReceivedTo);

        var total = await rows.CountAsync(cancellationToken);
        var receiptRows = await rows
            .Include(row => row.TagProductVariant)
                .ThenInclude(variant => variant.TagProduct)
            .Include(row => row.SmartTagBatch)
            .OrderByDescending(row => row.ReceivedAt)
            .ThenByDescending(row => row.ReceiptNumber)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);
        var items = receiptRows.Select(ToResponse).ToArray();
        return (items, total);
    }

    public async Task<InventoryReceiptResponse> CreateAsync(
        Guid? actorUserId, CreateInventoryReceiptRequest request,
        CancellationToken cancellationToken = default)
    {
        var admin = await RequireAdminAsync(actorUserId, cancellationToken);
        ValidateRequest(request);

        var strategy = _dbContext.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            // The SKU lock is taken before the transaction opens and released
            // after it closes, the same order order creation uses. A session
            // application lock acquired inside a transaction does not survive
            // the commit, so releasing it afterwards would fail and turn a
            // saved receipt into a 500 the operator would retry.
            await using var inventoryLock = _dbContext.Database.IsSqlServer()
                ? await SqlServerInventoryReservationLock.AcquireAsync(
                    _dbContext, [request.ProductVariantId], cancellationToken)
                : null;
            await using var transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
                : null;

            var variant = await _dbContext.TagProductVariants
                .Include(row => row.TagProduct)
                .SingleOrDefaultAsync(row => row.Id == request.ProductVariantId, cancellationToken)
                ?? throw Validation("productVariantId", "Choose an existing product SKU.");

            SmartTagBatch? batch = null;
            if (request.SmartTagBatchId.HasValue)
            {
                batch = await _dbContext.SmartTagBatches.SingleOrDefaultAsync(
                    row => row.Id == request.SmartTagBatchId, cancellationToken)
                    ?? throw Validation("smartTagBatchId", "Choose an existing production batch.");
                if (batch.ProductVariantId != variant.Id)
                    throw Validation("smartTagBatchId", "The production batch must belong to the selected SKU.");
            }

            var now = _timeProvider.GetUtcNow();
            var costs = CalculateCosts(request);
            var receipt = new InventoryReceipt
            {
                ReceiptNumber = await GenerateReceiptNumberAsync(now, cancellationToken),
                TagProductVariantId = variant.Id,
                SmartTagBatchId = batch?.Id,
                QuantityReceived = request.QuantityReceived,
                ReceivedAt = request.ReceivedAt.ToUniversalTime(),
                SupplierName = Trim(request.SupplierName),
                SupplierReference = Trim(request.SupplierReference),
                Notes = Trim(request.Notes),
                PurchaseCurrency = request.PurchaseCurrency.Trim().ToUpperInvariant(),
                ExchangeRateToMyr = costs.ExchangeRate,
                CostMode = request.CostMode,
                GoodsCost = costs.Goods,
                FreightCost = costs.Freight,
                CustomsTaxCost = costs.CustomsTax,
                OtherLandedCost = costs.Other,
                TotalLandedCostMyr = costs.TotalMyr,
                UnitLandedCostMyr = costs.UnitMyr,
                CreatedByAdminUserId = admin.Id,
                CorrectsReceiptId = request.CorrectsReceiptId,
                CorrectionReason = Trim(request.CorrectionReason),
                CreatedAt = now,
                UpdatedAt = now,
            };

            SmartTag[] tags;
            InventoryReceipt? corrected = null;
            if (request.CorrectsReceiptId.HasValue)
            {
                corrected = await LoadCorrectableReceiptAsync(request, cancellationToken);
                tags = corrected.SmartTags.OrderBy(tag => tag.TagCode).ToArray();
            }
            else
            {
                var candidates = _dbContext.SmartTags
                    .Where(tag =>
                        tag.ProductVariantId == variant.Id
                        && tag.InventoryReceiptId == null
                        && tag.Status == SmartTagStatus.Unclaimed
                        && tag.OwnerUserId == null
                        && tag.PetId == null
                        && tag.OrderId == null
                        && tag.ArchivedAt == null
                        && tag.DeletedAt == null
                        && !_dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                            allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null));
                if (batch is not null)
                    candidates = candidates.Where(tag => tag.BatchId == batch.Id);
                tags = await candidates
                    .OrderBy(tag => tag.CreatedAt)
                    .ThenBy(tag => tag.TagCode)
                    .Take(request.QuantityReceived)
                    .ToArrayAsync(cancellationToken);
            }

            // One guard for every path. A receipt must own exactly as many
            // serialized tags as it claims to have received, or the recorded
            // quantity and landed cost would describe stock that is not there.
            if (tags.Length != request.QuantityReceived)
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "receipt_inventory_shortfall",
                    $"Only {tags.Length} eligible unreceived tag(s) are available for this receipt.");

            _dbContext.InventoryReceipts.Add(receipt);
            foreach (var tag in tags)
            {
                tag.InventoryReceipt = receipt;
                tag.UpdatedAt = now;
            }

            // The correction takes ownership of the units; the original keeps
            // its figures and stays readable, but stops counting anywhere.
            if (corrected is not null)
            {
                corrected.SupersededAt = now;
                corrected.SupersededByReceiptId = receipt.Id;
                corrected.UpdatedAt = now;
            }
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    await _dbContext.SaveChangesAsync(cancellationToken);
                    break;
                }
                catch (DbUpdateException exception) when (
                    UniqueConstraintViolation.IsFor(
                        exception, "IX_InventoryReceipts_ReceiptNumber")
                    && attempt < 11)
                {
                    receipt.ReceiptNumber = await GenerateReceiptNumberAsync(now, cancellationToken);
                }
            }
            _auditLogService.Append(
                admin.Id, ActorType.Admin, "inventory-receipt.create", "InventoryReceipt", receipt.Id,
                null,
                new
                {
                    receipt.ReceiptNumber,
                    sku = variant.Sku,
                    batch = batch?.BatchNo,
                    receipt.QuantityReceived,
                    receipt.TotalLandedCostMyr,
                    receipt.UnitLandedCostMyr,
                    receipt.CorrectsReceiptId,
                    linkedTagCount = tags.Length,
                });
            if (corrected is not null)
            {
                _auditLogService.Append(
                    admin.Id, ActorType.Admin, "inventory-receipt.superseded",
                    "InventoryReceipt", corrected.Id,
                    new
                    {
                        corrected.ReceiptNumber,
                        corrected.TotalLandedCostMyr,
                        corrected.UnitLandedCostMyr,
                    },
                    new
                    {
                        corrected.SupersededAt,
                        corrected.SupersededByReceiptId,
                        supersededByReceiptNumber = receipt.ReceiptNumber,
                        reason = receipt.CorrectionReason,
                    });
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
            if (transaction is not null)
                await transaction.CommitAsync(cancellationToken);
            return ToResponse(receipt, variant.Sku, variant.TagProduct.Name, batch?.BatchNo);
        });
    }

    public async Task<ProfitabilityReportResponse> GetProfitabilityAsync(
        ProfitabilityReportQuery query, CancellationToken cancellationToken = default)
    {
        if (query.From == default || query.To == default || query.To <= query.From)
            throw Validation("to", "Choose an end date after the start date.");

        var retail = await _dbContext.TagOrderItems.AsNoTracking()
            .Where(item =>
                (item.CostSnapshotAt ?? item.Order.ShippedAt) >= query.From
                && (item.CostSnapshotAt ?? item.Order.ShippedAt) < query.To)
            .Select(item => new ProfitLine(
                "Retail", item.OrderId, item.Order.OrderNumber,
                (item.CostSnapshotAt ?? item.Order.ShippedAt)!.Value,
                item.Subtotal, item.DiscountAmount, item.FinalAmount,
                item.Quantity, item.CostOfGoodsSnapshot,
                item.Quantity - item.CostAllocations.Count(allocation =>
                    allocation.UnitLandedCostMyrSnapshot != null),
                RetailExclusion(item.Order.Status, item.Order.PaymentStatus)))
            .ToListAsync(cancellationToken);

        var legacyRetail = await _dbContext.TagOrders.AsNoTracking()
            .Where(order => order.ShippedAt >= query.From && order.ShippedAt < query.To
                && !order.Items.Any())
            .Select(order => new ProfitLine(
                "Retail", order.Id, order.OrderNumber, order.ShippedAt!.Value,
                order.Amount, 0m, order.Amount, 1, null, 1,
                RetailExclusion(order.Status, order.PaymentStatus)))
            .ToListAsync(cancellationToken);
        retail.AddRange(legacyRetail);

        var merchant = await _dbContext.MerchantOrderItems.AsNoTracking()
            .Where(item =>
                (item.CostSnapshotAt ?? item.MerchantOrder!.ShippedAt) >= query.From
                && (item.CostSnapshotAt ?? item.MerchantOrder!.ShippedAt) < query.To)
            .Select(item => new ProfitLine(
                "Merchant", item.MerchantOrderId, item.MerchantOrder!.MerchantOrderNumber,
                (item.CostSnapshotAt ?? item.MerchantOrder.ShippedAt)!.Value,
                item.WholesaleUnitPrice * item.Quantity,
                item.LineDiscount,
                item.LineSubtotal,
                item.Quantity, item.CostOfGoodsSnapshot,
                // Costed-ness is a property of the frozen snapshot, never of the
                // allocation's current release state: releasing an allocation
                // after dispatch is an auditable correction that must not make
                // an already-costed unit look uncosted.
                item.Quantity - item.MerchantOrder.AllocatedTags.Count(allocation =>
                    allocation.MerchantOrderItemId == item.Id
                    && allocation.CostSnapshotAt != null
                    && allocation.UnitLandedCostMyrSnapshot != null),
                item.MerchantOrder.PaymentStatus == MerchantOrderPaymentStatus.Cancelled
                    ? "Cancelled"
                    : null))
            .ToListAsync(cancellationToken);

        var allLines = retail.Concat(merchant).ToArray();

        // Revenue that went back to the customer is not this period's revenue.
        // Those orders are listed rather than summed, so the omission is
        // visible instead of silently changing the totals.
        var excludedOrders = allLines
            .Where(line => line.ExclusionReason is not null)
            .GroupBy(line => new { line.Channel, line.OrderId, line.OrderNumber, line.ExclusionReason })
            .Select(group => new ProfitabilityExcludedOrder(
                group.Key.Channel, group.Key.OrderId, group.Key.OrderNumber,
                group.Key.ExclusionReason!,
                RoundMoney(group.Sum(line => line.NetRevenue))))
            .OrderBy(row => row.OrderNumber)
            .ToArray();

        var lines = allLines.Where(line => line.ExclusionReason is null).ToArray();
        var merchantOrderIds = lines
            .Where(line => line.Channel == "Merchant")
            .Select(line => line.OrderId).Distinct().ToArray();
        var retailOrderIds = lines
            .Where(line => line.Channel == "Retail")
            .Select(line => line.OrderId).Distinct().ToArray();

        // Order-level merchant discounts are applied once per order below.
        // Line-level discounts are already represented by each line's
        // LineDiscount, so neither is subtracted twice.
        var merchantDiscountByOrder = await _dbContext.MerchantOrders.AsNoTracking()
            .Where(order => merchantOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, order.DiscountTotal })
            .ToDictionaryAsync(row => row.Id, row => row.DiscountTotal, cancellationToken);
        var retailCourierByOrder = await _dbContext.TagOrders.AsNoTracking()
            .Where(order => retailOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, order.ActualCourierCost })
            .ToDictionaryAsync(row => row.Id, row => row.ActualCourierCost, cancellationToken);
        var merchantCourierByOrder = await _dbContext.MerchantOrders.AsNoTracking()
            .Where(order => merchantOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, order.InternalCourierCost })
            .ToDictionaryAsync(row => row.Id, row => row.InternalCourierCost, cancellationToken);
        var merchantCommissionByOrder = await _dbContext.SalesCommissions.AsNoTracking()
            .Where(row => row.SourceType == SalesCommissionSourceType.MerchantOrder
                && row.MerchantOrderId.HasValue
                && merchantOrderIds.Contains(row.MerchantOrderId.Value)
                && row.Status != SalesCommissionStatus.Reversed)
            .GroupBy(row => row.MerchantOrderId!.Value)
            .Select(group => new { OrderId = group.Key, Amount = group.Sum(row => row.CommissionAmount) })
            .ToDictionaryAsync(row => row.OrderId, row => row.Amount, cancellationToken);
        var retailCommissionByOrder = await _dbContext.SalesCommissions.AsNoTracking()
            .Where(row => row.SourceType == SalesCommissionSourceType.TagOrder
                && row.TagOrderId.HasValue
                && retailOrderIds.Contains(row.TagOrderId.Value)
                && row.Status != SalesCommissionStatus.Reversed)
            .GroupBy(row => row.TagOrderId!.Value)
            .Select(group => new { OrderId = group.Key, Amount = group.Sum(row => row.CommissionAmount) })
            .ToDictionaryAsync(row => row.OrderId, row => row.Amount, cancellationToken);

        // One row per order, classified by whether every unit on it carries a
        // real cost. Cost is never estimated for the rest.
        var details = lines
            .GroupBy(line => new { line.Channel, line.OrderId, line.OrderNumber })
            .Select(group =>
            {
                var isMerchant = group.Key.Channel == "Merchant";
                var selling = RoundMoney(
                    group.Sum(line => line.NetRevenue)
                    - (isMerchant
                        ? merchantDiscountByOrder.GetValueOrDefault(group.Key.OrderId)
                        : 0m));
                var uncostedUnits = group.Sum(line => line.UncostedUnits);
                var fullyCosted = uncostedUnits == 0;
                decimal? cost = fullyCosted
                    ? RoundMoney(group.Sum(line => line.CostOfGoods ?? 0m))
                    : null;
                return new ProfitabilityOrderDetail(
                    group.Key.Channel, group.Key.OrderId, group.Key.OrderNumber,
                    group.Min(line => line.SnapshotAt), selling, cost,
                    cost.HasValue ? selling - cost.Value : null,
                    group.Sum(line => line.Units), uncostedUnits, fullyCosted);
            })
            .OrderByDescending(row => row.CostSnapshotAt)
            .ToArray();

        var costedOrders = details.Where(row => row.IsFullyCosted).ToArray();
        var uncostedOrders = details.Where(row => !row.IsFullyCosted).ToArray();

        var merchantOrderDiscount = merchantDiscountByOrder.Values.Sum();
        var productRevenue = RoundMoney(lines.Sum(line => line.GrossRevenue));
        var discounts = RoundMoney(lines.Sum(line => line.LineDiscount) + merchantOrderDiscount);
        var netRevenue = RoundMoney(details.Sum(row => row.SellingAmount));

        var costedNetRevenue = RoundMoney(costedOrders.Sum(row => row.SellingAmount));
        var costedCogs = RoundMoney(costedOrders.Sum(row => row.CostOfGoods ?? 0m));
        var costedGrossProfit = RoundMoney(costedNetRevenue - costedCogs);
        decimal? costedMargin = costedNetRevenue != 0m
            ? decimal.Round(costedGrossProfit / costedNetRevenue * 100m, 2, MidpointRounding.AwayFromZero)
            : null;
        var uncostedNetRevenue = RoundMoney(uncostedOrders.Sum(row => row.SellingAmount));
        var uncostedUnitsTotal = lines.Sum(line => line.UncostedUnits);

        decimal CourierFor(ProfitabilityOrderDetail row) =>
            (row.Channel == "Merchant"
                ? merchantCourierByOrder.GetValueOrDefault(row.OrderId)
                : retailCourierByOrder.GetValueOrDefault(row.OrderId)) ?? 0m;
        bool MissingCourier(ProfitabilityOrderDetail row) =>
            (row.Channel == "Merchant"
                ? merchantCourierByOrder.GetValueOrDefault(row.OrderId)
                : retailCourierByOrder.GetValueOrDefault(row.OrderId)) is null;
        decimal CommissionFor(ProfitabilityOrderDetail row) =>
            row.Channel == "Merchant"
                ? merchantCommissionByOrder.GetValueOrDefault(row.OrderId)
                : retailCommissionByOrder.GetValueOrDefault(row.OrderId);

        var courierCost = RoundMoney(details.Sum(CourierFor));
        var missingCourier = details.Count(MissingCourier);
        var commissions = RoundMoney(details.Sum(CommissionFor));
        var costedCourierCost = RoundMoney(costedOrders.Sum(CourierFor));
        var costedCommissions = RoundMoney(costedOrders.Sum(CommissionFor));

        // Contribution is scoped to the costed orders so it reconciles with the
        // costed gross profit above, and is withheld entirely when any of those
        // orders has no recorded courier cost rather than treating it as free.
        decimal? contribution = costedOrders.Any(MissingCourier)
            ? null
            : RoundMoney(costedGrossProfit - costedCourierCost - costedCommissions);

        var notes = new List<string>
        {
            "Payment gateway fees are not recorded.",
            "Advertising and other operating expenses are not recorded.",
            "Replacement/warranty unit costs are not included in Phase 1 contribution profit.",
        };
        if (uncostedUnitsTotal > 0)
        {
            notes.Add(
                $"{uncostedUnitsTotal} unit(s) have no recorded stock cost. Their revenue is reported separately and no cost is estimated for them.");
        }

        if (excludedOrders.Length > 0)
        {
            notes.Add(
                $"{excludedOrders.Length} refunded or cancelled order(s) are excluded from revenue and listed separately. MyPetLink does not yet record refund accounting.");
        }

        return new ProfitabilityReportResponse(
            query.From, query.To,
            productRevenue, discounts, netRevenue, lines.Sum(line => line.Units),
            costedNetRevenue, costedOrders.Sum(row => row.Units), costedCogs,
            costedGrossProfit, costedMargin,
            uncostedNetRevenue, uncostedUnitsTotal, uncostedUnitsTotal == 0,
            courierCost, missingCourier, commissions,
            costedCourierCost, costedCommissions, contribution,
            excludedOrders, notes, details);
    }

    /// <summary>
    /// Why a retail order's revenue should not count towards the period. A
    /// refunded or cancelled order keeps its historical figures, but the money
    /// is not ours any more.
    /// </summary>
    private static string? RetailExclusion(OrderStatus status, PaymentStatus paymentStatus) =>
        paymentStatus == PaymentStatus.Refunded ? "Refunded"
        : status == OrderStatus.Cancelled ? "Cancelled"
        : null;

    /// <summary>
    /// Loads the receipt a correction is restating, tracked so the caller can
    /// stamp it superseded, and refuses every case where correcting it would
    /// misstate stock: no reason given, a stale view of the receipt, one that
    /// has already been corrected, a different SKU/batch/quantity, or one whose
    /// units have already been costed into a shipment.
    /// </summary>
    private async Task<InventoryReceipt> LoadCorrectableReceiptAsync(
        CreateInventoryReceiptRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CorrectionReason))
            throw Validation("correctionReason", "Explain why this receipt corrects the earlier record.");
        if (string.IsNullOrWhiteSpace(request.CorrectsReceiptRowVersion))
            throw Validation("correctsReceiptRowVersion", "Reload the receipt before correcting it.");

        var prior = await _dbContext.InventoryReceipts
            .Include(row => row.SmartTags)
            .SingleOrDefaultAsync(row => row.Id == request.CorrectsReceiptId, cancellationToken)
            ?? throw Validation("correctsReceiptId", "Choose an existing receipt to correct.");

        // Correcting from a stale view would silently overwrite whatever the
        // other administrator just did, so the token is checked before any of
        // the state below is trusted.
        ApplyConcurrency(prior, request.CorrectsReceiptRowVersion);

        if (prior.SupersededAt is not null)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "receipt_already_superseded",
                "This receipt was already corrected. Correct the receipt that replaced it instead.");
        }

        if (prior.TagProductVariantId != request.ProductVariantId
            || prior.SmartTagBatchId != request.SmartTagBatchId
            || prior.QuantityReceived != request.QuantityReceived)
            throw Validation("correctsReceiptId", "A correction must keep the original SKU, batch, and quantity.");

        var tagIds = prior.SmartTags.Select(tag => tag.Id).ToArray();
        var used = await _dbContext.TagOrderItemCostAllocations.AnyAsync(
                row => tagIds.Contains(row.SmartTagId), cancellationToken)
            || await _dbContext.MerchantOrderAllocatedTags.AnyAsync(
                row => tagIds.Contains(row.SmartTagId) && row.CostSnapshotAt != null,
                cancellationToken);
        if (used)
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "receipt_already_costed",
                "This receipt has contributed to shipped inventory and cannot be corrected. Record a separate financial adjustment in a later accounting period.");
        return prior;
    }

    private void ApplyConcurrency(InventoryReceipt receipt, string token)
    {
        byte[] original;
        try
        {
            original = Convert.FromBase64String(token);
        }
        catch (FormatException)
        {
            throw Validation("correctsReceiptRowVersion", "Reload the receipt before correcting it.");
        }

        _dbContext.Entry(receipt).Property(row => row.RowVersion).OriginalValue = original;
    }

    private static (decimal ExchangeRate, decimal Goods, decimal Freight, decimal CustomsTax,
        decimal Other, decimal TotalMyr, decimal UnitMyr) CalculateCosts(
        CreateInventoryReceiptRequest request)
    {
        var currency = request.PurchaseCurrency.Trim().ToUpperInvariant();
        var exchange = currency == "MYR" ? 1m : request.ExchangeRateToMyr ?? 0m;
        if (exchange <= 0m)
            throw Validation("exchangeRateToMyr", "Enter a positive exchange rate to MYR.");

        decimal goods;
        decimal freight;
        decimal customs;
        decimal other;
        decimal total;
        if (request.CostMode == InventoryReceiptCostMode.Simple)
        {
            if (request.UnitLandedCostMyr is null or <= 0m)
                throw Validation("unitLandedCostMyr", "Enter a positive landed cost per tag.");
            goods = freight = customs = other = 0m;
            total = RoundMoney(request.UnitLandedCostMyr.Value * request.QuantityReceived);
        }
        else
        {
            goods = RoundMoney(NonNegative(request.GoodsCost, "goodsCost"));
            freight = RoundMoney(NonNegative(request.FreightCost, "freightCost"));
            customs = RoundMoney(NonNegative(request.CustomsTaxCost, "customsTaxCost"));
            other = RoundMoney(NonNegative(request.OtherLandedCost, "otherLandedCost"));
            var purchaseTotal = goods + freight + customs + other;
            if (purchaseTotal <= 0m)
                throw Validation("goodsCost", "The landed-cost components must total more than zero.");
            total = RoundMoney(purchaseTotal * exchange);
        }
        return (Round6(exchange), RoundMoney(goods), RoundMoney(freight), RoundMoney(customs),
            RoundMoney(other), total, Round6(total / request.QuantityReceived));
    }

    private static decimal NonNegative(decimal? value, string field)
    {
        var amount = value ?? 0m;
        if (amount < 0m) throw Validation(field, "Cost amounts cannot be negative.");
        return amount;
    }

    private async Task<string> GenerateReceiptNumberAsync(
        DateTimeOffset now, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 12; attempt++)
        {
            var candidate = _references.CreateInventoryReceiptNumber(now);
            if (!await _dbContext.InventoryReceipts.AnyAsync(
                    row => row.ReceiptNumber == candidate, cancellationToken))
                return candidate;
        }
        throw new ApiException(StatusCodes.Status500InternalServerError,
            "inventory_receipt_number_failed", "Could not create a stock receipt number. Please try again.");
    }

    private static void ValidateRequest(CreateInventoryReceiptRequest request)
    {
        if (request.ProductVariantId == Guid.Empty)
            throw Validation("productVariantId", "Choose a product SKU.");
        if (request.QuantityReceived <= 0)
            throw Validation("quantityReceived", "Quantity must be at least one.");
        if (request.ReceivedAt == default)
            throw Validation("receivedAt", "Enter when the stock was received.");
        if (string.IsNullOrWhiteSpace(request.PurchaseCurrency)
            || request.PurchaseCurrency.Trim().Length != 3)
            throw Validation("purchaseCurrency", "Use a three-letter currency code.");
    }

    private async Task<AdminUser> RequireAdminAsync(Guid? userId, CancellationToken cancellationToken)
    {
        if (!userId.HasValue)
            throw new ApiException(StatusCodes.Status401Unauthorized, "unauthorized", "Authentication is required.");
        return await _dbContext.AdminUsers.SingleOrDefaultAsync(
            row => row.UserId == userId && row.IsActive && row.DisabledAt == null,
            cancellationToken)
            ?? throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
    }

    private static InventoryReceiptResponse ToResponse(InventoryReceipt row) =>
        ToResponse(row, row.TagProductVariant.Sku, row.TagProductVariant.TagProduct.Name,
            row.SmartTagBatch?.BatchNo);

    private static InventoryReceiptResponse ToResponse(
        InventoryReceipt row, string sku, string productName, string? batchNumber) => new(
            row.Id, row.ReceiptNumber, row.TagProductVariantId, sku, productName,
            row.SmartTagBatchId, batchNumber, row.QuantityReceived, row.ReceivedAt,
            row.SupplierName, row.SupplierReference, row.Notes, row.PurchaseCurrency,
            row.ExchangeRateToMyr, row.CostMode, row.GoodsCost, row.FreightCost,
            row.CustomsTaxCost, row.OtherLandedCost, row.TotalLandedCostMyr,
            row.UnitLandedCostMyr, row.CreatedByAdminUserId, row.CreatedAt,
            row.CorrectsReceiptId, row.CorrectionReason,
            row.SupersededAt, row.SupersededByReceiptId,
            Convert.ToBase64String(row.RowVersion));

    private static decimal Round6(decimal value) =>
        decimal.Round(value, 6, MidpointRounding.AwayFromZero);
    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException Validation(string field, string message) => new(
        StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });

    private sealed record ProfitLine(
        string Channel, Guid OrderId, string OrderNumber, DateTimeOffset SnapshotAt,
        decimal GrossRevenue, decimal LineDiscount, decimal NetRevenue,
        int Units, decimal? CostOfGoods, int UncostedUnits, string? ExclusionReason);
}
