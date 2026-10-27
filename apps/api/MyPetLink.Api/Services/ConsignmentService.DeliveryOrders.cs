using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// The Delivery Order is the handover form for a delivery the system has already dispatched.
// It is generated from the stored dispatch, never from the browser, and it reads stock without
// moving it: no unit, movement or ledger row is written. Issuing takes one number from the shared
// Delivery Order series and freezes the parties, delivered SKU quantities and PDF; every later
// request, concurrent or not, returns that same copy. The issuer may sign Delivered By with their own
// signature, only after confirming; Received By is always left for the partner to sign by hand.
public sealed partial class ConsignmentService
{
    public sealed record DeliveryOrderLine(string Sku, string Design, string Size, int Delivered, int? Counted);
    /// <summary>One receiving event as it was recorded: who received, when, and how its units were classified.</summary>
    public sealed record DeliveryOrderReceiptEvent(DateTimeOffset ReceivedAt, string RecipientName, int Good, int Damaged, int Missing);
    /// <summary>A later, separately evidenced outcome for units after receipt, such as a physical return.</summary>
    public sealed record DeliveryOrderLaterOutcome(DateTimeOffset RecordedAt, string Outcome, int Units);
    /// <summary>
    /// Receiving already recorded when the document was issued, rebuilt from the retained receiving events,
    /// never from the units' current states. Counted, Good, Damaged and Missing are what each unit's first
    /// receiving event found; what happened afterwards is in Later. Units with no unit-level receiving
    /// record are unverified, whatever their current state. Null when nothing was recorded, so the printed
    /// form leaves the partner's count blank for handwriting.
    /// </summary>
    public sealed record DeliveryOrderReceipt(int Counted, int Good, int Damaged, int Missing,
        int AwaitingConfirmation, int UnderReview, int NotRecordedByUnit,
        IReadOnlyList<DeliveryOrderReceiptEvent> Events, IReadOnlyList<DeliveryOrderLaterOutcome> Later)
    {
        [System.Text.Json.Serialization.JsonIgnore]
        public int Unverified => AwaitingConfirmation + UnderReview + NotRecordedByUnit;
    }
    public sealed record DeliveryOrderSnapshot(string Number, Guid DispatchId, string DispatchNumber, string BrandName,
        string CompanyName, string? CompanyRegistrationNumber, IReadOnlyList<string> CompanyAddress, string? CompanyEmail,
        string? CompanyPhone, string PartnerName, string? PartnerTradingName, string? PartnerRegistrationNumber,
        string? BranchName, string DeliveryAddress, string? ContactPerson, string? ContactPhone, string AgreementReference,
        int AgreementVersion, DateTimeOffset DeliveredAt, string? ShipmentReference, string? DispatchedBy,
        IReadOnlyList<DeliveryOrderLine> Lines, int TotalQuantity, DeliveryOrderReceipt? Receipt, DateTimeOffset IssuedAt,
        DeliveryOrderSigning? Signature = null);

    /// <summary>
    /// Who signed Delivered By, frozen at issue. The signer is always the issuing administrator,
    /// signing with their own signature at the moment of issue; the image is inside the PDF only.
    /// </summary>
    public sealed record DeliveryOrderSigning(Guid SignatureId, string SignatoryName, string SignatoryPosition,
        DateTimeOffset SignedAt, string ImageSha256);

    public const string PreviewNumber = "Not issued (preview)";

    public Task<ConsignmentDeliveryOrderSummary> IssueDeliveryOrderAsync(Guid? actor, Guid dispatchId, CancellationToken ct) =>
        IssueDeliveryOrderAsync(actor, dispatchId, null, ct);

