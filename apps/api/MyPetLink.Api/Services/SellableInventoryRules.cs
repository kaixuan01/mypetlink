using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The single definition of which physical tags a NEW commitment may consume,
/// and of which existing orders still hold stock.
///
/// Two questions used to share one rule (<see cref="PhysicalQaReleaseRules.Released"/>,
/// "QA NULL or Passed"). They are different questions:
///
/// - <b>May this unit be sold, assigned, allocated or sent out now?</b> Only a
///   unit that is commercial stock (<see cref="SmartTagStockPurpose.Sale"/>)
///   AND has passed physical inspection. The two are independent: a NULL QA
///   status means nobody has inspected the tag — it is historical stock, or a
///   shipment that was never enrolled — and is never treated as Passed; testing
///   samples and unclassified stock are never commercial stock, whatever their
///   QA result. Every new sale-side commitment (catalogue stock, delivery
///   quote, checkout, order assignment, change and replacement, merchant
///   allocation, outbound shipment) uses <see cref="SellableUnit"/>,
///   <see cref="RequireSellableForNewCommitment"/> or <see cref="IsCommercialStock"/>.
///   The first hand-over of a unit someone already holds (public retail
///   activation, Admin claim) depends on inspection only
///   (<see cref="MayBeHandedToOwnerAsync"/>), so internal testing keeps working.
///
/// - <b>May a tag that is already in, or promised to, a customer's hands keep
///   working?</b> Yes, for legacy NULL tags as well: activation of an assigned
///   tag, scanning, pet reassignment, transfer, and the fulfilment of
///   commitments made before this rule existed. Those stay on
///   <see cref="PhysicalQaReleaseRules"/>, which is now that rule only.
///
/// The predicates are expression trees so the same definition runs in SQL for
/// counts and in memory for a loaded tag. Never restate them inline.
/// </summary>
public static class SellableInventoryRules
{
    /// <summary>Physical inspection passed. NULL (never inspected) is not Passed.</summary>
    public static readonly Expression<Func<SmartTag, bool>> PassedPhysicalQa =
        tag => tag.QaStatus == PhysicalQaStatus.Passed;

    private static readonly Func<SmartTag, bool> PassedCompiled = PassedPhysicalQa.Compile();

    public static bool IsPassed(SmartTag tag) => PassedCompiled(tag);

    /// <summary>
    /// Commercial stock: classified for sale. Testing samples and unclassified
    /// (legacy, not yet reviewed) stock are never sold, whatever their QA status.
    /// </summary>
    public static readonly Expression<Func<SmartTag, bool>> CommercialStock =
        tag => tag.StockPurpose == SmartTagStockPurpose.Sale;

    private static readonly Func<SmartTag, bool> CommercialCompiled = CommercialStock.Compile();

    public static bool IsCommercialStock(SmartTag tag) => CommercialCompiled(tag);

    /// <summary>
    /// A unit sitting in our stock with nobody's claim on it: unclaimed, not
    /// archived or deleted, still generated or printed (not sent onward), with no
    /// owner, pet, retail order or live merchant allocation. Lost, Disabled,
    /// Replaced, Active and Archived are excluded by the Unclaimed test.
    /// </summary>
    public static Expression<Func<SmartTag, bool>> OnShelf(MyPetLinkDbContext dbContext) =>
        tag => tag.Status == SmartTagStatus.Unclaimed
            && tag.ArchivedAt == null
            && tag.DeletedAt == null
            && (tag.FulfilmentStatus == TagFulfilmentStatus.Generated
                || tag.FulfilmentStatus == TagFulfilmentStatus.Printed)
            && tag.OwnerUserId == null
            && tag.PetId == null
            && tag.OrderId == null
            && tag.OrderItemId == null
            && !dbContext.MerchantOrderAllocatedTags.Any(allocation =>
                allocation.SmartTagId == tag.Id && allocation.ReleasedAt == null);

    /// <summary>
    /// The unit a new sale, assignment, allocation or outbound shipment may
    /// consume: on the shelf AND passed physical inspection AND commercial stock.
    /// </summary>
    public static Expression<Func<SmartTag, bool>> SellableUnit(MyPetLinkDbContext dbContext) =>
        And(And(OnShelf(dbContext), PassedPhysicalQa), CommercialStock);

    /// <summary><see cref="SellableUnit"/> for one SKU.</summary>
    public static Expression<Func<SmartTag, bool>> SellableUnitOf(MyPetLinkDbContext dbContext, Guid productVariantId) =>
        And(SellableUnit(dbContext), tag => tag.ProductVariantId == productVariantId);

    /// <summary>
    /// Order items whose order still holds SKU-level stock: placed and not yet
    /// shipped. Shipped and Delivered orders have physically consumed their
    /// units, so what later happens to those tags (lost, disabled, archived,
    /// replaced) no longer reserves anything; Cancelled orders hold nothing.
    /// </summary>
    public static readonly Expression<Func<TagOrderItem, bool>> ItemHoldsReservation =
        item => item.Order.Status == OrderStatus.PendingPayment
            || item.Order.Status == OrderStatus.PaymentProofSubmitted
            || item.Order.Status == OrderStatus.PaymentConfirmed
            || item.Order.Status == OrderStatus.PreparingTag
            || item.Order.Status == OrderStatus.ReadyToShip;

