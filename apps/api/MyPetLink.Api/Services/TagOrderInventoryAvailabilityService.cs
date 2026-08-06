using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface ITagOrderInventoryAvailabilityService
{
    Task<int> GetAvailableUnitsAsync(Guid productVariantId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Batch form of <see cref="GetAvailableUnitsAsync(Guid, CancellationToken)"/>.
    /// The catalog uses this so browsing a product list stays two queries
    /// instead of one per SKU.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, int>> GetAvailableUnitsAsync(
        IReadOnlyCollection<Guid> productVariantIds,
        CancellationToken cancellationToken = default);
    Task EnsureAvailableAsync(
        IReadOnlyDictionary<Guid, int> requestedUnits,
        CancellationToken cancellationToken = default);
}

// Order items double as SKU-level reservations until individual inventory tags
// are assigned. This keeps public Tag Codes undisclosed during checkout while
// preventing two concurrent unpaid/paid orders from silently overselling the
// same finite stock. Cancelled orders release their outstanding reservation.
public sealed class TagOrderInventoryAvailabilityService : ITagOrderInventoryAvailabilityService
{
    private readonly MyPetLinkDbContext _dbContext;

    public TagOrderInventoryAvailabilityService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<int> GetAvailableUnitsAsync(
        Guid productVariantId,
        CancellationToken cancellationToken = default)
    {
        var unclaimed = await _dbContext.SmartTags.CountAsync(tag =>
            tag.ProductVariantId == productVariantId
            && tag.Status == SmartTagStatus.Unclaimed
            && tag.ArchivedAt == null
            && tag.DeletedAt == null
            && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
            && tag.OwnerUserId == null
            && tag.PetId == null
            && tag.OrderId == null
            && tag.OrderItemId == null
            // A tag held for a merchant order is no longer retail stock.
            && !_dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null),
            cancellationToken);

        var reserved = await _dbContext.TagOrderItems
            .Where(item =>
                item.ProductVariantId == productVariantId
                && item.Order.Status != OrderStatus.Cancelled)
            .Select(item => new
            {
                item.Quantity,
                Assigned = item.AssignedTags.Count(tag =>
                    tag.ArchivedAt == null
                    && tag.DeletedAt == null
                    && (tag.Status == SmartTagStatus.Pending
                        || tag.Status == SmartTagStatus.Preparing
                        || tag.Status == SmartTagStatus.Delivered
                        || tag.Status == SmartTagStatus.Active))
            })
            .ToListAsync(cancellationToken);

        var outstanding = reserved.Sum(item => Math.Max(0, item.Quantity - item.Assigned));
        return Math.Max(0, unclaimed - outstanding);
    }

    public async Task<IReadOnlyDictionary<Guid, int>> GetAvailableUnitsAsync(
        IReadOnlyCollection<Guid> productVariantIds,
        CancellationToken cancellationToken = default)
    {
        if (productVariantIds.Count == 0)
        {
            return new Dictionary<Guid, int>();
        }

        var ids = productVariantIds.Distinct().ToArray();

        var unclaimed = await _dbContext.SmartTags
            .Where(tag =>
                tag.ProductVariantId != null
                && ids.Contains(tag.ProductVariantId.Value)
                && tag.Status == SmartTagStatus.Unclaimed
                && tag.ArchivedAt == null
                && tag.DeletedAt == null
                && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                    || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
                && tag.OwnerUserId == null
                && tag.PetId == null
                && tag.OrderId == null
                && tag.OrderItemId == null
                // A tag held for a merchant order is no longer retail stock.
                && !_dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                    allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null))
            .GroupBy(tag => tag.ProductVariantId!.Value)
            .Select(group => new { VariantId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.VariantId, row => row.Count, cancellationToken);

        var reservations = await _dbContext.TagOrderItems
            .Where(item =>
                item.ProductVariantId != null
                && ids.Contains(item.ProductVariantId.Value)
                && item.Order.Status != OrderStatus.Cancelled)
            .Select(item => new
            {
                VariantId = item.ProductVariantId!.Value,
                item.Quantity,
                Assigned = item.AssignedTags.Count(tag =>
                    tag.ArchivedAt == null
                    && tag.DeletedAt == null
                    && (tag.Status == SmartTagStatus.Pending
                        || tag.Status == SmartTagStatus.Preparing
                        || tag.Status == SmartTagStatus.Delivered
                        || tag.Status == SmartTagStatus.Active))
            })
            .ToListAsync(cancellationToken);

        var outstanding = reservations
            .GroupBy(row => row.VariantId)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(row => Math.Max(0, row.Quantity - row.Assigned)));

        return ids.ToDictionary(
            id => id,
            id => Math.Max(0, unclaimed.GetValueOrDefault(id) - outstanding.GetValueOrDefault(id)));
    }

    public async Task EnsureAvailableAsync(
        IReadOnlyDictionary<Guid, int> requestedUnits,
        CancellationToken cancellationToken = default)
    {
        foreach (var (productVariantId, requested) in requestedUnits)
        {
            if (requested < 1 || await GetAvailableUnitsAsync(productVariantId, cancellationToken) < requested)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "out_of_stock",
                    "There is not enough available inventory for one or more tag options in this order.");
            }
        }
    }
}
