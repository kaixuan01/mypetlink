using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IInventoryCostingService
{
    Task SnapshotRetailShipmentAsync(
        TagOrder order,
        IReadOnlyCollection<SmartTag> shippedTags,
        DateTimeOffset snapshotAt,
        CancellationToken cancellationToken = default);

    Task SnapshotMerchantShipmentAsync(
        MerchantOrder order,
        IReadOnlyCollection<MerchantOrderAllocatedTag> allocations,
        DateTimeOffset snapshotAt,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Freezes specific-identification COGS from each serialized tag's stock
/// receipt. Existing snapshots are never recalculated.
/// </summary>
public sealed class InventoryCostingService : IInventoryCostingService
{
    private readonly MyPetLinkDbContext _dbContext;

    public InventoryCostingService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task SnapshotRetailShipmentAsync(
        TagOrder order,
        IReadOnlyCollection<SmartTag> shippedTags,
        DateTimeOffset snapshotAt,
        CancellationToken cancellationToken = default)
    {
        var unsnapshottedItems = order.Items
            .Where(item => item.CostSnapshotAt is null)
            .ToArray();
        if (unsnapshottedItems.Length == 0)
        {
            return;
        }

        var tagIds = shippedTags.Select(tag => tag.Id).ToArray();
        var receiptByTagId = await _dbContext.SmartTags
            .Where(tag => tagIds.Contains(tag.Id))
            .Select(tag => new
            {
                tag.Id,
                tag.InventoryReceiptId,
                ReceiptNumber = tag.InventoryReceipt == null
                    ? null
                    : tag.InventoryReceipt.ReceiptNumber,
                UnitCost = tag.InventoryReceipt == null
                    ? (decimal?)null
                    : tag.InventoryReceipt.UnitLandedCostMyr,
            })
            .ToDictionaryAsync(row => row.Id, cancellationToken);

        foreach (var item in unsnapshottedItems)
        {
            var itemTags = shippedTags
                .Where(tag => tag.OrderItemId == item.Id)
                .OrderBy(tag => tag.TagCode)
                .ToArray();
            var allocations = new List<TagOrderItemCostAllocation>(itemTags.Length);

            foreach (var tag in itemTags)
            {
                var receipt = receiptByTagId[tag.Id];
                allocations.Add(new TagOrderItemCostAllocation
                {
                    TagOrderItemId = item.Id,
                    SmartTagId = tag.Id,
                    InventoryReceiptId = receipt.InventoryReceiptId,
                    TagCodeSnapshot = tag.TagCode,
                    InventoryReceiptNumberSnapshot = receipt.ReceiptNumber,
                    UnitLandedCostMyrSnapshot = receipt.UnitCost,
                    CostBasis = receipt.UnitCost.HasValue
                        ? InventoryCostBasis.SpecificIdentification
                        : InventoryCostBasis.Unavailable,
                    CostSnapshotAt = snapshotAt,
                });
            }

            _dbContext.TagOrderItemCostAllocations.AddRange(allocations);
            var complete = allocations.Count == item.Quantity
                && allocations.All(allocation => allocation.UnitLandedCostMyrSnapshot.HasValue);
            item.CostOfGoodsSnapshot = complete
                ? allocations.Sum(allocation => allocation.UnitLandedCostMyrSnapshot!.Value)
                : null;
            item.CostBasis = complete
                ? InventoryCostBasis.SpecificIdentification
                : InventoryCostBasis.Unavailable;
            item.CostSnapshotAt = snapshotAt;
        }
    }

    public async Task SnapshotMerchantShipmentAsync(
        MerchantOrder order,
        IReadOnlyCollection<MerchantOrderAllocatedTag> allocations,
        DateTimeOffset snapshotAt,
        CancellationToken cancellationToken = default)
    {
        var tagIds = allocations.Select(allocation => allocation.SmartTagId).ToArray();
        var receiptByTagId = await _dbContext.SmartTags
            .Where(tag => tagIds.Contains(tag.Id))
            .Select(tag => new
            {
                tag.Id,
                tag.InventoryReceiptId,
                ReceiptNumber = tag.InventoryReceipt == null
                    ? null
                    : tag.InventoryReceipt.ReceiptNumber,
                UnitCost = tag.InventoryReceipt == null
                    ? (decimal?)null
                    : tag.InventoryReceipt.UnitLandedCostMyr,
            })
            .ToDictionaryAsync(row => row.Id, cancellationToken);

        foreach (var allocation in allocations.Where(row => row.CostSnapshotAt is null))
        {
            var receipt = receiptByTagId[allocation.SmartTagId];
            allocation.InventoryReceiptIdSnapshot = receipt.InventoryReceiptId;
            allocation.InventoryReceiptNumberSnapshot = receipt.ReceiptNumber;
            allocation.UnitLandedCostMyrSnapshot = receipt.UnitCost;
            allocation.CostBasis = receipt.UnitCost.HasValue
                ? InventoryCostBasis.SpecificIdentification
                : InventoryCostBasis.Unavailable;
            allocation.CostSnapshotAt = snapshotAt;
        }

        foreach (var item in order.Items.Where(row => row.CostSnapshotAt is null))
        {
            var itemAllocations = allocations
                .Where(allocation => allocation.MerchantOrderItemId == item.Id)
                .ToArray();
            var complete = itemAllocations.Length == item.Quantity
                && itemAllocations.All(allocation => allocation.UnitLandedCostMyrSnapshot.HasValue);
            item.CostOfGoodsSnapshot = complete
                ? itemAllocations.Sum(allocation => allocation.UnitLandedCostMyrSnapshot!.Value)
                : null;
            item.CostBasis = complete
                ? InventoryCostBasis.SpecificIdentification
                : InventoryCostBasis.Unavailable;
            item.CostSnapshotAt = snapshotAt;
        }
    }
}
