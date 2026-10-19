using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using System.Text.Json;

namespace MyPetLink.Api.Services;

public sealed partial class ConsignmentService
{
    public static string BranchDestination(MerchantBranch b) => string.Join(", ",
        new[] { b.Name,b.AddressLine1,b.AddressLine2,b.Postcode,b.City,b.State,b.Country }
            .Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!.Trim()));

    private static void RequireInspectedCommercial(SmartTag tag)
    {
        if (tag.QaStatus != PhysicalQaStatus.Passed || tag.StockPurpose != SmartTagStockPurpose.Sale)
            throw Conflict("A selected unit has not passed inspection or is not commercial stock. Review its inspection before continuing.");
    }

    private async Task<bool> ReceiptIsSelfReview(ConsignmentDispatch d,Guid admin,CancellationToken ct)
    {
        var dispatcher = d.DispatchedByAdminUserId ?? await db.ConsignmentMovements
            .Where(m => m.DispatchId == d.Id && m.Action == "dispatched").Select(m => (Guid?)m.ActorAdminUserId).FirstOrDefaultAsync(ct);
        if (dispatcher is null)
            throw new ApiException(403,"independent_receipt_required","The original dispatch actor must be established before recording receipt evidence.");
        return dispatcher == admin;
    }

    private async Task RecordHandover(ConsignmentDispatch d,ConsignmentUnit u,string action,ConsignmentActionRequest r,Guid admin,CancellationToken ct)
    {
        if (action == "external-handover" && u.ReceivingState != ConsignmentReceivingState.Good)
            throw Conflict("Confirm this unit as received in good condition before recording its customer handover.");
        var h = r.Handover;
        if (h is null || string.IsNullOrWhiteSpace(h.EventReference) || h.EventReference.Trim().Length > 150
            || h.EventAt == default || h.EventAt < d.DispatchedAt || h.EventAt > time.GetUtcNow().AddMinutes(2)
            || h.DiscountDescription?.Length > 1000)
            throw Bad("Record a unique external entry reference and actual event date. Do not enter customer personal details.");
        var reversal = action == "reverse-handover";
        if (action == "external-handover")
        {
            if (u.Status is not (ConsignmentUnitStatus.Dispatched or ConsignmentUnitStatus.Received) || h.SupersedesRecordId != null)
                throw Conflict("Only partner-held units can have a new customer handover.");
        }
        else if (u.Status != ConsignmentUnitStatus.ExternalHandover || u.CurrentHandoverRecordId != h.SupersedesRecordId)
            throw Conflict("Select the current handover record for correction or reversal. Original evidence is retained.");
        // On a branch with SKU stock tracking, sales arrive through sales reports. An identified
        // handover only says which bucket this known unit leaves, so it can never count a sale twice.
        var tracked = await UnitTrackedAsync(u.Id,ct);
        ConsignmentHandoverAttribution? attribution = null;
        if (tracked && !reversal)
        {
            if (h.IsReportedSale)
                throw Bad("This partner reports sales by SKU. Record sale prices in a sales report; an identified handover carries no price.");
            if (action == "external-handover")
                attribution = h.Attribution switch {
                    nameof(ConsignmentHandoverAttribution.AggregateSale) => ConsignmentHandoverAttribution.AggregateSale,
                    nameof(ConsignmentHandoverAttribution.NonSaleWithdrawal) => ConsignmentHandoverAttribution.NonSaleWithdrawal,
                    _ => throw Bad("Say whether this identified tag is one of the partner's reported sales or a non-sale withdrawal."),
                };
            else
            {
                attribution = d.HandoverRecords.SingleOrDefault(x => x.Id == u.CurrentHandoverRecordId)?.Attribution;
                if (h.Attribution is not null && h.Attribution != attribution?.ToString())
                    throw Bad("A correction keeps the original attribution. Reverse the handover and record it again to change it.");
            }
        }
        else if (!tracked && h.Attribution is not null)
            throw Bad("Start stock tracking for this partner branch before attributing an identified handover.");
        if (h.IsReportedSale && !reversal)
        {
            if (h.SellingPrice is null or < 0 or > 999999.99m || h.DiscountAmount is null or < 0 or > 999999.99m
                || decimal.Round(h.SellingPrice.Value,2) != h.SellingPrice || decimal.Round(h.DiscountAmount.Value,2) != h.DiscountAmount
                || h.DiscountAmount > 0 && string.IsNullOrWhiteSpace(h.DiscountDescription))
                throw Bad("Enter the actual MYR price and discount from 0 to 999,999.99, with at most two decimal places and an explanation of any discount.");
        }
        else if (h.IsReportedSale || h.SellingPrice != null || h.DiscountAmount != null || !string.IsNullOrWhiteSpace(h.DiscountDescription))
            throw Bad("A custody-only handover or reversal must not carry sale amounts.");
        var reference = h.EventReference.Trim().ToUpperInvariant();
        if (await db.ConsignmentHandoverRecords.AnyAsync(x => x.MerchantId == d.Agreement.MerchantId && x.EventReference == reference,ct))
            throw Conflict("This merchant already has that external entry reference. Use the original record or an explicit correction with a new reference.");
        var row = new ConsignmentHandoverRecord {
            MerchantId=d.Agreement.MerchantId,AgreementId=d.AgreementId,DispatchId=d.Id,UnitId=u.Id,ActorAdminUserId=admin,
            EventReference=reference,Kind=reversal ? "Reversal" : action == "correct-handover" ? "Correction" : "Handover",
            SupersedesRecordId=h.SupersedesRecordId,EventAt=h.EventAt.ToUniversalTime(),RecordedAt=time.GetUtcNow(),
            IsReportedSale=h.IsReportedSale,SellingPrice=h.SellingPrice,DiscountAmount=h.DiscountAmount,
            DiscountDescription=Trim(h.DiscountDescription),EvidenceReference=r.Reference.Trim(),Attribution=attribution };
        d.HandoverRecords.Add(row);db.ConsignmentHandoverRecords.Add(row);
        if (tracked && action == "external-handover") await PostIdentifiedHandoverAsync(d,u,row,attribution!.Value,admin,ct);
        else if (tracked && reversal) await ReverseIdentifiedHandoverAsync(d,u,admin,ct);
        u.CurrentHandoverRecordId = reversal ? null : row.Id;
        u.Status = reversal ? ConsignmentUnitStatus.Received
            : ConsignmentUnitStatus.ExternalHandover;
    }

    private static ConsignmentHandoverResponse MapHandover(ConsignmentHandoverRecord h) => new(h.Id,h.UnitId,h.ActorAdminUserId,
        h.EventReference,h.Kind,h.EventAt,h.RecordedAt,h.IsReportedSale,h.SellingPrice,h.DiscountAmount,h.DiscountDescription,
        h.EvidenceReference,h.SupersedesRecordId,Attribution:h.Attribution?.ToString());
}
