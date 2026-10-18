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
// same finite stock. Cancelled orders release their outstanding reservation,
// and an order that has shipped holds nothing any more.
//
// Available units = orderable units (SellableInventoryRules.OrderableUnit:
// received commercial stock, enrolled for physical QA and not failed, on the
// shelf) minus outstanding reservations. The public catalogue's inStock, the
// delivery quote and checkout all read this one number, so a SKU is advertised
// exactly when a checkout for it can succeed. Fulfilment is separate: a paid
// order is assigned only an inspected, Passed tag.
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
        var available = await GetAvailableUnitsAsync([productVariantId], cancellationToken);
        return available[productVariantId];
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

        var sellable = await _dbContext.SmartTags
            .Where(SellableInventoryRules.OrderableUnit(_dbContext))
            .Where(tag => tag.ProductVariantId != null && ids.Contains(tag.ProductVariantId.Value))
            .GroupBy(tag => tag.ProductVariantId!.Value)
            .Select(group => new { VariantId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.VariantId, row => row.Count, cancellationToken);

        var outstanding = await GetOutstandingReservationsAsync(_dbContext, ids, cancellationToken);

        return ids.ToDictionary(
            id => id,
            id => Math.Max(0, sellable.GetValueOrDefault(id) - outstanding.GetValueOrDefault(id)));
    }

    /// <summary>
    /// Units promised by open orders that no assigned tag fulfils yet, per SKU.
    /// The single reservation definition: availability and the physical QA
    /// enrollment preview both read it.
    /// </summary>
    public static async Task<IReadOnlyDictionary<Guid, int>> GetOutstandingReservationsAsync(
        MyPetLinkDbContext dbContext,
        IReadOnlyCollection<Guid> productVariantIds,
        CancellationToken cancellationToken,
        bool requirePassedAssignments = false)
    {
        var ids = productVariantIds.Distinct().ToArray();
        var reservations = await dbContext.TagOrderItems
            .Where(SellableInventoryRules.ItemHoldsReservation)
            .Where(item => item.ProductVariantId != null && ids.Contains(item.ProductVariantId.Value))
            .Select(item => new
            {
                VariantId = item.ProductVariantId!.Value,
                item.Quantity,
                Assigned = item.AssignedTags.Count(tag =>
                    tag.ArchivedAt == null
                    && tag.DeletedAt == null
                    && (!requirePassedAssignments || tag.QaStatus == PhysicalQaStatus.Passed)
                    && (tag.Status == SmartTagStatus.Pending
                        || tag.Status == SmartTagStatus.Preparing
                        || tag.Status == SmartTagStatus.Delivered
                        || tag.Status == SmartTagStatus.Active))
            })
            .ToListAsync(cancellationToken);

        return reservations
            .GroupBy(row => row.VariantId)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(row => Math.Max(0, row.Quantity - row.Assigned)));
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
