using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

internal static class TagDtoMapper
{
    public static SmartTagResponse ToSmartTagResponse(SmartTag tag)
    {
        return new SmartTagResponse(
            tag.Id,
            tag.TagCode,
            tag.PetId,
            tag.OwnerUserId,
            tag.OrderId,
            tag.Order?.OrderNumber,
            tag.Pet?.Name,
            tag.Batch?.BatchNo,
            tag.HasNfc,
            tag.Shape,
            tag.Status,
            tag.CreatedAt,
            tag.UpdatedAt,
            tag.ActivatedAt,
            tag.DeliveredAt,
            tag.LastScannedAt,
            tag.ReplacementForTagId,
            tag.ArchivedAt);
    }

    public static TagOrderResponse ToOrderResponse(TagOrder order)
    {
        var proofs = order.PaymentProofs
            .OrderByDescending(proof => proof.UploadedAt)
            .ThenByDescending(proof => proof.CreatedAt)
            .Select(ToPaymentProofResponse)
            .ToArray();
        var latestProof = proofs.FirstOrDefault();

        return new TagOrderResponse(
            order.Id,
            order.OrderNumber,
            order.OwnerUserId,
            order.PetId,
            order.Pet?.Name,
            order.SmartTagId,
            order.SmartTag?.TagCode,
            order.TagType,
            order.Shape,
            order.Amount,
            order.Currency,
            order.DeliveryFee,
            order.Status,
            order.PaymentStatus,
            order.ReplacementForTagId,
            new DeliveryDetailsResponse(
                order.RecipientName,
                order.DeliveryPhoneE164,
                order.AddressLine1,
                order.AddressLine2,
                order.Postcode,
                order.City,
                order.State,
                order.DeliveryNotes),
            latestProof?.UploadedAt,
            order.PaymentConfirmedAt,
            latestProof?.PaymentMethod ?? "QR Payment",
            latestProof?.PaymentReference,
            latestProof?.OwnerNote,
            latestProof?.OriginalFileName,
            latestProof?.RejectionReason,
            order.TrackingStatus,
            order.TrackingNumber,
            order.ShippedAt,
            order.DeliveredAt,
            order.CancelledAt,
            proofs,
            order.UpdatedAt,
            order.CreatedAt);
    }

    public static PaymentProofResponse ToPaymentProofResponse(PaymentProof proof)
    {
        return new PaymentProofResponse(
            proof.Id,
            proof.OrderId,
            proof.MediaFileId,
            proof.OriginalFileName,
            proof.ContentType,
            proof.FileSize,
            proof.StorageProvider,
            proof.PaymentMethod,
            proof.Status,
            proof.PaymentReference,
            proof.OwnerNote,
            proof.RejectionReason,
            proof.UploadedAt);
    }
}