    public async Task<ConsignmentDeliveryOrderSummary> IssueDeliveryOrderAsync(Guid? actor, Guid dispatchId,
        ConsignmentDeliveryOrderSigningRequest? signing, CancellationToken ct)
    {
        var signatureId = RequestedSignature(signing);
        await RunAsync(actor, async admin => {
            // RunAsync holds the consignment lock, so a second request waits and then finds this one's copy.
            var existing = await db.ConsignmentDeliveryOrders.AsNoTracking().Where(x => x.DispatchId == dispatchId)
                .Select(x => new { x.DeliveryOrderNumber, x.SignatureId }).SingleOrDefaultAsync(ct);
            if (existing is not null)
            {
                // Repeating the same request returns the issued copy. Asking for a different one never
                // signs, unsigns or replaces it.
                if (existing.SignatureId == signatureId) return;
                throw new ApiException(409, "consignment_delivery_order_already_issued",
                    $"Delivery Order {existing.DeliveryOrderNumber} was already generated {(existing.SignatureId is null ? "unsigned" : "with a signature")}. "
                    + "Download that copy instead; an issued Delivery Order can’t be changed.");
            }
            var (merchantId, build) = await DeliveryOrderSourceAsync(dispatchId, ct);
            DocumentSignature? signature = null;
            if (signatureId is { } id)
            {
                // Held until commit, so the signature can't be replaced or removed while it is being applied.
                await DocumentSignatureService.LockAsync(db, admin, ct);
                signature = await DocumentSignatureService.RequireOwnForSigningAsync(db, access, actor, admin, id, ct);
            }
            var issuedAt = time.GetUtcNow();
            var number = await numbers.NextMerchantDeliveryOrderNumberAsync(issuedAt, ct);
            var signed = Signing(signature, issuedAt);
            var snapshot = build(number, issuedAt, signed);
            var pdf = ConsignmentDeliveryOrderRenderer.Render(new(snapshot, BrandLogo(), signature?.Image));
            var order = new ConsignmentDeliveryOrder {
                DispatchId = snapshot.DispatchId, MerchantId = merchantId, DeliveryOrderNumber = number,
                DeliveredQuantity = snapshot.TotalQuantity, SnapshotJson = JsonSerializer.Serialize(snapshot, DocumentJson),
                Content = pdf, ContentSha256 = Convert.ToHexString(SHA256.HashData(pdf)), FileName = DeliveryOrderFileName(number),
                IssuedAt = issuedAt, IssuedByAdminUserId = admin,
                SignatureId = signed?.SignatureId, SignedByAdminUserId = signed is null ? null : admin, SignedAt = signed?.SignedAt,
                SignatoryName = signed?.SignatoryName, SignatoryPosition = signed?.SignatoryPosition, SignatureImageSha256 = signed?.ImageSha256 };
            db.ConsignmentDeliveryOrders.Add(order);
            audit.Append(admin, ActorType.Admin, "consignment.delivery-order-issued", "ConsignmentDispatch", snapshot.DispatchId, null,
                new { deliveryOrderId = order.Id, number, quantity = order.DeliveredQuantity, sha256 = order.ContentSha256,
                    signed = signed is not null, signatureId = signed?.SignatureId, signatory = signed?.SignatoryName,
                    signatoryPosition = signed?.SignatoryPosition, signedAt = signed?.SignedAt, signatureSha256 = signed?.ImageSha256 });
            if (signed is not null)
                audit.Append(admin, ActorType.Admin, "document-signature.applied", nameof(DocumentSignature), signed.SignatureId, null,
                    new { document = "consignment-delivery-order", deliveryOrderId = order.Id, number, dispatchId = snapshot.DispatchId,
                        signedAt = signed.SignedAt, sha256 = signed.ImageSha256 });
        }, ct);
        return await DeliveryOrderSummaryAsync(dispatchId, ct) ?? throw Missing();
    }

