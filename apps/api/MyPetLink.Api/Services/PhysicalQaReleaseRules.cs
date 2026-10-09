using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// The single definition of "this physical tag may leave our hands".
///
/// <c>QaStatus</c> is NULL for a tag outside the physical QA cohort: stock that
/// existed before physical QA and was never enrolled from a shipment manifest.
/// Those tags keep exactly the behaviour they had before QA existed, so NULL is
/// released on purpose. Every enrolled or newly generated tag carries a status,
/// and only <see cref="PhysicalQaStatus.Passed"/> is released.
///
/// The rule is an expression so the same definition runs in SQL for stock
/// counts and eligibility, and in memory for a loaded tag. Never restate it
/// inline: compose <see cref="Released"/> or call <see cref="IsReleased"/>.
/// </summary>
public static class PhysicalQaReleaseRules
{
    public static readonly Expression<Func<SmartTag, bool>> Released =
        tag => tag.QaStatus == null || tag.QaStatus == PhysicalQaStatus.Passed;

    private static readonly Func<SmartTag, bool> ReleasedCompiled = Released.Compile();

    public static bool IsReleased(SmartTag tag) => ReleasedCompiled(tag);

    /// <summary>
    /// <paramref name="predicate"/> AND <see cref="Released"/>, as one
    /// SQL-translatable expression over the same parameter.
    /// </summary>
    public static Expression<Func<SmartTag, bool>> AndReleased(Expression<Func<SmartTag, bool>> predicate)
    {
        var parameter = predicate.Parameters[0];
        var released = new ParameterReplacer(Released.Parameters[0], parameter).Visit(Released.Body);
        return Expression.Lambda<Func<SmartTag, bool>>(Expression.AndAlso(predicate.Body, released), parameter);
    }

    public static async Task RequireMerchantQaStockAsync(MyPetLinkDbContext db,
        IEnumerable<MerchantQuotationItem> items, CancellationToken ct)
    {
        var stock = new TagOrderInventoryAvailabilityService(db);
        foreach (var group in items.GroupBy(i => i.ProductVariantId))
        {
            // Preserve commercial behavior of historical SKUs which have never
            // entered physical QA. Enrolled SKUs cannot count quarantined stock.
            if (await db.SmartTags.AnyAsync(t => t.ProductVariantId == group.Key && t.QaStatus != null, ct)
                && await stock.GetAvailableUnitsAsync(group.Key, ct) < group.Sum(i => i.Quantity))
                throw new ApiException(409, "physical_qa_stock_unavailable",
                    "There are not enough released tags for this quotation. Complete physical inspections or reduce the quantity.");
        }
    }

    public static void RequireReleased(IEnumerable<SmartTag> tags)
    {
        var blocked = tags.FirstOrDefault(tag => !IsReleased(tag));
        if (blocked is not null)
            throw new ApiException(409, "physical_qa_required",
                $"Tag {blocked.TagCode} has not passed physical inspection. Choose a passed tag before proceeding.");
    }

    private sealed class ParameterReplacer(ParameterExpression from, Expression to) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) =>
            node == from ? to : base.VisitParameter(node);
    }
}
