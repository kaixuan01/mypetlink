using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public static class InventoryCustodyRules
{
    // Caller holds the SKU lock. Only selected units that count in the retail
    // pool reduce it; historical unreceived wholesale stock cannot consume a
    // reservation against different received stock.
    public static async Task ProtectRetailReservationsAsync(MyPetLinkDbContext db,
        IReadOnlyCollection<SmartTag> selected, CancellationToken ct)
    {
        var ids = selected.Select(x => x.Id).ToArray();
        var selectedOrderable = await db.SmartTags.Where(SellableInventoryRules.OrderableUnit(db))
            .Where(t => ids.Contains(t.Id)).Select(t => t.ProductVariantId).ToListAsync(ct);
        var availability = new TagOrderInventoryAvailabilityService(db);
        foreach (var group in selectedOrderable.Where(x => x.HasValue).GroupBy(x => x!.Value))
        {
            if (await availability.GetAvailableUnitsAsync(group.Key, ct) < group.Count())
                throw new ApiException(409, "inventory_reserved", "These units are reserved for existing customer orders. Choose other stock.");
            var selectedPassed = await db.SmartTags.Where(SellableInventoryRules.OrderableUnitOf(db, group.Key))
                .CountAsync(t => ids.Contains(t.Id) && t.QaStatus == PhysicalQaStatus.Passed, ct);
            if (selectedPassed == 0) continue;
            var passed = await db.SmartTags.Where(SellableInventoryRules.OrderableUnitOf(db, group.Key))
                .CountAsync(t => t.QaStatus == PhysicalQaStatus.Passed, ct);
            var committed = await TagOrderInventoryAvailabilityService.GetOutstandingReservationsAsync(db, [group.Key], ct,
                requirePassedAssignments: true);
            if (passed - selectedPassed < committed.GetValueOrDefault(group.Key))
                throw new ApiException(409, "inspected_inventory_reserved",
                    "Inspected tags are needed for existing customer orders. Inspect more stock before allocating these units.");
        }
    }

    public static async Task RequireNoCustodyMutationAsync(MyPetLinkDbContext db, Guid tagId, CancellationToken ct)
    {
        if (await db.MerchantOrderAllocatedTags.AnyAsync(a => a.SmartTagId == tagId && a.ReleasedAt == null && a.SentToMerchantAt == null, ct)
            || await db.ConsignmentUnits.AnyAsync(a => a.SmartTagId == tagId && a.ReleasedAt == null
                && a.Status != ConsignmentUnitStatus.ExternalHandover, ct))
            throw new ApiException(409, "inventory_in_custody", "This tag is held for a business delivery. Use its allocation or return process first.");
    }

    public static async Task RequireNotConsignedAsync(MyPetLinkDbContext db, Guid tagId, CancellationToken ct)
    {
        if (await db.ConsignmentUnits.AnyAsync(a => a.SmartTagId == tagId && a.ReleasedAt == null, ct))
            throw new ApiException(409, "inventory_in_custody", "This tag is held on consignment and cannot be assigned to another order.");
    }

    public static void RequireMerchantDispatchable(IEnumerable<SmartTag> tags)
    {
        var list = tags.ToArray();
        SellableInventoryRules.RequirePassedForFulfilment(list);
        if (list.Any(t => t.DeletedAt != null || t.ArchivedAt != null
            || t.Status is SmartTagStatus.Archived or SmartTagStatus.Disabled or SmartTagStatus.Replaced or SmartTagStatus.Lost
            || t.OrderId != null || t.OrderItemId != null))
            throw new ApiException(409, "inventory_not_eligible", "An allocated tag is no longer eligible for dispatch. Review its allocation first.");
        // Public activation of a merchant unit before dispatch is an existing,
        // supported handover; it is never treated as sale evidence here.
    }
}
