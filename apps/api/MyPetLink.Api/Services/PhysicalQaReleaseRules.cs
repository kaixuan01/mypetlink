using System.Linq.Expressions;
using MyPetLink.Api.Common;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// May a tag that is already issued, or already committed to a customer, keep
/// being used? This is the historical-compatibility rule; it is NOT the rule
/// for new sales. New commitments — catalogue stock, checkout, order
/// assignment, merchant allocation, outbound shipment, first hand-over to an
/// owner — require physical QA Passed: see <see cref="SellableInventoryRules"/>.
///
/// <c>QaStatus</c> is NULL for a tag outside the physical QA cohort: stock that
/// existed before physical QA and was never enrolled from a shipment manifest.
/// A NULL tag already in a customer's hands keeps the behaviour it had:
/// activation of an assigned tag, pet reassignment and transfer. Shipping is
/// not one of these: a tag still in our warehouse leaves it only once it has
/// passed inspection (<see cref="SellableInventoryRules.RequirePassedForFulfilment"/>),
/// even if it was committed to an order before the new-sale rule existed.
/// Pending, Failed and Needs Review are always held.
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

    public static void RequireReleased(IEnumerable<SmartTag> tags)
    {
        var blocked = tags.FirstOrDefault(tag => !IsReleased(tag));
        if (blocked is not null)
            throw new ApiException(409, "physical_qa_required",
                $"Tag {blocked.TagCode} has not passed physical inspection. Choose a passed tag before proceeding.");
    }
}
