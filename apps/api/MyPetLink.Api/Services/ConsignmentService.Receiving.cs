using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed partial class ConsignmentService
{
    private static ConsignmentReceiptEvidence NormalizeReceipt(ConsignmentReceiptEvidence e) => e with {
        Recipient=e.Recipient.Trim(), SignedEvidenceReference=e.SignedEvidenceReference.Trim(),
        ReceivedAt=e.ReceivedAt.ToUniversalTime(),
        GoodUnitIds=e.GoodUnitIds?.Order().ToArray(), DamagedUnitIds=e.DamagedUnitIds?.Order().ToArray(),
        MissingUnitIds=e.MissingUnitIds?.Order().ToArray(), ReturnedUnitIds=e.ReturnedUnitIds?.Order().ToArray()
    };

    private async Task<bool> IsReceivingReplay(ConsignmentDispatch d, ConsignmentActionRequest r,
        string action, Guid admin, CancellationToken ct)
    {
        var previous = await db.ConsignmentMovements.AsNoTracking().Where(m => m.DispatchId == d.Id
            && m.Action == action && m.Reference == r.Reference.Trim()).Select(m => new {m.ActorAdminUserId,m.EvidenceJson}).ToListAsync(ct);
        if (previous.Count == 0) return false;
        if (r.Receipt is { Recipient: not null, SignedEvidenceReference: not null } e
            && previous.Any(m => m.ActorAdminUserId == admin && m.EvidenceJson == JsonSerializer.Serialize(NormalizeReceipt(e))))
        {
            var review=await db.ConsignmentReviewEvents.AsNoTracking().Where(x=>x.DispatchId==d.Id && x.Action==action
                && x.RequestReference==r.Reference.Trim() && x.ActorAdminUserId==admin).SingleOrDefaultAsync(ct);
            if(review?.ReviewMode!="Self-reviewed (Solo)" || r.SelfReview is {Confirmed:true} s
                && s.Reason?.Trim()==review.Reason && s.ExternalEvidenceReference?.Trim()==review.ExternalEvidenceReference) return true;
        }
        throw Conflict("This receiving reference was already used. Review its recorded evidence and use a new reference for a new event.");
    }

    private async Task RecordReceiving(ConsignmentDispatch d, string action, ConsignmentActionRequest r,
        Guid admin, CancellationToken ct)
    {
        if (d.Status is not (ConsignmentDispatchStatus.Dispatched or ConsignmentDispatchStatus.Received))
            throw Conflict("Only dispatched stock can have receiving evidence.");
        var self = await ReceiptIsSelfReview(d,admin,ct);
        var e = r.Receipt;
        if (e is null || string.IsNullOrWhiteSpace(e.Recipient) || e.Recipient.Length > 200
            || string.IsNullOrWhiteSpace(e.SignedEvidenceReference) || e.SignedEvidenceReference.Trim().Length < 5 || e.SignedEvidenceReference.Length > 1000
            || e.Quantity < 0 || e.DamagedQuantity < 0 || e.MissingQuantity < 0 || e.DamagedQuantity > e.Quantity
            || e.Quantity > d.Units.Count || e.MissingQuantity > d.Units.Count
            || e.ReceivedAt == default || e.ReceivedAt < d.DispatchedAt || e.ReceivedAt > time.GetUtcNow().AddMinutes(2))
            throw Bad("Record the actual recipient, date, counted quantity and signed evidence reference. Counted units include damaged units.");
        e = NormalizeReceipt(e);
        var resolving = action == "resolve-discrepancy";
        // The full, undamaged first receipt remains compatible with older clients.
        // Partial receipts and every resolution explicitly identify their units.
        var explicitUnits = e.GoodUnitIds != null || e.DamagedUnitIds != null || e.MissingUnitIds != null || e.ReturnedUnitIds != null;
        if (!explicitUnits && (resolving || e.DamagedQuantity != 0 || e.MissingQuantity != 0))
            throw Bad("Identify each good, damaged, missing or physically returned unit before recording these findings.");
        var good = e.GoodUnitIds?.ToArray() ?? (!explicitUnits
            ? d.Units.Where(u => u.Status == ConsignmentUnitStatus.Dispatched && u.ReceivingState == ConsignmentReceivingState.Unconfirmed).Select(u => u.Id).ToArray() : []);
        var damaged = e.DamagedUnitIds?.ToArray() ?? [];
        var missing = e.MissingUnitIds?.ToArray() ?? [];
        var returned = e.ReturnedUnitIds?.ToArray() ?? [];
        var ids = good.Concat(damaged).Concat(missing).Concat(returned).ToArray();
        if (ids.Length == 0 || ids.Length != ids.Distinct().Count() || ids.Any(id => d.Units.All(u => u.Id != id))
            || good.Length + damaged.Length != e.Quantity || damaged.Length != e.DamagedQuantity || missing.Length != e.MissingQuantity
            || !resolving && returned.Length != 0)
            throw Bad("Match the actual counts to distinct units in this delivery. Returned units are separate from units counted at the partner.");
        if (action == "record-discrepancy" && damaged.Length + missing.Length == 0)
            throw Bad("Identify the actual missing or damaged units.");
        if(resolving)
        {
            var affected=d.Units.Where(u=>ids.Contains(u.Id)).ToArray();
            if(affected.Any(u=>u.DiscrepancyRecordedByAdminUserId is null))
                throw new ApiException(403,"independent_discrepancy_review_required","The original issue recorder must be established before review.");
            self |= affected.Any(u=>u.DiscrepancyRecordedByAdminUserId==admin);
        }
        var review=await Review(admin,self,action,r,d.AgreementId,d.Id,ct);
        if(self)
        {
            if(!string.Equals(r.SelfReview!.ExternalEvidenceReference.Trim(),e.SignedEvidenceReference,StringComparison.OrdinalIgnoreCase))
                throw Bad("Self-review must reference the same genuine partner acknowledgment or supporting evidence as this receiving event.");
            if(resolving)
            {
                var earlier=await db.ConsignmentMovements.AsNoTracking().Where(m=>m.DispatchId==d.Id
                    && (m.Action=="receive" || m.Action=="record-discrepancy" || m.Action=="resolve-discrepancy") && m.EvidenceJson!=null)
                    .Select(m=>m.EvidenceJson!).ToListAsync(ct);
                foreach(var json in earlier)
                {
                    using var doc=JsonDocument.Parse(json);
                    if(doc.RootElement.TryGetProperty("SignedEvidenceReference",out var reference)
                        && string.Equals(reference.GetString()?.Trim(),e.SignedEvidenceReference,StringComparison.OrdinalIgnoreCase))
                        throw Bad("A self-reviewed discrepancy resolution needs new supporting evidence, different from the earlier findings.");
                }
            }
        }
        foreach (var u in d.Units.Where(u => ids.Contains(u.Id)))
        {
            if (resolving)
            {
                if (u.ReceivingState is not (ConsignmentReceivingState.Missing or ConsignmentReceivingState.Damaged or ConsignmentReceivingState.ReviewRequired))
                    throw Conflict("Select only units with an unresolved receiving discrepancy.");

            }
            else if (u.Status != ConsignmentUnitStatus.Dispatched || u.ReceivingState != ConsignmentReceivingState.Unconfirmed)
                throw Conflict("This unit already has receiving evidence. Review the original event or resolve its discrepancy.");

            var next = returned.Contains(u.Id) ? ConsignmentReceivingState.Returned : good.Contains(u.Id)
                ? ConsignmentReceivingState.Good : damaged.Contains(u.Id) ? ConsignmentReceivingState.Damaged : ConsignmentReceivingState.Missing;
            if (next is ConsignmentReceivingState.Damaged or ConsignmentReceivingState.Missing
                && (u.SmartTag.OwnerUserId != null || u.SmartTag.PetId != null || u.SmartTag.ActivatedAt != null))
                throw Conflict("This unit is already linked to a pet. Review its existing handover before recording missing or damaged stock.");
            if (next == ConsignmentReceivingState.Returned)
            {
                if (u.Status is not (ConsignmentUnitStatus.ReturnedQuarantine or ConsignmentUnitStatus.Released or ConsignmentUnitStatus.WrittenOff))
                    throw Conflict("A return outcome requires an actual physical return already recorded for that unit.");
            }
            else if (u.Status != ConsignmentUnitStatus.Dispatched)
                throw Conflict("A unit already returned or handed over cannot be counted at the partner.");
            if (resolving && u.ReceivingState == next)
                throw Conflict("Record a changed, evidenced outcome. An unresolved shortage stays under investigation.");
            u.ReceivingState = next;
            u.DiscrepancyRecordedByAdminUserId = next is ConsignmentReceivingState.Damaged or ConsignmentReceivingState.Missing ? admin : null;
            if (next == ConsignmentReceivingState.Good) u.Status = ConsignmentUnitStatus.Received;
            u.SmartTag.AssignmentVersion++;
            Movement(d,u,"receiving-unit",r.Reference.Trim(),admin,JsonSerializer.Serialize(new {ReceivingState=next.ToString()}),review.ReviewMode);
        }
        var legacyUnclassifiedHold = d.HasOpenDiscrepancy && d.Units.Any(u => u.ReceivingState == ConsignmentReceivingState.Unconfirmed);
        d.HasOpenDiscrepancy = legacyUnclassifiedHold || d.Units.Any(u => u.ReceivingState is ConsignmentReceivingState.Damaged or ConsignmentReceivingState.Missing or ConsignmentReceivingState.ReviewRequired);
        d.Status = !d.HasOpenDiscrepancy && d.Units.All(u => u.ReceivingState is ConsignmentReceivingState.Good or ConsignmentReceivingState.Returned
            || u.Status is ConsignmentUnitStatus.ReturnedQuarantine or ConsignmentUnitStatus.Released or ConsignmentUnitStatus.WrittenOff)
            ? ConsignmentDispatchStatus.Received : ConsignmentDispatchStatus.Dispatched;
        // Keep the latest actual partner receipt, including damaged units.
        // A zero-count return review belongs in history, not in partner receipt fields.
        if (e.Quantity > 0)
        {
            d.ReceivedAt=time.GetUtcNow(); d.ReceiptAcknowledgment=e.SignedEvidenceReference;
            d.RecipientName=e.Recipient; d.PartnerReceivedAt=e.ReceivedAt; d.ReceivedByAdminUserId=admin;
            d.ReceivedQuantity=e.Quantity;
        }
        Movement(d,null,action,r.Reference.Trim(),admin,JsonSerializer.Serialize(e),review.ReviewMode);
    }
}
