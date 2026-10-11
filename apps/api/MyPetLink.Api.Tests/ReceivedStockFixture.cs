using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Stock receipts for test inventory. A tag is orderable only once it was
/// physically received (it has a stock receipt), so fixtures that seed stock a
/// customer can order link it to a receipt with these helpers.
/// </summary>
internal static class ReceivedStockFixture
{
    /// <summary>A receipt for one SKU, recorded by the given administrator.</summary>
    public static InventoryReceipt Receipt(TagProductVariant variant, AdminUser admin) => new()
    {
        ReceiptNumber = $"MPL-STK-TEST-{Guid.NewGuid():N}"[..32],
        TagProductVariant = variant,
        QuantityReceived = 1,
        ReceivedAt = DateTimeOffset.UtcNow,
        PurchaseCurrency = "MYR",
        ExchangeRateToMyr = 1m,
        CostMode = InventoryReceiptCostMode.Simple,
        TotalLandedCostMyr = 3.17m,
        UnitLandedCostMyr = 3.17m,
        CreatedByAdminUser = admin,
    };

    /// <summary>
    /// A receipt for one SKU, recorded by an administrator the fixture already
    /// has, or by a dedicated stock administrator when it has none.
    /// </summary>
    public static InventoryReceipt Receipt(MyPetLinkDbContext db, Guid productVariantId)
    {
        var admin = db.AdminUsers.Local.FirstOrDefault() ?? db.AdminUsers.FirstOrDefault() ?? NewAdmin(db);
        var receipt = new InventoryReceipt
        {
            ReceiptNumber = $"MPL-STK-TEST-{Guid.NewGuid():N}"[..32],
            TagProductVariantId = productVariantId,
            QuantityReceived = 1,
            ReceivedAt = DateTimeOffset.UtcNow,
            PurchaseCurrency = "MYR",
            ExchangeRateToMyr = 1m,
            CostMode = InventoryReceiptCostMode.Simple,
            TotalLandedCostMyr = 3.17m,
            UnitLandedCostMyr = 3.17m,
            CreatedByAdminUser = admin,
        };
        db.InventoryReceipts.Add(receipt);
        return receipt;
    }

    /// <summary>Links every tag of the SKU that has no receipt yet to a new receipt.</summary>
    public static async Task ReceiveAllAsync(MyPetLinkDbContext db, Guid productVariantId)
    {
        var receipt = Receipt(db, productVariantId);
        foreach (var tag in await db.SmartTags.Where(t => t.ProductVariantId == productVariantId && t.InventoryReceiptId == null).ToListAsync())
            tag.InventoryReceipt = receipt;
        await db.SaveChangesAsync();
    }

    private static AdminUser NewAdmin(MyPetLinkDbContext db)
    {
        var id = Guid.NewGuid();
        var user = new User
        {
            Id = id, Email = $"stock.{id:N}@example.com", NormalizedEmail = $"STOCK.{id:N}@EXAMPLE.COM",
            DisplayName = "Stock Admin", Status = UserStatus.Active,
            AdminUser = new AdminUser { UserId = id, Role = AdminRole.Admin, IsActive = true },
        };
        db.Users.Add(user);
        return user.AdminUser;
    }
}