    /// <summary>
    /// The Delivery Order as it would be issued now, watermarked as a preview. It takes no number,
    /// is not kept, and moves nothing. A signed preview shows only the requester's own signature.
    /// </summary>
    public async Task<OrderDocumentResult> PreviewDeliveryOrderAsync(Guid? actor, Guid dispatchId, Guid? signatureId, CancellationToken ct)
    {
        var admin = await DocumentSignatureService.RequireAdminAsync(db, actor, ct);
        if (await db.ConsignmentDeliveryOrders.AnyAsync(x => x.DispatchId == dispatchId, ct))
            throw new ApiException(409, "consignment_delivery_order_already_issued",
                "This Delivery Order was already generated. Download the issued copy instead.");
        var (_, build) = await DeliveryOrderSourceAsync(dispatchId, ct);
        var signature = signatureId is { } id
            ? await DocumentSignatureService.RequireOwnForSigningAsync(db, access, actor, admin, id, ct) : null;
        var at = time.GetUtcNow();
        var snapshot = build(PreviewNumber, at, Signing(signature, at));
        var pdf = ConsignmentDeliveryOrderRenderer.Render(new(snapshot, BrandLogo(), signature?.Image, Preview: true));
        if (signature is not null)
        {
            audit.Append(admin, ActorType.Admin, "document-signature.previewed", nameof(DocumentSignature), signature.Id, null,
                new { document = "consignment-delivery-order", dispatchId });
            await db.SaveChangesAsync(ct);
        }
        return new(pdf, $"MyPetLink_Delivery_Order_PREVIEW_{SafeReference(snapshot.DispatchNumber)}.pdf");
    }

    /// <summary>A signature is applied only when it is named and explicitly confirmed.</summary>
    private static Guid? RequestedSignature(ConsignmentDeliveryOrderSigningRequest? signing)
    {
        if (signing?.SignatureId is not { } id) return null;
        if (id == Guid.Empty || !signing.Confirmed)
            throw new ApiException(400, "signature_not_confirmed", "Confirm that you are signing this Delivery Order before generating it.");
        return id;
    }

    private static DeliveryOrderSigning? Signing(DocumentSignature? s, DateTimeOffset at) =>
        s is null ? null : new(s.Id, s.SignatoryName, s.SignatoryPosition, at.ToUniversalTime(), s.ImageSha256);

    // Everything the document says about the delivery, read without tracking: issuing or previewing
    // writes no stock row. Returns the partner and a builder for the snapshot at a given moment.
    private async Task<(Guid MerchantId, Func<string, DateTimeOffset, DeliveryOrderSigning?, DeliveryOrderSnapshot> Build)>
        DeliveryOrderSourceAsync(Guid dispatchId, CancellationToken ct)
    {
        var d = await db.ConsignmentDispatches.AsNoTracking().Include(x => x.Units).Include(x => x.Agreement).ThenInclude(a => a.Merchant)
            .SingleOrDefaultAsync(x => x.Id == dispatchId, ct) ?? throw Missing();
        RequireDelivered(d);
        var branch = d.MerchantBranchId is { } branchId
            ? await db.MerchantBranches.AsNoTracking().SingleOrDefaultAsync(b => b.Id == branchId, ct) : null;
        // Older dispatches did not record the confirming admin on the row; their movement did.
        var dispatcherId = d.DispatchedByAdminUserId ?? await db.ConsignmentMovements.AsNoTracking()
            .Where(m => m.DispatchId == d.Id && m.UnitId == null && m.Action == "dispatched")
            .OrderBy(m => m.OccurredAt).Select(m => (Guid?)m.ActorAdminUserId).FirstOrDefaultAsync(ct);
        var dispatchedBy = dispatcherId is null ? null : await db.AdminUsers.AsNoTracking().Where(a => a.Id == dispatcherId)
            .Select(a => a.User.DisplayName).SingleOrDefaultAsync(ct);
        var seller = await DeliveryOrderSellerAsync(d, ct);
        var receiving = await db.ConsignmentMovements.AsNoTracking()
            .Where(m => m.DispatchId == d.Id && (m.Action == "receiving-unit" || ReceivingEventActions.Contains(m.Action)))
            .ToListAsync(ct);
        return (d.Agreement.MerchantId, (number, at, signing) =>
            DeliveryOrderSnapshotFor(number, d, receiving, seller, branch, Trim(dispatchedBy), at) with { Signature = signing });
    }