    /// <summary>
    /// The fulfilment hold: a tag leaves our warehouse (retail ready to ship /
    /// shipped, merchant ready to ship / shipped) only once it has passed
    /// physical inspection — including a legacy (QA NULL) tag that was assigned
    /// or allocated before the new-sale rule existed. Nothing is cancelled,
    /// released or reassigned automatically; an admin resolves the hold by
    /// inspecting the tag (enroll it, then pass it) or by changing the assigned
    /// tag to one that passed.
    /// </summary>
    public static void RequirePassedForFulfilment(IEnumerable<SmartTag> tags)
    {
        var blocked = tags.FirstOrDefault(tag => !IsPassed(tag));
        if (blocked is null) return;

        throw new ApiException(409, "physical_qa_required", blocked.QaStatus is null
            ? $"Tag {blocked.TagCode} has not been physically inspected yet. Inspect it, or change the assigned tag to one that passed inspection, before it ships."
            : $"Tag {blocked.TagCode} has not passed physical inspection. Choose a passed tag before proceeding.");
    }

    public static void RequirePassedForNewCommitment(IEnumerable<SmartTag> tags)
    {
        var blocked = tags.FirstOrDefault(tag => !IsPassed(tag));
        if (blocked is not null)
        {
            throw new ApiException(409, "physical_qa_required",
                $"Tag {blocked.TagCode} has not passed physical inspection. Choose a passed tag before proceeding.");
        }
    }

    /// <summary>
    /// A unit committed to a customer order (assignment, change, replacement):
    /// passed inspection, then commercial stock. Inspection is checked first so
    /// an uninspected unit keeps its existing explanation.
    /// </summary>
    public static void RequireSellableForNewCommitment(IEnumerable<SmartTag> tags)
    {
        var list = tags as IReadOnlyCollection<SmartTag> ?? tags.ToArray();
        RequirePassedForNewCommitment(list);
        var blocked = list.FirstOrDefault(tag => !IsCommercialStock(tag));
        if (blocked is not null)
        {
            throw new ApiException(409, "stock_not_for_sale", NotForSaleMessage(blocked));
        }
    }

    /// <summary>Why this unit cannot be used for a sale, in operator wording.</summary>
    public static string NotForSaleMessage(SmartTag tag) => tag.StockPurpose == SmartTagStockPurpose.Test
        ? $"Tag {tag.TagCode} is a testing sample and is never used for a customer order. Choose commercial stock."
        : $"Tag {tag.TagCode} has not been classified as commercial stock. Choose commercial stock.";

    /// <summary>
    /// May this unlinked tag be handed to an owner for the first time (public
    /// retail activation, or an Admin claim on the owner's behalf)?
    ///
    /// A Passed tag may. A legacy NULL tag may only if trustworthy history
    /// recorded on THIS tag shows it already left our stock and reached a
    /// customer:
    ///
    /// - its own fulfilment trail says it was sent to a reseller or an owner, or
    ///   received by a reseller (set when this tag shipped, never moved back);
    /// - it was delivered to an owner;
    /// - this tag was shipped to a merchant (its own allocation row);
    /// - an owner activated this tag before (the activation audit entry for this
    ///   tag's id, which survives an Admin "return to unclaimed" that clears
    ///   ActivatedAt).
    ///
    /// Order-level history is deliberately not used: a tag can stay linked to an
    /// order item after another tag shipped in its place, so "its order shipped"
    /// does not prove this tag did. Scan history is not evidence either — anyone
    /// can scan a tag on a shelf — and neither is a bare Admin claim, which never
    /// moved the tag. A NULL tag with none of this history is uninspected
    /// warehouse stock. Pending, Failed and Needs Review never may.
    /// </summary>
    public static async Task<bool> MayBeHandedToOwnerAsync(
        MyPetLinkDbContext dbContext,
        SmartTag tag,
        CancellationToken cancellationToken)
    {
        if (IsPassed(tag)) return true;
        if (tag.QaStatus is not null) return false;

        // Issued through a reseller or straight to an owner, or delivered to one.
        if (tag.FulfilmentStatus is TagFulfilmentStatus.SentToReseller
                or TagFulfilmentStatus.Received
                or TagFulfilmentStatus.SentToOwner
            || tag.DeliveredAt.HasValue)
        {
            return true;
        }

        if (await dbContext.MerchantOrderAllocatedTags.AnyAsync(allocation =>
                allocation.SmartTagId == tag.Id
                && allocation.ReleasedAt == null
                && allocation.SentToMerchantAt != null,
                cancellationToken))
        {
            return true;
        }

        return await dbContext.AuditLogs.AnyAsync(entry =>
            entry.Entity == "SmartTag"
            && entry.EntityId == tag.Id
            && (entry.Action == OwnerActivatedRetailAuditAction
                || entry.Action == OwnerActivatedAssignedAuditAction),
            cancellationToken);
    }

    /// <summary>Audit actions written when an owner activates a tag (SmartTagService).</summary>
    public const string OwnerActivatedRetailAuditAction = "tag.activate-retail";
    public const string OwnerActivatedAssignedAuditAction = "tag.activate-assigned";

    private static Expression<Func<SmartTag, bool>> And(
        Expression<Func<SmartTag, bool>> left,
        Expression<Func<SmartTag, bool>> right)
    {
        var parameter = left.Parameters[0];
        var rightBody = new ParameterReplacer(right.Parameters[0], parameter).Visit(right.Body);
        return Expression.Lambda<Func<SmartTag, bool>>(Expression.AndAlso(left.Body, rightBody), parameter);
    }

    private sealed class ParameterReplacer(ParameterExpression from, Expression to) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) =>
            node == from ? to : base.VisitParameter(node);
    }
}
