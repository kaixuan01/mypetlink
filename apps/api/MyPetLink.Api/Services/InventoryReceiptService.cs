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
            await using var transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(cancellationToken)
                : null;
            await using var inventoryLock = _dbContext.Database.IsSqlServer()
                ? await SqlServerInventoryReservationLock.AcquireAsync(
                    _dbContext, [request.ProductVariantId], cancellationToken)
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
            if (request.CorrectsReceiptId.HasValue)
            {
                tags = await LoadCorrectionTagsAsync(request, cancellationToken);
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
                if (tags.Length != request.QuantityReceived)
                    throw new ApiException(
                        StatusCodes.Status409Conflict,
                        "receipt_inventory_shortfall",
                        $"Only {tags.Length} eligible unreceived tag(s) are available for this receipt.");
            }

            _dbContext.InventoryReceipts.Add(receipt);
            foreach (var tag in tags)
            {
                tag.InventoryReceipt = receipt;
                tag.UpdatedAt = now;
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
                });
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
                    allocation.UnitLandedCostMyrSnapshot != null)))
            .ToListAsync(cancellationToken);

        var legacyRetail = await _dbContext.TagOrders.AsNoTracking()
            .Where(order => order.ShippedAt >= query.From && order.ShippedAt < query.To
                && !order.Items.Any())
            .Select(order => new ProfitLine(
                "Retail", order.Id, order.OrderNumber, order.ShippedAt!.Value,
                order.Amount, 0m, order.Amount, 1, null, 1))
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
                item.Quantity - item.MerchantOrder.AllocatedTags.Count(allocation =>
                    allocation.MerchantOrderItemId == item.Id
                    && allocation.ReleasedAt == null
                    && allocation.UnitLandedCostMyrSnapshot != null)))
            .ToListAsync(cancellationToken);

        // Order-level merchant discounts are applied once below. Line-level
        // discounts are already represented by each line's LineDiscount.
        var merchantOrderIds = merchant.Select(line => line.OrderId).Distinct().ToArray();
        var merchantDiscountRows = await _dbContext.MerchantOrders.AsNoTracking()
            .Where(order => merchantOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, order.DiscountTotal })
            .ToListAsync(cancellationToken);
        var merchantOrderDiscount = merchantDiscountRows.Sum(row => row.DiscountTotal);
        var merchantDiscountByOrder = merchantDiscountRows.ToDictionary(
            row => row.Id, row => row.DiscountTotal);
        var lines = retail.Concat(merchant).ToArray();
        var retailOrderIds = retail.Select(line => line.OrderId).Distinct().ToArray();
        var retailCouriers = await _dbContext.TagOrders.AsNoTracking()
            .Where(order => retailOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, Cost = order.ActualCourierCost })
            .ToListAsync(cancellationToken);
        var merchantCouriers = await _dbContext.MerchantOrders.AsNoTracking()
            .Where(order => merchantOrderIds.Contains(order.Id))
            .Select(order => new { order.Id, Cost = order.InternalCourierCost })
            .ToListAsync(cancellationToken);
        var commissions = await _dbContext.SalesCommissions.AsNoTracking()
            .Where(row => merchantOrderIds.Contains(row.MerchantOrderId)
                && row.Status != SalesCommissionStatus.Reversed)
            .SumAsync(row => (decimal?)row.CommissionAmount, cancellationToken) ?? 0m;

        var productRevenue = lines.Sum(line => line.GrossRevenue);
        var discounts = lines.Sum(line => line.LineDiscount) + merchantOrderDiscount;
        var netRevenue = lines.Sum(line => line.NetRevenue) - merchantOrderDiscount;
        var knownCogs = lines.Sum(line => line.CostOfGoods ?? 0m);
        var uncosted = lines.Sum(line => line.UncostedUnits);
        var cogsComplete = uncosted == 0;
        var courierCost = retailCouriers.Sum(row => row.Cost ?? 0m)
            + merchantCouriers.Sum(row => row.Cost ?? 0m);
        var missingCourier = retailCouriers.Count(row => row.Cost is null)
            + merchantCouriers.Count(row => row.Cost is null);
        decimal? grossProfit = cogsComplete ? netRevenue - knownCogs : null;
        decimal? margin = grossProfit.HasValue && netRevenue != 0m
            ? decimal.Round(grossProfit.Value / netRevenue * 100m, 2, MidpointRounding.AwayFromZero)
            : null;
        decimal? contribution = grossProfit.HasValue && missingCourier == 0
            ? grossProfit.Value - courierCost - commissions
            : null;

        var details = lines.GroupBy(line => new { line.Channel, line.OrderId, line.OrderNumber })
            .Select(group =>
            {
                var selling = group.Sum(line => line.NetRevenue)
                    - (group.Key.Channel == "Merchant"
                        ? merchantDiscountByOrder.GetValueOrDefault(group.Key.OrderId)
                        : 0m);
                var lineUncosted = group.Sum(line => line.UncostedUnits);
                var cost = lineUncosted == 0
                    ? group.Sum(line => line.CostOfGoods!.Value)
                    : (decimal?)null;
                return new ProfitabilityOrderDetail(
                    group.Key.Channel, group.Key.OrderId, group.Key.OrderNumber,
                    group.Min(line => line.SnapshotAt), selling, cost,
                    cost.HasValue ? selling - cost.Value : null,
                    group.Sum(line => line.Units), lineUncosted);
            })
            .OrderByDescending(row => row.CostSnapshotAt)
            .ToArray();

        return new ProfitabilityReportResponse(
            query.From, query.To, productRevenue, discounts, netRevenue,
            lines.Sum(line => line.Units), knownCogs, cogsComplete, grossProfit, margin,
            uncosted, courierCost, missingCourier, commissions, contribution,
            ["Payment gateway fees are not recorded.", "Advertising and other operating expenses are not recorded.",
             "Replacement/warranty unit costs are not included in Phase 1 contribution profit."],
            details);
    }

    private async Task<SmartTag[]> LoadCorrectionTagsAsync(
        CreateInventoryReceiptRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CorrectionReason))
            throw Validation("correctionReason", "Explain why this receipt corrects the earlier record.");
        var prior = await _dbContext.InventoryReceipts
            .Include(row => row.SmartTags)
            .SingleOrDefaultAsync(row => row.Id == request.CorrectsReceiptId, cancellationToken)
            ?? throw Validation("correctsReceiptId", "Choose an existing receipt to correct.");
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
        return prior.SmartTags.OrderBy(tag => tag.TagCode).ToArray();
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
        int Units, decimal? CostOfGoods, int UncostedUnits);
}
