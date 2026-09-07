using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The single definition of "this catalog SKU may be sold right now".
///
/// It is the same rule the public catalog already applies when deciding what a
/// pet owner is allowed to buy (<see cref="TagCatalogService.ListPublicAsync"/>
/// and <see cref="TagCatalogService.GetPublicAsync"/>): a published, unarchived
/// product holding an unarchived, active, purchasable SKU that carries the
/// capabilities MyPetLink still sells. Merchant Sales does not get its own idea
/// of "active" — a SKU the shop cannot sell is not a SKU a merchant can be
/// quoted for either.
///
/// This is a check for entering a NEW commercial commitment. It deliberately
/// says nothing about records that already exist: a quotation, order, invoice,
/// receipt or delivery order keeps its own snapshots and stays readable long
/// after the SKU behind it is archived.
/// </summary>
public static class TagCatalogSellability
{
    /// <summary>
    /// The QR + NFC Smart Tag is the only physical tag MyPetLink sells, so a
    /// SKU has to support both scanning and tapping. QR-only SKUs produced
    /// before that decision stay in the catalog for historical inventory and
    /// order records, but can never be sold again.
    /// </summary>
    public static bool HasSellableCapabilities(TagProductVariant variant) =>
        variant.SupportsQr && variant.SupportsNfc;

    /// <summary>
    /// Requires <see cref="TagProductVariant.TagProduct"/> to be loaded. A
    /// missing product fails closed rather than assuming the SKU is sellable.
    /// </summary>
    public static bool IsSellable(TagProductVariant variant) =>
        variant.ArchivedAt is null
        && variant.IsActive
        && variant.IsPurchasable
        && HasSellableCapabilities(variant)
        && variant.TagProduct is { IsPublished: true, IsArchived: false };
}