    public Task<ConsignmentDeliveryOrderSummary?> DeliveryOrderSummaryAsync(Guid dispatchId, CancellationToken ct) =>
        db.ConsignmentDeliveryOrders.AsNoTracking().Where(x => x.DispatchId == dispatchId)
            .Select(x => new ConsignmentDeliveryOrderSummary(x.Id, x.DeliveryOrderNumber, x.IssuedAt, x.DeliveredQuantity, x.FileName,
                db.AdminUsers.Where(a => a.Id == x.IssuedByAdminUserId).Select(a => a.User.DisplayName).FirstOrDefault(),
                x.SignatoryName, x.SignatoryPosition, x.SignedAt))
            .SingleOrDefaultAsync(ct);

    /// <summary>Only stock that actually left MyPetLink has a Delivery Order. A reservation is a plan, not a delivery.</summary>
    private static void RequireDelivered(ConsignmentDispatch d)
    {
        if (d.DispatchedAt is null || d.Status is not (ConsignmentDispatchStatus.Dispatched or ConsignmentDispatchStatus.Received)
            || d.Units.Count == 0 || d.Units.Any(u => u.Status == ConsignmentUnitStatus.Reserved))
            throw new ApiException(409, "consignment_delivery_order_unavailable",
                "A Delivery Order is available once this stock has been dispatched. Reserved or cancelled deliveries don’t have one.");
    }

