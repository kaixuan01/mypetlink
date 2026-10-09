using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class PhysicalQaService
{
    // A reader result is accepted for this long after it was captured.
    internal static readonly TimeSpan CaptureLifetime = TimeSpan.FromMinutes(30);
    // Tolerates a small clock difference between API instances, so a result
    // captured on one instance is not refused as "from the future" on another.
    internal static readonly TimeSpan ClockSkewAllowance = TimeSpan.FromMinutes(2);
    // Reconciliation lists are capped; counts always cover the full manifest.
    internal const int ReconciliationListLimit = 500;

    private const string CodePattern = "MPL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}";
    private static readonly Regex TagCodeFormat = new("^" + CodePattern + "$", RegexOptions.CultureInvariant);
    private static readonly Regex TagPath = new("^/([A-Za-z]+)/([^/]+)$", RegexOptions.CultureInvariant);

    private readonly MyPetLinkDbContext _db;
    private readonly IAuditLogService _audit;
    private readonly IDataProtector _protector;
    private readonly PublicSiteOptions _site;
    private readonly TimeProvider _clock;
    private sealed record Capture(Guid AdminId, Guid TagId, int Version, QaCaptureSource Source,
        string Url, string? SerialNumber, string? ReportedSerial, DateTimeOffset At);

    public PhysicalQaService(MyPetLinkDbContext db, IAuditLogService audit,
        IDataProtectionProvider protection, IOptions<PublicSiteOptions> site, TimeProvider clock)
    {
        _db = db; _audit = audit; _site = site.Value; _clock = clock;
        _protector = protection.CreateProtector("MyPetLink.PhysicalQa.Capture.v1");
    }

    private IQueryable<SmartTag> Graph() => _db.SmartTags.AsNoTracking()
        .Include(t => t.Batch).Include(t => t.ProductVariant)
        .Include(t => t.QaInspectedByAdminUser).ThenInclude(a => a!.User);

    private IQueryable<SmartTag> Filter(PhysicalQaQuery query, bool includeStatus = true)
    {
        var tags = Graph().Where(t => t.QaStatus != null);
        if (!string.IsNullOrWhiteSpace(query.Batch)) tags = tags.Where(t => t.Batch != null && t.Batch.BatchNo == query.Batch.Trim());
        if (!string.IsNullOrWhiteSpace(query.Sku)) tags = tags.Where(t => t.ProductVariant != null && t.ProductVariant.Sku.Contains(query.Sku.Trim()));
        if (!string.IsNullOrWhiteSpace(query.TagCode)) tags = tags.Where(t => t.TagCode.Contains(query.TagCode.Trim().ToUpper()));
        if (!string.IsNullOrWhiteSpace(query.Shipment)) tags = tags.Where(t => t.QaShipmentReference == query.Shipment.Trim());
        if (!string.IsNullOrWhiteSpace(query.QaStatus))
        {
            if (!Enum.TryParse<PhysicalQaStatus>(query.QaStatus, true, out var status) || !Enum.IsDefined(status))
                throw Validation("Choose a supported inspection status.");
            if (includeStatus) tags = tags.Where(t => t.QaStatus == status);
        }
        return tags;
    }

    public async Task<(IReadOnlyCollection<PhysicalQaItem> Items, int Total)> ListAsync(PhysicalQaQuery query, CancellationToken ct)
    {
        var tags = Filter(query);
        var total = await tags.CountAsync(ct);
        var rows = await tags.OrderBy(t => t.TagCode).ThenBy(t => t.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return (rows.Select(Map).ToArray(), total);
    }

    public async Task<PhysicalQaSummary> SummaryAsync(PhysicalQaQuery query, CancellationToken ct)
    {
        var result = await Filter(query, includeStatus: false).GroupBy(_ => 1).Select(g => new PhysicalQaSummary(
            g.Count(), g.Count(t => t.QaStatus == PhysicalQaStatus.Passed),
            g.Count(t => t.QaStatus == PhysicalQaStatus.Failed), g.Count(t => t.QaStatus == PhysicalQaStatus.NeedsReview),
            g.Count(t => t.QaStatus == PhysicalQaStatus.Pending), g.Count(t => t.QaInspectedAt != null))).SingleOrDefaultAsync(ct);
        return result ?? new PhysicalQaSummary(0, 0, 0, 0, 0, 0);
    }

    public async Task<PhysicalQaItem> LookupAsync(string code, CancellationToken ct)
    {
        var normalized = NormalizeCode(code);
        var tag = await Graph().SingleOrDefaultAsync(t => t.TagCode == normalized && t.DeletedAt == null, ct)
            ?? throw new ApiException(404, "tag_not_found", "This tag code is not in inventory.");
        return Map(tag);
    }

    public async Task<PhysicalQaCaptureResponse> CaptureAsync(Guid? userId, PhysicalQaCaptureRequest request, CancellationToken ct)
    {
        var admin = await AdminAsync(userId, ct);
        if (!Enum.IsDefined(request.Source) || request.ExpectedVersion < 0 || string.IsNullOrWhiteSpace(request.Url) || request.Url.Length > 600 || request.SerialNumber?.Length > 100)
            throw Validation("The reader result is not supported.");
        var item = await LookupAsync(request.TagCode, ct);
        if (!item.CanInspect) throw Validation("This tag is outside the inspection queue or has already been sent onward.");
        if (item.Version != request.ExpectedVersion) throw Conflict();
        var chipId = request.Source == QaCaptureSource.WebNfc ? NormalizeChipId(request.SerialNumber) : null;
        var reported = string.IsNullOrWhiteSpace(request.SerialNumber) ? null : request.SerialNumber.Trim();
        var capture = new Capture(admin.Id, item.Id, item.Version, request.Source, request.Url.Trim(), chipId, reported, _clock.GetUtcNow());
        var (code, problem) = CheckUrl(capture.Url, capture.Source, item.TagCode);
        return new PhysicalQaCaptureResponse(_protector.Protect(JsonSerializer.Serialize(capture)), code, problem is null, problem, chipId);
    }

    public async Task<PhysicalQaItem> SaveAsync(Guid? userId, Guid tagId, SavePhysicalQaRequest request, CancellationToken ct)
    {
        var admin = await AdminAsync(userId, ct);
        if (request.InspectionId == Guid.Empty || request.ExpectedVersion < 0 || !Enum.IsDefined(request.Decision) || !Enum.IsDefined(request.PhysicalCondition))
            throw Validation("Choose a supported inspection result.");
        var variantId = await _db.SmartTags.AsNoTracking().Where(t => t.Id == tagId).Select(t => t.ProductVariantId).SingleOrDefaultAsync(ct);
        await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            // Same SKU lock as checkout, so a result that withdraws a tag from
            // sale cannot interleave with an order counting that tag as stock.
            await using var stockLock = variantId.HasValue ? await LockStockAsync([variantId.Value], ct) : null;
            var tag = await _db.SmartTags.SingleOrDefaultAsync(t => t.Id == tagId && t.DeletedAt == null, ct)
                ?? throw new ApiException(404, "tag_not_found", "This tag could not be found.");
            var remarks = string.IsNullOrWhiteSpace(request.Remarks) ? null : request.Remarks.Trim();
            if (remarks?.Length > 600) throw Validation("Keep inspection remarks within 600 characters.");
            if (tag.QaInspectionId == request.InspectionId)
            {
                if (tag.QaInspectedByAdminUserId == admin.Id && tag.QaVersion == request.ExpectedVersion + 1 && tag.QaStatus == request.Decision
                    && tag.QaPhysicalCondition == request.PhysicalCondition && tag.QaRemarks == remarks) return;
                throw Conflict();
            }
            if (tag.QaVersion != request.ExpectedVersion) throw Conflict();
            if (!CanInspect(tag)) throw Validation("This tag is outside the inspection queue or has already been sent onward.");
            if ((tag.QaInspectedAt.HasValue || request.Decision is PhysicalQaStatus.Failed or PhysicalQaStatus.NeedsReview) && remarks is null)
                throw Validation("Add a reason for a repeat inspection, failure, or review.");

            var qr = ReadEvidence(request.QrEvidence, admin.Id, tag, request.ExpectedVersion, nfc: false);
            var nfc = ReadEvidence(request.NfcEvidence, admin.Id, tag, request.ExpectedVersion, nfc: true);
            var qrGood = qr is not null && CheckUrl(qr.Url, qr.Source, tag.TagCode).Problem is null;
            var nfcGood = nfc is not null && CheckUrl(nfc.Url, nfc.Source, tag.TagCode).Problem is null;
            if (request.Decision == PhysicalQaStatus.Passed && (!tag.HasNfc || !qrGood || !nfcGood || request.PhysicalCondition != PhysicalTagCondition.Good))
                throw Validation("Passing requires a matching physical QR scan, NFC read, and good physical condition.");
            if (request.Decision == PhysicalQaStatus.Passed)
                await RequirePassableChipAsync(tag, nfc!.SerialNumber, ct);
            var before = Snapshot(tag);
            tag.QaStatus = request.Decision;
            tag.QaInspectionId = request.InspectionId;
            tag.QaVersion++;
            tag.QaQrUrl = qr?.Url;
            tag.QaNfcUrl = nfc?.Url;
            tag.QaQrVerifiedAt = qrGood ? qr!.At : null;
            tag.QaNfcVerifiedAt = nfcGood ? nfc!.At : null;
            tag.QaNfcSource = nfc?.Source;
            // The stored chip identity is the chip that passed. Only a pass sets
            // it, and nothing replaces it, so a second package carrying the same
            // code — read, held, then read again — can never become the chip
            // that passes. Every observed chip stays in the audit entry below.
            if (request.Decision == PhysicalQaStatus.Passed) tag.QaNfcSerialNumber ??= nfc!.SerialNumber;
            tag.QaPhysicalCondition = request.PhysicalCondition;
            tag.QaRemarks = remarks;
            tag.QaInspectedAt = _clock.GetUtcNow();
            tag.QaInspectedByAdminUserId = admin.Id;
            _audit.Append(admin.Id, ActorType.Admin, "tag-inventory.qa-inspected", "SmartTag", tag.Id, before,
                new { inspection = Snapshot(tag), observedNfcSerial = nfc?.SerialNumber, reportedNfcSerial = nfc?.ReportedSerial, status = tag.QaStatus?.ToString(),
                      condition = tag.QaPhysicalCondition.ToString(), qaRemarks = tag.QaRemarks });
            try { await _db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { throw Conflict(); }
            catch (DbUpdateException e) when (UniqueConstraintViolation.IsFor(e, "IX_SmartTags_QaInspectionId")) { throw Conflict(); }
            catch (DbUpdateException e) when (UniqueConstraintViolation.IsFor(e, "IX_SmartTags_QaNfcSerialNumber"))
            {
                // Another tag bound this chip between our check and our save.
                var holder = await _db.SmartTags.AsNoTracking().Where(t => t.Id != tagId && t.QaNfcSerialNumber == tag.QaNfcSerialNumber)
                    .Select(t => t.TagCode).FirstOrDefaultAsync(ct);
                throw ChipInUse(tag.QaNfcSerialNumber!, holder);
            }
        });
        return await LookupByIdAsync(tagId, ct);
    }

    // A pass binds the package's code to the chip that was read. It needs a
    // reliable chip ID, the same chip as any earlier pass of this code, and a
    // chip no other tag has passed with. Failed and Needs Review never bind or
    // replace a chip. A chip ID is an identifier, not proof of authenticity.
    private async Task RequirePassableChipAsync(SmartTag tag, string? observed, CancellationToken ct)
    {
        if (observed is null)
            throw new ApiException(400, "physical_qa_chip_id_missing",
                "The phone didn't report this NFC chip's ID, so the package can't pass. Read the chip again. If no chip ID appears, save Needs Review with a reason.");
        if (tag.QaNfcSerialNumber is { Length: > 0 } bound && bound != observed)
            throw new ApiException(409, "physical_qa_chip_mismatch",
                $"This code passed earlier on NFC chip {bound}, but chip {observed} was read now. Save Needs Review and separate the packages.");
        var holder = await _db.SmartTags.AsNoTracking().Where(t => t.Id != tag.Id && t.QaNfcSerialNumber == observed)
            .Select(t => t.TagCode).FirstOrDefaultAsync(ct);
        if (holder is not null) throw ChipInUse(observed, holder);
    }

    private static ApiException ChipInUse(string chip, string? holder) => new(409, "physical_qa_chip_in_use",
        $"NFC chip {chip} has already passed as {holder ?? "another tag"}. Save Needs Review and separate both packages.");

    private Capture? ReadEvidence(string? token, Guid adminId, SmartTag tag, int version, bool nfc)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        try
        {
            var capture = JsonSerializer.Deserialize<Capture>(_protector.Unprotect(token))!;
            var age = _clock.GetUtcNow() - capture.At;
            if (capture.AdminId != adminId || capture.TagId != tag.Id || capture.Version != version
                || age < -ClockSkewAllowance || age > CaptureLifetime
                || capture.Source != (nfc ? QaCaptureSource.WebNfc : QaCaptureSource.Camera))
                throw Validation("The reader result expired or belongs to another inspection. Read this tag again.");
            return capture;
        }
        catch (Exception e) when (e is CryptographicException or JsonException or NullReferenceException)
        { throw Validation("The reader result could not be verified. Read this tag again."); }
    }

    // Strict by design: the shipment's QR must open {site}/q/{code} and its NFC
    // chip {site}/n/{code}, on the configured site, with nothing appended. Every
    // refusal names the expected link so the operator can tell a wrong website,
    // a wrong route, an older printed-tag link and a wrong code apart.
    private (string? Code, string? Problem) CheckUrl(string value, QaCaptureSource source, string expectedCode)
    {
        var nfc = source != QaCaptureSource.Camera;
        var expected = ExpectedUrl(expectedCode, nfc);
        var expectedUri = new Uri(expected);
        var reader = nfc ? "NFC chip" : "QR code";
        if (!Uri.TryCreate(value, UriKind.Absolute, out var observed) || observed.Scheme is not ("http" or "https"))
            return (null, $"The {reader} does not contain a website link. Expected {expected}.");
        if (observed.UserInfo.Length > 0 || observed.Scheme != expectedUri.Scheme || observed.Authority != expectedUri.Authority)
            return (null, $"The {reader} opens {observed.GetLeftPart(UriPartial.Authority)}, not {expectedUri.GetLeftPart(UriPartial.Authority)}. Expected {expected}.");
        if (observed.Query.Length > 0 || observed.Fragment.Length > 0)
            return (null, $"The {reader} link has extra text after the tag code. Expected exactly {expected}.");
        var expectedRoute = nfc ? "n" : "q";
        var path = TagPath.Match(observed.AbsolutePath);
        if (!path.Success)
            return (null, $"The {reader} link is not in the expected format. Expected {expected}.");
        var route = path.Groups[1].Value;
        var code = path.Groups[2].Value;
        if (route != expectedRoute)
        {
            var problem = route.ToLowerInvariant() switch
            {
                "t" => $"The {reader} uses the older printed-tag link /t/. This shipment must use {expected}. Hold the package as Needs Review.",
                "q" or "n" when route == route.ToLowerInvariant() =>
                    $"The {reader} uses the {(route == "q" ? "QR" : "NFC")} link /{route}/ instead of /{expectedRoute}/. Expected {expected}.",
                _ => $"The {reader} link is not in the expected format. Expected {expected}.",
            };
            return (TagCodeFormat.IsMatch(code) ? code : null, problem);
        }
        if (!TagCodeFormat.IsMatch(code))
            return (null, $"The {reader} link does not end in a valid tag code. Expected {expected}.");
        return (code, code == expectedCode ? null : $"The {reader} belongs to {code}, but this package is {expectedCode}.");
    }

    private string ExpectedUrl(string code, bool nfc) => (nfc ? TagLinks.NfcUrl(_site.BaseUrl, code) : TagLinks.QrUrl(_site.BaseUrl, code))
        ?? throw new ApiException(503, "physical_qa_unavailable", "The expected tag website address is not configured. Contact your administrator.");

    public async Task<PhysicalQaCohortPreview> PreviewAsync(PhysicalQaCohortRequest request, CancellationToken ct) =>
        (await ReconcileAsync(request, ct)).Preview;

    private sealed record Reconciliation(PhysicalQaCohortPreview Preview, IReadOnlyDictionary<string, PhysicalQaCommitment> Commitments,
        string Fingerprint, string? ShipmentConflict);
    private sealed record AllocationView(Guid SmartTagId, MerchantAllocationStatus Status, string MerchantOrderNumber,
        MerchantOrderFulfilmentStatus Fulfilment);

    private async Task<Reconciliation> ReconcileAsync(PhysicalQaCohortRequest request, CancellationToken ct)
    {
        ValidateCohort(request);
        var shipment = request.ShipmentReference.Trim();
        var entries = request.TagCodes.Select(NormalizeCode).ToArray();
        var occurrences = entries.GroupBy(c => c, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count(), StringComparer.Ordinal);
        var duplicates = occurrences.Where(o => o.Value > 1).OrderBy(o => o.Key, StringComparer.Ordinal)
            .Select(o => new PhysicalQaManifestDuplicate(o.Key, o.Value)).ToArray();
        var invalid = occurrences.Keys.Where(c => !TagCodeFormat.IsMatch(c)).Order(StringComparer.Ordinal).ToArray();
        var codes = occurrences.Keys.Where(c => TagCodeFormat.IsMatch(c)).ToArray();

        var tags = await _db.SmartTags.AsNoTracking()
            .Include(t => t.Batch).Include(t => t.Order)
            .Include(t => t.ProductVariant).ThenInclude(v => v!.TagProduct)
            .Where(t => codes.Contains(t.TagCode) && t.DeletedAt == null).ToListAsync(ct);
        var found = tags.Select(t => t.TagCode).ToHashSet(StringComparer.Ordinal);
        var missing = codes.Where(c => !found.Contains(c)).Order(StringComparer.Ordinal).ToArray();

        var ids = tags.Select(t => t.Id).ToArray();
        var allocations = (await _db.MerchantOrderAllocatedTags.AsNoTracking()
            .Where(a => ids.Contains(a.SmartTagId) && a.ReleasedAt == null)
            .Select(a => new AllocationView(a.SmartTagId, a.Status, a.MerchantOrder!.MerchantOrderNumber, a.MerchantOrder.FulfilmentStatus))
            .ToListAsync(ct)).GroupBy(a => a.SmartTagId).ToDictionary(g => g.Key, g => g.First());

        var problems = new List<string>();
        if (entries.Length != request.ExpectedCount || occurrences.Count != request.ExpectedCount)
            problems.Add($"The manifest has {entries.Length} entries and {occurrences.Count} distinct codes, but {request.ExpectedCount} packages are expected.");
        if (duplicates.Length > 0) problems.Add($"{duplicates.Length} codes appear more than once in the manifest. Check those packages before enrolling.");
        if (invalid.Length > 0) problems.Add($"{invalid.Length} manifest entries are not valid tag codes.");
        if (missing.Length > 0) problems.Add($"{missing.Length} manifest codes are not in inventory.");

        // A shipment reference names exactly one manifest, fixed at enrollment.
        var fingerprint = ManifestFingerprint(occurrences.Keys);
        var existing = await _db.PhysicalQaShipments.AsNoTracking().SingleOrDefaultAsync(x => x.ShipmentReference == shipment, ct);
        string? shipmentConflict = null;
        if (existing is not null && !SameManifest(existing, fingerprint, request.ExpectedCount))
            shipmentConflict = DifferentManifest(existing);
        else if (existing is null)
        {
            var outside = await _db.SmartTags.CountAsync(t => t.QaShipmentReference == shipment && !codes.Contains(t.TagCode), ct);
            if (outside > 0)
                shipmentConflict = $"{outside} tags outside this manifest already use shipment reference {shipment}. Choose a different shipment reference.";
        }
        if (shipmentConflict is not null) problems.Insert(0, shipmentConflict);

        var commitments = new Dictionary<string, PhysicalQaCommitment>(StringComparer.Ordinal);
        var alreadyEnrolled = 0;
        var eligible = 0;
        foreach (var tag in tags.OrderBy(t => t.TagCode, StringComparer.Ordinal))
        {
            // Already in this shipment: enrollment leaves it alone, whatever has
            // happened to it since, so repeating the same manifest is harmless.
            if (tag.QaStatus is not null && tag.QaShipmentReference == shipment) { alreadyEnrolled++; eligible++; continue; }
            allocations.TryGetValue(tag.Id, out var allocation);
            var (reason, commitment) = Assess(tag, allocation);
            if (reason is null && tag.QaStatus is not null)
                reason = $"is already enrolled for inspection in {tag.QaShipmentReference ?? "another shipment"}";
            if (reason is not null) { problems.Add($"{tag.TagCode}: {reason}."); continue; }
            eligible++;
            if (commitment is not null) commitments[tag.TagCode] = commitment;
        }

        var batches = await BatchBreakdownAsync(tags, found, ct);
        var skus = tags.GroupBy(t => t.ProductVariantId)
            .Select(g => g.First().ProductVariant is { } v
                ? new PhysicalQaSkuBreakdown(v.Sku, v.TagProduct?.Name, v.DisplayName, v.TagVariant, g.Count())
                : new PhysicalQaSkuBreakdown(null, null, null, null, g.Count()))
            .OrderBy(s => s.Sku, StringComparer.Ordinal).ToArray();

        var variants = tags.Where(t => t.ProductVariantId != null).Select(t => t.ProductVariantId!.Value).Distinct().ToArray();
        var reservations = await _db.TagOrderItems.Where(i => i.ProductVariantId != null && variants.Contains(i.ProductVariantId.Value) && i.Order.Status != OrderStatus.Cancelled)
            .Select(i => new { i.Quantity, Assigned = i.AssignedTags.Count(t => t.ArchivedAt == null && t.DeletedAt == null &&
                (t.Status == SmartTagStatus.Pending || t.Status == SmartTagStatus.Preparing || t.Status == SmartTagStatus.Delivered || t.Status == SmartTagStatus.Active)) }).ToListAsync(ct);
        var outstanding = reservations.Sum(r => Math.Max(0, r.Quantity - r.Assigned));

        var truncated = duplicates.Length > ReconciliationListLimit || invalid.Length > ReconciliationListLimit
            || missing.Length > ReconciliationListLimit || commitments.Count > ReconciliationListLimit || problems.Count > ReconciliationListLimit
            || batches.Any(b => b.NotInManifest > b.NotInManifestCodes.Count);
        var preview = new PhysicalQaCohortPreview(request.ExpectedCount, entries.Length, occurrences.Count, tags.Count, eligible,
            alreadyEnrolled, outstanding, Cap(duplicates), Cap(invalid), Cap(missing), batches, skus,
            Cap(commitments.Values.OrderBy(c => c.TagCode, StringComparer.Ordinal)), Cap(problems),
            commitments.Count > 0 || outstanding > 0, truncated);
        return new Reconciliation(preview, commitments, fingerprint, shipmentConflict);
    }

    // Decides whether an unenrolled tag can join a QA shipment. Unshipped
    // commercial promises are allowed and kept: the tag is held, and every
    // shipping step refuses it until it passes. Anything shipped, activated,
    // inactive or inconsistent stays a blocking exception.
    private static (string? Reason, PhysicalQaCommitment? Commitment) Assess(SmartTag tag, AllocationView? allocation)
    {
        if (tag.ArchivedAt.HasValue || tag.Status == SmartTagStatus.Archived) return ("is archived", null);
        if (!tag.HasNfc) return ("is not a QR + NFC Smart Tag", null);
        if (tag.ProductVariantId is null) return ("has no SKU mapping", null);
        if (tag.ActivatedAt.HasValue || tag.Status is SmartTagStatus.Active or SmartTagStatus.Delivered)
            return ("has already been delivered or activated", null);
        if (tag.Status is SmartTagStatus.Lost or SmartTagStatus.Disabled or SmartTagStatus.Replaced)
            return ($"is {tag.Status.ToString().ToLowerInvariant()}", null);
        if (tag.FulfilmentStatus is not (TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed))
            return ("has already been sent onward", null);

        if (tag.Status == SmartTagStatus.Unclaimed)
        {
            if (tag.OwnerUserId.HasValue || tag.PetId.HasValue || tag.OrderId.HasValue || tag.OrderItemId.HasValue)
                return ("is linked to an owner, pet or order but still shows as unclaimed. Review it before enrolling", null);
            if (allocation is null) return (null, null);
            if (allocation.Status != MerchantAllocationStatus.Allocated
                || allocation.Fulfilment is MerchantOrderFulfilmentStatus.Shipped or MerchantOrderFulfilmentStatus.Delivered)
                return ($"has already been sent to a merchant on {allocation.MerchantOrderNumber}", null);
            return (null, new PhysicalQaCommitment(tag.TagCode, PhysicalQaCommitmentKind.MerchantOrder,
                allocation.MerchantOrderNumber, allocation.Fulfilment.ToString()));
        }

        if (tag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing)
        {
            if (allocation is not null) return ("is held by both a retail order and a merchant order. Review it before enrolling", null);
            if (tag.Order is not { } order) return ("is assigned without an order. Review it before enrolling", null);
            if (order.Status is not (OrderStatus.PaymentConfirmed or OrderStatus.PreparingTag or OrderStatus.ReadyToShip))
                return ($"belongs to order {order.OrderNumber}, which is {order.Status}", null);
            return (null, new PhysicalQaCommitment(tag.TagCode, PhysicalQaCommitmentKind.RetailOrder, order.OrderNumber, order.Status.ToString()));
        }

        return ("is not available stock", null);
    }

    private async Task<PhysicalQaBatchBreakdown[]> BatchBreakdownAsync(IReadOnlyCollection<SmartTag> tags, IReadOnlySet<string> manifest, CancellationToken ct)
    {
        var batchIds = tags.Where(t => t.BatchId != null).Select(t => t.BatchId!.Value).Distinct().ToArray();
        var batchCodes = (await _db.SmartTags.AsNoTracking()
            .Where(t => t.BatchId != null && batchIds.Contains(t.BatchId.Value) && t.DeletedAt == null)
            .Select(t => new { BatchId = t.BatchId!.Value, t.TagCode }).ToListAsync(ct))
            .GroupBy(t => t.BatchId).ToDictionary(g => g.Key, g => g.Select(t => t.TagCode).ToArray());
        var rows = tags.GroupBy(t => t.BatchId).Select(g =>
        {
            if (g.Key is not { } batchId) return new PhysicalQaBatchBreakdown(null, g.Count(), g.Count(), 0, []);
            var all = batchCodes.GetValueOrDefault(batchId) ?? [];
            var outside = all.Where(c => !manifest.Contains(c)).Order(StringComparer.Ordinal).ToArray();
            return new PhysicalQaBatchBreakdown(g.First().Batch?.BatchNo, g.Count(), all.Length, outside.Length, Cap(outside));
        });
        return rows.OrderBy(b => b.BatchNo, StringComparer.Ordinal).ToArray();
    }

    public async Task<PhysicalQaCohortPreview> EnrollAsync(Guid? userId, PhysicalQaCohortRequest request, CancellationToken ct)
    {
        var admin = await AdminAsync(userId, ct);
        ValidateCohort(request);
        var shipment = request.ShipmentReference.Trim();
        var codes = request.TagCodes.Select(NormalizeCode).Distinct(StringComparer.Ordinal).ToArray();
        var fingerprint = ManifestFingerprint(codes);
        var lostRace = false;
        await _db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            _db.ChangeTracker.Clear();
            lostRace = false;
            var variants = await _db.SmartTags.Where(t => codes.Contains(t.TagCode) && t.ProductVariantId != null).Select(t => t.ProductVariantId!.Value).Distinct().ToListAsync(ct);
            await using var stockLock = await LockStockAsync(variants, ct);
            await using var transaction = _db.Database.IsRelational() ? await _db.Database.BeginTransactionAsync(ct) : null;
            // An enrolled shipment is immutable: the same manifest again is a
            // harmless retry, and any other membership or count is refused.
            var existing = await _db.PhysicalQaShipments.AsNoTracking().SingleOrDefaultAsync(x => x.ShipmentReference == shipment, ct);
            if (existing is not null)
            {
                if (!SameManifest(existing, fingerprint, request.ExpectedCount)) throw ShipmentConflict(DifferentManifest(existing));
                return;
            }
            // Tracked before reconciling: an assignment, allocation or shipment
            // committed after this read fails the save on the row version.
            var tags = await _db.SmartTags.Where(t => codes.Contains(t.TagCode) && t.DeletedAt == null).ToListAsync(ct);
            var reconciliation = await ReconcileAsync(request, ct);
            var preview = reconciliation.Preview;
            if (reconciliation.ShipmentConflict is not null) throw ShipmentConflict(reconciliation.ShipmentConflict);
            if (preview.Problems.Count > 0)
                throw new ApiException(409, "qa_cohort_blocked", "Resolve the manifest exceptions before enrollment.",
                    new Dictionary<string, string[]> { ["tagCodes"] = preview.Problems.ToArray() });
            if (preview.RequiresAcknowledgement && !request.AcknowledgeCommitments)
                throw new ApiException(409, "qa_commitments_require_review",
                    "Review the existing orders and reserved stock, then confirm before enrollment.");
            var enrolled = 0;
            foreach (var tag in tags.Where(t => t.QaStatus == null))
            {
                // Enrollment only holds the tag. Its owner, pet, order, merchant
                // allocation, lifecycle and fulfilment stay exactly as they are.
                tag.QaStatus = PhysicalQaStatus.Pending;
                tag.QaShipmentReference = shipment;
                tag.QaVersion++;
                enrolled++;
                reconciliation.Commitments.TryGetValue(tag.TagCode, out var commitment);
                _audit.Append(admin.Id, ActorType.Admin, "tag-inventory.qa-enrolled", "SmartTag", tag.Id, null, new
                {
                    tag.TagCode, tag.QaShipmentReference,
                    commitment = commitment is null ? null : $"{commitment.Kind} {commitment.Reference} ({commitment.Status})",
                });
            }
            var record = new PhysicalQaShipment
            {
                ShipmentReference = shipment, ExpectedCount = request.ExpectedCount, ManifestSha256 = fingerprint,
                EnrolledByAdminUserId = admin.Id, EnrolledAt = _clock.GetUtcNow(),
            };
            _db.PhysicalQaShipments.Add(record);
            _audit.Append(admin.Id, ActorType.Admin, "tag-inventory.qa-cohort-enrolled", "PhysicalQaShipment", record.Id, null, new
            {
                shipment, manifestSha256 = fingerprint, enrolled, preview.ExpectedCount, preview.AlreadyEnrolled,
                commitments = reconciliation.Commitments.Count, preview.OutstandingRetailReservations,
                acknowledged = request.AcknowledgeCommitments,
            });
            try { await _db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { throw Conflict(); }
            catch (DbUpdateException e) when (UniqueConstraintViolation.IsFor(e, "IX_PhysicalQaShipments_ShipmentReference"))
            {
                // Another enrollment created this shipment first; nothing of ours
                // was written. Decide below whether it was the same manifest.
                lostRace = true;
                return;
            }
            if (transaction is not null) await transaction.CommitAsync(ct);
        });
        _db.ChangeTracker.Clear();
        if (lostRace)
        {
            var winner = await _db.PhysicalQaShipments.AsNoTracking().SingleAsync(x => x.ShipmentReference == shipment, ct);
            if (!SameManifest(winner, fingerprint, request.ExpectedCount)) throw ShipmentConflict(DifferentManifest(winner));
        }
        return await PreviewAsync(request, ct);
    }

    public async Task<IReadOnlyCollection<PhysicalQaHistoryItem>> HistoryAsync(Guid tagId, CancellationToken ct) =>
        await _db.AuditLogs.AsNoTracking().Where(a => a.Entity == "SmartTag" && a.EntityId == tagId && a.Action.StartsWith("tag-inventory.qa-"))
            .OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id).Take(100)
            .Select(a => new PhysicalQaHistoryItem(a.Id, a.Action, a.CreatedAt,
                _db.AdminUsers.Where(u => u.Id == a.ActorId).Select(u => u.User.DisplayName).FirstOrDefault(), a.NewValue)).ToArrayAsync(ct);

    public async Task<AdminTagInventoryExport> ExportAsync(Guid? userId, PhysicalQaQuery query, CancellationToken ct)
    {
        var admin = await AdminAsync(userId, ct);
        var rows = await Filter(query).OrderBy(t => t.TagCode).Take(10001).ToListAsync(ct);
        if (rows.Count > 10000) throw Validation("Narrow the inspection export to 10,000 tags or fewer.");
        // CRLF throughout, whatever the host's line ending, so spreadsheet
        // tools read every row the same way.
        var csv = new StringBuilder("Tag Code,Batch,SKU,Shipment,QA Status,QR Verified (UTC),NFC Verified (UTC),NFC Reader,Physical Condition,Remarks,Inspected (UTC),Inspector,Observed QR URL,Observed NFC URL,NFC Serial\r\n");
        foreach (var tag in rows)
        {
            var values = new[] { tag.TagCode, tag.Batch?.BatchNo ?? "", tag.ProductVariant?.Sku ?? "", tag.QaShipmentReference ?? "", tag.QaStatus?.ToString() ?? "",
                Utc(tag.QaQrVerifiedAt), Utc(tag.QaNfcVerifiedAt), tag.QaNfcSource?.ToString() ?? "", tag.QaPhysicalCondition.ToString(),
                tag.QaRemarks ?? "", Utc(tag.QaInspectedAt), tag.QaInspectedByAdminUser?.User.DisplayName ?? "", tag.QaQrUrl ?? "", tag.QaNfcUrl ?? "", tag.QaNfcSerialNumber ?? "" };
            csv.Append(string.Join(',', values.Select(AdminExportSanitizer.Csv))).Append("\r\n");
        }
        _audit.Append(admin.Id, ActorType.Admin, "tag-inventory.qa-export", "SmartTag", null, null, new { rowCount = rows.Count, query.Batch, query.Sku, query.Shipment });
        await _db.SaveChangesAsync(ct);
        return new AdminTagInventoryExport("mypetlink-physical-qa.csv", "text/csv; charset=utf-8", Encoding.UTF8.GetBytes(csv.ToString()));
    }

    private async Task<SqlServerInventoryReservationLock?> LockStockAsync(IReadOnlyCollection<Guid> variantIds, CancellationToken ct)
    {
        if (!_db.Database.IsSqlServer() || variantIds.Count == 0) return null;
        try { return await SqlServerInventoryReservationLock.AcquireAsync(_db, variantIds, ct); }
        catch (ApiException e) when (e.Code == "inventory_busy")
        {
            throw new ApiException(409, "physical_qa_busy", "Stock for this tag is being updated right now. Wait a moment, then try again.");
        }
    }

    private static void ValidateCohort(PhysicalQaCohortRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ShipmentReference) || request.ShipmentReference.Trim().Length > 100
            || request.TagCodes is null || request.TagCodes.Length is < 1 or > 10000
            || request.TagCodes.Any(c => string.IsNullOrWhiteSpace(c) || c.Length > 32) || request.ExpectedCount is < 1 or > 10000)
            throw Validation("Enter a shipment reference, the expected package count and a manifest of up to 10,000 tag codes with no blank entries.");
    }

    private static T[] Cap<T>(IEnumerable<T> values) => values.Take(ReconciliationListLimit).ToArray();

    // Computed by the server from the normalized, distinct, ordinally sorted
    // codes, so ordering, case and surrounding spaces never change it.
    internal static string ManifestFingerprint(IEnumerable<string> normalizedCodes) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n", normalizedCodes.Order(StringComparer.Ordinal)))));
    private static bool SameManifest(PhysicalQaShipment shipment, string fingerprint, int expectedCount) =>
        shipment.ManifestSha256 == fingerprint && shipment.ExpectedCount == expectedCount;
    private static string DifferentManifest(PhysicalQaShipment shipment) =>
        $"Shipment {shipment.ShipmentReference} was enrolled on {shipment.EnrolledAt.UtcDateTime:yyyy-MM-dd} with a different manifest of {shipment.ExpectedCount} packages. "
        + "A shipment's manifest can't be changed; use a new shipment reference for different packages.";
    private static ApiException ShipmentConflict(string message) => new(409, "physical_qa_shipment_conflict", message);
    private static string Utc(DateTimeOffset? value) => value?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture) ?? "";
    private async Task<PhysicalQaItem> LookupByIdAsync(Guid id, CancellationToken ct) => Map(await Graph().SingleAsync(t => t.Id == id, ct));
    private PhysicalQaItem Map(SmartTag t) => new(t.Id, t.TagCode, t.Batch?.BatchNo, t.ProductVariant?.Sku, t.QaShipmentReference,
        t.QaStatus, t.QaVersion, ExpectedUrl(t.TagCode, false), ExpectedUrl(t.TagCode, true), t.QaQrUrl, t.QaNfcUrl, t.QaQrVerifiedAt, t.QaNfcVerifiedAt,
        t.QaNfcSource, t.QaNfcSerialNumber, t.QaPhysicalCondition, t.QaRemarks, t.QaInspectedAt, t.QaInspectedByAdminUser?.User.DisplayName, CanInspect(t));
    // Enrolled stock that has not left our hands. Unshipped retail and merchant
    // commitments stay inspectable, so a result can still hold them back.
    private static bool CanInspect(SmartTag t) => t.QaStatus != null && t.DeletedAt == null && t.ArchivedAt == null && t.ActivatedAt == null
        && t.FulfilmentStatus is TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed && t.Status is SmartTagStatus.Unclaimed or SmartTagStatus.Pending or SmartTagStatus.Preparing;
    private static object Snapshot(SmartTag t) => new { t.TagCode, status = t.QaStatus?.ToString(), condition = t.QaPhysicalCondition.ToString(),
        t.QaQrUrl, t.QaNfcUrl, t.QaQrVerifiedAt, t.QaNfcVerifiedAt, nfcSource = t.QaNfcSource?.ToString(), t.QaNfcSerialNumber, t.QaRemarks, t.QaInspectedAt, t.QaVersion };
    private async Task<AdminUser> AdminAsync(Guid? userId, CancellationToken ct) => await _db.AdminUsers.AsNoTracking().SingleOrDefaultAsync(a => a.UserId == userId && a.IsActive && a.DisabledAt == null, ct)
        ?? throw new ApiException(userId.HasValue ? 403 : 401, "forbidden", "Active administrator access is required.");
    // Web NFC reports "04:a2:3b:…"; other readers report "04A23B…". Both become
    // uppercase hex with no separators. Anything that is not a 4–10 byte
    // hexadecimal ID (or is all zeros) is treated as no chip ID at all.
    internal static string? NormalizeChipId(string? reported)
    {
        if (string.IsNullOrWhiteSpace(reported)) return null;
        var hex = new string(reported.Where(c => c is not (':' or '-') && !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();
        return hex.Length is >= 8 and <= 20 && hex.Length % 2 == 0 && hex.All(Uri.IsHexDigit) && hex.Any(c => c != '0') ? hex : null;
    }
    private static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();
    private static ApiException Validation(string message) => new(400, "physical_qa_invalid", message);
    private static ApiException Conflict() => new(409, "physical_qa_changed", "This inspection changed. Reload the tag and review its latest result.");
}
