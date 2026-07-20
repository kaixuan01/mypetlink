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
            tag.Variant,
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
        var timeline = BuildTimeline(order);
        var item = order.Items.OrderBy(entry => entry.CreatedAt).FirstOrDefault();

        return new TagOrderResponse(
            order.Id,
            order.OrderNumber,
            order.OwnerUserId,
            order.PetId,
            order.Pet?.Name,
            order.SmartTagId,
            order.SmartTag?.TagCode,
            order.TagType,
            order.Variant,
            order.Amount,
            order.Currency,
            order.DeliveryFee,
            order.Status,
            order.PaymentStatus,
            order.ReplacementForTagId,
            item is null ? null : new TagOrderItemResponse(
                item.SkuSnapshot,
                item.ProductNameSnapshot,
                item.VariantNameSnapshot,
                item.UnitBasePrice,
                item.Quantity,
                item.Subtotal,
                item.PromotionNameSnapshot,
                item.DiscountAmount,
                item.FinalUnitPrice,
                item.FinalAmount,
                item.Currency),
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
            timeline,
            order.UpdatedAt,
            order.CreatedAt);
    }

    // Builds the chronological status history shown on the owner order detail
    // page. Every payment proof attempt is preserved (submitted / resubmitted /
    // rejected), so a rejected-then-resubmitted flow reads as a full history
    // rather than a single "payment submitted" line. Events are emitted in the
    // order they happened; the last non-terminal event is marked "current".
    private static IReadOnlyList<OrderTimelineEventResponse> BuildTimeline(TagOrder order)
    {
        const string rejectionFallback = "Please upload a clearer payment proof.";

        var events = new List<OrderTimelineEventResponse>
        {
            new("OrderCreated", "Order created", null, order.CreatedAt, "completed")
        };

        // Oldest-first so submitted/resubmitted numbering and inline rejections
        // read in true chronological order.
        var proofsChronological = order.PaymentProofs
            .OrderBy(proof => proof.UploadedAt)
            .ThenBy(proof => proof.CreatedAt)
            .ToList();

        var attempt = 0;
        foreach (var proof in proofsChronological)
        {
            attempt++;

            events.Add(attempt == 1
                ? new OrderTimelineEventResponse(
                    "PaymentProofSubmitted",
                    "Payment proof submitted",
                    "Receipt uploaded.",
                    proof.UploadedAt,
                    "completed")
                : new OrderTimelineEventResponse(
                    "PaymentProofResubmitted",
                    "Payment proof resubmitted",
                    "New receipt uploaded.",
                    proof.UploadedAt,
                    "completed"));

            if (proof.Status == PaymentProofStatus.Rejected)
            {
                var reason = string.IsNullOrWhiteSpace(proof.RejectionReason)
                    ? rejectionFallback
                    : proof.RejectionReason;

                events.Add(new OrderTimelineEventResponse(
                    "PaymentProofRejected",
                    "Payment proof rejected",
                    reason,
                    proof.ReviewedAt,
                    "warning"));
            }
        }

        if (order.PaymentConfirmedAt.HasValue)
        {
            events.Add(new OrderTimelineEventResponse(
                "PaymentConfirmed",
                "Payment confirmed",
                "Payment verified by our team.",
                order.PaymentConfirmedAt,
                "completed"));
        }

        // Tag preparation has no dedicated timestamp column; surface the step
        // (with a null timestamp) once the order has moved past confirmation.
        if (order.Status is OrderStatus.PreparingTag or OrderStatus.Shipped or OrderStatus.Delivered)
        {
            events.Add(new OrderTimelineEventResponse(
                "PreparingTag",
                "Tag preparing",
                "Your tag is being prepared.",
                null,
                "completed"));
        }

        if (order.ShippedAt.HasValue)
        {
            var description = string.IsNullOrWhiteSpace(order.TrackingNumber)
                ? "Your tag is on the way."
                : $"On the way. Tracking number {order.TrackingNumber}.";

            events.Add(new OrderTimelineEventResponse(
                "Shipped",
                "Shipped",
                description,
                order.ShippedAt,
                "completed"));
        }

        if (order.DeliveredAt.HasValue)
        {
            events.Add(new OrderTimelineEventResponse(
                "Delivered",
                "Delivered",
                "Your tag has been delivered.",
                order.DeliveredAt,
                "completed"));
        }

        if (order.CancelledAt.HasValue)
        {
            events.Add(new OrderTimelineEventResponse(
                "Cancelled",
                "Order cancelled",
                null,
                order.CancelledAt,
                "cancelled"));
        }

        // Highlight the most recent event as the current step, but only when it
        // is a normal (completed) event. If the tail is a rejection (warning) or
        // a cancellation, its own tone is more meaningful than "current".
        var lastIndex = events.Count - 1;
        if (events[lastIndex].StatusTone == "completed")
        {
            events[lastIndex] = events[lastIndex] with { StatusTone = "current" };
        }

        return events;
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
            proof.UploadedAt,
            proof.ReviewedAt);
    }
}