    // The business identity frozen on the dispatch is the one the delivery was made under. Only a
    // dispatch saved before that snapshot existed falls back to the current confirmed details.
    private async Task<SellerIdentitySnapshot> DeliveryOrderSellerAsync(ConsignmentDispatch d, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(d.Seller?.LegalBusinessName)) return d.Seller;
        var current = await SellerAsync(ct);
        if (current is null || string.IsNullOrWhiteSpace(current.LegalBusinessName))
            throw new ApiException(409, "consignment_delivery_order_incomplete",
                "Add MyPetLink’s business name in Business Details before generating this Delivery Order.");
        return SellerIdentitySnapshot.From(current);
    }

    internal static DeliveryOrderSnapshot DeliveryOrderSnapshotFor(string number, ConsignmentDispatch d,
        IReadOnlyCollection<ConsignmentMovement> receiving, SellerIdentitySnapshot s, MerchantBranch? branch, string? dispatchedBy,
        DateTimeOffset issuedAt)
    {
        static IReadOnlyList<string> Lines(params string?[] parts) =>
            parts.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim()).ToArray();
        var m = d.Agreement.Merchant;
        var (receipt, firstFindings) = ReceiptHistory(d.Units, receiving);
        // Counted at the partner includes damaged units, as the receiving form records them.
        bool Counted(ConsignmentUnit u) => firstFindings.TryGetValue(u.Id, out var state)
            && state is ConsignmentReceivingState.Good or ConsignmentReceivingState.Damaged;
        var lines = d.Units.GroupBy(u => new { u.SkuSnapshot, u.ProductNameSnapshot, u.VariantSnapshot })
            .OrderBy(g => g.Key.SkuSnapshot, StringComparer.Ordinal).ThenBy(g => g.Key.ProductNameSnapshot, StringComparer.Ordinal)
            .Select(g => new DeliveryOrderLine(g.Key.SkuSnapshot, g.Key.ProductNameSnapshot, g.Key.VariantSnapshot, g.Count(),
                firstFindings.Count > 0 ? g.Count(Counted) : null)).ToArray();
        var trading = Trim(m.TradingName);
        return new(number, d.Id, d.DispatchNumber, s.BrandName.Trim(), s.LegalBusinessName.Trim(), Trim(s.BusinessRegistrationNumber),
            Lines(s.AddressLine1, s.AddressLine2, $"{s.Postcode} {s.City}".Trim(), s.State, s.Country), Trim(s.SupportEmail), Trim(s.BusinessPhone),
            m.LegalBusinessName.Trim(), trading == m.LegalBusinessName.Trim() ? null : trading, Trim(m.BusinessRegistrationNumber),
            Trim(branch?.Name), d.DestinationSnapshot.Trim(), Trim(m.ContactPerson), Trim(branch?.ContactPhone) ?? Trim(m.ContactPhone),
            d.AgreementReferenceSnapshot, d.AgreementVersionSnapshot, d.DispatchedAt!.Value.ToUniversalTime(), Trim(d.ShipmentReference), dispatchedBy,
            lines, lines.Sum(l => l.Delivered), receipt, issuedAt.ToUniversalTime());
    }

    private static readonly string[] ReceivingEventActions = ["receive", "record-discrepancy", "resolve-discrepancy"];

    /// <summary>
    /// Rebuilds receipt facts from the dispatch's retained receiving history. A unit is first classified
    /// by exactly one receive or record-discrepancy event (only an unconfirmed unit can be), so those
    /// events are what was found at receipt. Resolutions come later and are reported separately: a unit
    /// counted damaged and later returned stays counted. The dispatch's latest-receipt fields are not
    /// used, because they describe only the most recent event.
    /// </summary>
    internal static (DeliveryOrderReceipt? Receipt, IReadOnlyDictionary<Guid, ConsignmentReceivingState> FirstFindings) ReceiptHistory(
        ICollection<ConsignmentUnit> units, IReadOnlyCollection<ConsignmentMovement> history)
    {
        var delivered = units.Select(u => u.Id).ToHashSet();
        var events = history.Where(m => m.UnitId == null && ReceivingEventActions.Contains(m.Action))
            .Select(m => (Movement: m, Evidence: ReceiptEvidence(m.EvidenceJson)))
            .Where(x => x.Evidence is not null).Select(x => (x.Movement, Evidence: x.Evidence!))
            .OrderBy(x => x.Evidence.ReceivedAt).ThenBy(x => x.Movement.OccurredAt).ToList();
        static bool Explicit(ConsignmentReceiptEvidence e) =>
            e.GoodUnitIds != null || e.DamagedUnitIds != null || e.MissingUnitIds != null || e.ReturnedUnitIds != null;
        static IEnumerable<(Guid Unit, ConsignmentReceivingState State)> Named(ConsignmentReceiptEvidence e) =>
            (e.GoodUnitIds ?? []).Select(id => (id, ConsignmentReceivingState.Good))
            .Concat((e.DamagedUnitIds ?? []).Select(id => (id, ConsignmentReceivingState.Damaged)))
            .Concat((e.MissingUnitIds ?? []).Select(id => (id, ConsignmentReceivingState.Missing)))
            .Concat((e.ReturnedUnitIds ?? []).Select(id => (id, ConsignmentReceivingState.Returned)));

        var first = new Dictionary<Guid, (ConsignmentReceivingState State, ConsignmentReceiptEvidence Event)>();
        var findings = events.Where(x => x.Movement.Action != "resolve-discrepancy").ToList();
        // Events that name their units first. An older full, undamaged receipt names none; its own
        // per-unit receiving records (same reference, counted good) identify them instead.
        foreach (var (_, e) in findings.Where(x => Explicit(x.Evidence)))
            foreach (var (unit, state) in Named(e).Where(x => delivered.Contains(x.Unit) && x.State != ConsignmentReceivingState.Returned))
                first.TryAdd(unit, (state, e));
        foreach (var (movement, e) in findings.Where(x => !Explicit(x.Evidence)))
        {
            // A resolution may reuse the same reference; the units it names are not this receipt's.
            var resolved = events.Where(x => x.Movement.Action == "resolve-discrepancy" && x.Movement.Reference == movement.Reference)
                .SelectMany(x => Named(x.Evidence)).Select(n => n.Unit).ToHashSet();
            foreach (var unit in history.Where(h => h.UnitId is { } id && delivered.Contains(id) && !resolved.Contains(id)
                         && h.Action == "receiving-unit" && h.Reference == movement.Reference
                         && UnitFinding(h.EvidenceJson) == ConsignmentReceivingState.Good)
                     .Select(h => h.UnitId!.Value))
                first.TryAdd(unit, (ConsignmentReceivingState.Good, e));
        }

        var later = events.Where(x => x.Movement.Action == "resolve-discrepancy" && Explicit(x.Evidence))
            .SelectMany(x => Named(x.Evidence).Where(n => delivered.Contains(n.Unit)).Select(n => (x.Evidence.ReceivedAt, n.State)))
            .GroupBy(x => (Day: x.ReceivedAt.ToOffset(Malaysia).Date, x.State))
            .Select(g => new DeliveryOrderLaterOutcome(g.Min(x => x.ReceivedAt).ToUniversalTime(), g.Key.State switch {
                ConsignmentReceivingState.Good => "confirmed good after review",
                ConsignmentReceivingState.Damaged => "confirmed damaged after review",
                ConsignmentReceivingState.Missing => "confirmed missing after review",
                _ => "returned to MyPetLink" }, g.Count()))
            .OrderBy(x => x.RecordedAt).ToArray();

        // No unit-level record at receipt: say only what the unit is waiting for, never what it was.
        var unrecorded = units.Where(u => !first.ContainsKey(u.Id)).ToArray();
        var awaiting = unrecorded.Count(u => u.ReceivingState == ConsignmentReceivingState.Unconfirmed);
        var review = unrecorded.Count(u => u.ReceivingState == ConsignmentReceivingState.ReviewRequired);
        var states = first.ToDictionary(x => x.Key, x => x.Value.State);
        if (first.Count == 0 && later.Length == 0 && awaiting == units.Count) return (null, states);

        int Found(ConsignmentReceivingState state) => first.Values.Count(v => v.State == state);
        // Grouped by the event itself, never by equal-looking values: two receipts stay two receipts.
        var receipts = first.Values.GroupBy(v => (object)v.Event, ReferenceEqualityComparer.Instance)
            .Select(g => (Event: (ConsignmentReceiptEvidence)g.Key, Units: g))
            .Select(g => new DeliveryOrderReceiptEvent(g.Event.ReceivedAt.ToUniversalTime(), g.Event.Recipient.Trim(),
                g.Units.Count(v => v.State == ConsignmentReceivingState.Good), g.Units.Count(v => v.State == ConsignmentReceivingState.Damaged),
                g.Units.Count(v => v.State == ConsignmentReceivingState.Missing)))
            .OrderBy(x => x.ReceivedAt).ToArray();
        return (new DeliveryOrderReceipt(Found(ConsignmentReceivingState.Good) + Found(ConsignmentReceivingState.Damaged),
            Found(ConsignmentReceivingState.Good), Found(ConsignmentReceivingState.Damaged), Found(ConsignmentReceivingState.Missing),
            awaiting, review, unrecorded.Length - awaiting - review, receipts, later), states);
    }

    private static ConsignmentReceiptEvidence? ReceiptEvidence(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var e = JsonSerializer.Deserialize<ConsignmentReceiptEvidence>(json);
            return e is { Recipient: not null } && e.ReceivedAt != default ? e : null;
        }
        catch (JsonException) { return null; }
    }

    private static ConsignmentReceivingState? UnitFinding(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("ReceivingState", out var value)
                && Enum.TryParse<ConsignmentReceivingState>(value.GetString(), out var state) ? state : null;
        }
        catch (JsonException) { return null; }
    }

    internal static string DeliveryOrderFileName(string number) => $"MyPetLink_Delivery_Order_{SafeReference(number)}.pdf";
}
