using MyPetLink.Api.Common;
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

    public static TagOrderResponse ToOrderResponse(
        TagOrder order,
        string? trackingUrl = null,
        bool includePreShipmentOperations = false)
    {
        var proofs = order.PaymentProofs
            .OrderByDescending(proof => proof.UploadedAt)
            .ThenByDescending(proof => proof.CreatedAt)
            .Select(ToPaymentProofResponse)
            .ToArray();
        var latestProof = proofs.FirstOrDefault();
        var timeline = BuildTimeline(order);
        var shipmentVisible = includePreShipmentOperations
            || order.Status is OrderStatus.Shipped or OrderStatus.Delivered;
        var items = BuildItemResponses(order, shipmentVisible);
        var item = items.FirstOrDefault();
        var merchandiseSubtotal = order.Items.Count > 0
            ? order.Items.Sum(entry => entry.Subtotal)
            : order.Amount;
        var discountTotal = order.Items.Sum(entry => entry.DiscountAmount);
        decimal? estimatedWeight = order.Items.Count > 0
            && order.Items.All(entry => entry.UnitWeightGramsSnapshot.HasValue)
                ? order.Items.Sum(entry => entry.UnitWeightGramsSnapshot!.Value * entry.Quantity)
                : null;
        var primaryVisibleTag = shipmentVisible ? order.SmartTag : null;

        return new TagOrderResponse(
            order.Id,
            order.OrderNumber,
            order.ReceiptNumber,
            order.OwnerUserId,
            order.PetId,
            order.Pet?.Name,
            primaryVisibleTag?.Id,
            primaryVisibleTag?.TagCode,
            order.TagType,
            order.Variant,
            order.Amount,
            order.Currency,
            order.DeliveryFee,
            order.TotalAmount ?? order.Amount + order.DeliveryFee,
            order.Status,
            order.PaymentStatus,
            order.ReplacementForTagId,
            item,
            items,
            merchandiseSubtotal,
            discountTotal,
            estimatedWeight,
            new DeliveryDetailsResponse(
                order.RecipientName,
                order.DeliveryPhoneE164,
                order.AddressLine1,
                order.AddressLine2,
                order.Postcode,
                order.City,
                order.State,
                order.StateCode,
                order.Country ?? "Malaysia",
                // Presentation only: the stored snapshot keeps its original
                // wording, and the fee it was quoted at never changes.
                DeliveryLabels.NormalizeCustomerRegion(order.DeliveryZoneName, order.StateCode),
                DeliveryLabels.NormalizeCustomerMethod(order.DeliveryMethodName, order.StateCode),
                order.FreeShippingReason,
                order.DeliveryNotes),
            latestProof?.UploadedAt,
            order.PaymentConfirmedAt,
            latestProof?.PaymentMethod ?? "QR Payment",
            latestProof?.PaymentReference,
            latestProof?.OwnerNote,
            latestProof?.OriginalFileName,
            latestProof?.RejectionReason,
            EmailOutboxService.ToOwnerResponse(order.EmailOutboxMessages),
            order.TrackingStatus,
            shipmentVisible ? order.CourierProvider : null,
            shipmentVisible ? order.CourierService : null,
            shipmentVisible ? order.TrackingNumber : null,
            order.ReadyToShipAt,
            shipmentVisible ? order.ShippedAt : null,
            order.DeliveredAt,
            order.CancelledAt,
            proofs,
            timeline,
            order.UpdatedAt,
            order.CreatedAt,
            shipmentVisible ? trackingUrl : null,
            // Only meaningful while the order is still awaiting payment; a paid
            // or cancelled order must not show a countdown.
            order.Status == OrderStatus.PendingPayment
                ? order.PaymentReservationExpiresAt
                : null,
            order.PaymentReservationExpiredAt,
            OrderService.CanOwnerCancel(order));
    }

    private static IReadOnlyCollection<TagOrderItemResponse> BuildItemResponses(
        TagOrder order,
        bool includeAssignedTags)
    {
        var items = order.Items.OrderBy(entry => entry.CreatedAt).ToArray();
        if (items.Length == 0)
        {
            var legacyTag = includeAssignedTags && order.SmartTag is not null
                ? new[] { ToAssignedTag(order.SmartTag, null, order.PetId, order.Pet?.Name ?? "Pet") }
                : Array.Empty<AssignedOrderTagResponse>();
            return
            [
                new TagOrderItemResponse(
                    null,
                    order.PetId,
                    order.Pet?.Name ?? "Pet",
                    "",
                    order.TagType == TagType.QrNfcSmartTag
                        ? "MyPetLink QR + NFC Smart Tag"
                        : "MyPetLink QR Pet Tag",
                    order.Variant,
                    order.Amount,
                    1,
                    order.Amount,
                    null,
                    0m,
                    order.Amount,
                    order.Amount,
                    null,
                    order.Currency,
                    true,
                    order.TagType == TagType.QrNfcSmartTag,
                    legacyTag)
            ];
        }

        return items.Select(item => new TagOrderItemResponse(
            item.Id,
            item.PetId ?? order.PetId,
            item.PetNameSnapshot ?? item.Pet?.Name ?? order.Pet?.Name ?? "Pet",
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
            item.UnitWeightGramsSnapshot,
            item.Currency,
            item.SupportsQrSnapshot,
            item.SupportsNfcSnapshot,
            includeAssignedTags
                ? item.AssignedTags
                    .Where(IsCurrentAssignedTag)
                    .OrderBy(tag => tag.CreatedAt)
                    .Select(tag => ToAssignedTag(
                        tag,
                        item.Id,
                        item.PetId ?? order.PetId,
                        item.PetNameSnapshot ?? item.Pet?.Name ?? order.Pet?.Name ?? "Pet"))
                    .ToArray()
                : Array.Empty<AssignedOrderTagResponse>())).ToArray();
    }

    private static bool IsCurrentAssignedTag(SmartTag tag) =>
        tag.ArchivedAt is null
        && tag.DeletedAt is null
        && tag.Status is SmartTagStatus.Pending
            or SmartTagStatus.Preparing
            or SmartTagStatus.Delivered
            or SmartTagStatus.Active;

    private static AssignedOrderTagResponse ToAssignedTag(
        SmartTag tag,
        Guid? orderItemId,
        Guid petId,
        string petName) =>
        new(tag.Id, tag.TagCode, orderItemId, petId, petName, tag.Status);

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
        if (order.Status is OrderStatus.PreparingTag or OrderStatus.ReadyToShip or OrderStatus.Shipped or OrderStatus.Delivered)
        {
            events.Add(new OrderTimelineEventResponse(
                "PreparingTag",
                "Tag preparing",
                "Your tag is being prepared.",
                null,
                "completed"));
        }

        if (order.ReadyToShipAt.HasValue)
        {
            events.Add(new OrderTimelineEventResponse(
                "ReadyToShip",
                "Ready to ship",
                "Your tag is packed and ready for the courier.",
                order.ReadyToShipAt,
                "completed"));
        }

        if (order.ShippedAt.HasValue)
        {
            var description = string.IsNullOrWhiteSpace(order.CourierProvider)
                ? $"On the way. Tracking number {order.TrackingNumber}."
                : $"Shipped with {order.CourierProvider}. Tracking number {order.TrackingNumber}.";

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

        if (order.PaymentReservationExpiredAt.HasValue)
        {
            // An automatic expiry reads very differently from someone choosing
            // to cancel, so it gets its own customer-facing event.
            events.Add(new OrderTimelineEventResponse(
                "PaymentReservationExpired",
                "Order expired",
                "Order expired because payment was not completed in time. "
                + "The reserved tags were released.",
                order.PaymentReservationExpiredAt,
                "cancelled"));
        }
        else if (order.CancelledAt.HasValue)
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
            proof.SubmittedAmount,
            proof.Status,
            proof.PaymentReference,
            proof.OwnerNote,
            proof.RejectionReason,
            proof.UploadedAt,
            proof.ReviewedAt);
    }
}
