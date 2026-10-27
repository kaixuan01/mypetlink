using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed partial class ConsignmentService(MyPetLinkDbContext db, IAuditLogService audit,
    IBusinessIdentityService identity, IDocumentNumberService numbers, TimeProvider time, IAdminAccessResolver? access = null)
{
    public async Task<(IReadOnlyList<ConsignmentAgreementResponse> Items, int Total)> AgreementsAsync(
        int page, int pageSize, Guid? merchantId, CancellationToken ct)
    {
        Page(page, pageSize);
        var q = db.ConsignmentAgreements.AsNoTracking().Include(a => a.Merchant).AsQueryable();
        if (merchantId.HasValue) q = q.Where(a => a.MerchantId == merchantId);
        var count = await q.CountAsync(ct);
        return ((await q.OrderByDescending(a => a.CreatedAt).ThenBy(a => a.Id)
            .Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct)).Select(MapAgreement).ToArray(), count);
    }

    public async Task<ConsignmentAgreementResponse> SaveAgreementAsync(Guid? actor, Guid? id,
        SaveConsignmentAgreementRequest r, string? token, CancellationToken ct)
    {
        if (r.PartnerCommissionPercentage is null) throw Bad("Enter the agreed partner commission percentage explicitly.");
        if (r.MerchantId == Guid.Empty || r.Reference?.Length > 100 || r.IdempotencyKey?.Length > 80
            || r.PartnerCommissionPercentage < 0 || r.PartnerCommissionPercentage > 100
            || decimal.Round(r.PartnerCommissionPercentage.Value,2) != r.PartnerCommissionPercentage
            || r.PaymentDeadlineDays is < 0 or > 365
            || r.EffectiveTo.HasValue && (!r.EffectiveFrom.HasValue || r.EffectiveTo <= r.EffectiveFrom)
            || new[] { r.DurationTerms, r.SettlementFrequency, r.DiscountTerms, r.ReturnTerms, r.LossTerms,
                r.SignedAgreementReference, r.ExternalTrackerReference }.Any(s => s?.Length > 2000))
            throw Bad("Check the agreement details, percentage, dates and payment deadline.");
        var requested = Trim(r.Reference);
        var creationKey = Trim(r.IdempotencyKey);
        // What this create request asked for, so a retry of the same request can be told
        // apart from a different request that reused the key.
        var creationFingerprint = id.HasValue || creationKey is null ? null
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r with { IdempotencyKey = null }))));
        Guid saved = Guid.Empty;
        await RunAsync(actor, async admin => {
            if (creationKey is not null && !id.HasValue)
            {
                var earlier = await db.ConsignmentAgreements.Where(x => x.CreationKey == creationKey)
                    .Select(x => new { x.Id, x.Reference, x.CreationRequestFingerprint }).SingleOrDefaultAsync(ct);
                if (earlier is not null)
                {
                    if (earlier.CreationRequestFingerprint != creationFingerprint)
                        throw Conflict($"This form already created draft {earlier.Reference}. Open that draft to make further changes.");
                    saved = earlier.Id;   // A retried request: hand back the draft it created.
                    return;
                }
            }
            var merchant = await db.Merchants.SingleOrDefaultAsync(m => m.Id == r.MerchantId && m.IsActive, ct)
                ?? throw Bad("Choose an active merchant.");
            ConsignmentAgreement a;
            if (id.HasValue)
            {
                a = await db.ConsignmentAgreements.Include(x => x.Merchant).Include(x => x.DraftContributors).SingleOrDefaultAsync(x => x.Id == id, ct)
                    ?? throw Missing();
                Token(a.RowVersion, token);
                if (a.Status != ConsignmentAgreementStatus.Draft || a.MerchantId != r.MerchantId || requested is not null && a.Reference != requested)
                    throw Conflict("Approved terms cannot be edited. Create a new agreement version.");
            }
            else
            {
                var version = 1;
                string reference;
                if (r.SupersedesAgreementId.HasValue)
                {
                    // A revision keeps its agreement's reference; only the version moves on.
                    var prior = await db.ConsignmentAgreements.SingleOrDefaultAsync(x => x.Id == r.SupersedesAgreementId, ct)
                        ?? throw Missing();
                    if (prior.MerchantId != r.MerchantId || requested is not null && prior.Reference != requested)
                        throw Bad("A new version must use the same merchant and agreement reference.");
                    reference = prior.Reference;
                    version = (await db.ConsignmentAgreements.Where(x => x.MerchantId == r.MerchantId && x.Reference == prior.Reference)
                        .MaxAsync(x => (int?)x.Version, ct) ?? 0) + 1;
                }
                else
                {
                    if (requested is not null)
                        throw Bad("Agreement references are assigned automatically when the draft is saved.");
                    reference = await NextAgreementReferenceAsync(merchant, admin, ct);
                    if (r.DefaultTermsRevision is { } revision && !await db.ConsignmentDefaultTermsRevisions.AnyAsync(x => x.Revision == revision && x.IsActive, ct))
                        throw Bad("Those default terms are not a confirmed revision. Reload the form and try again.");
                }
                a = new ConsignmentAgreement { MerchantId = merchant.Id, Merchant = merchant,
                    Reference = reference, Version = version, SupersedesAgreementId = r.SupersedesAgreementId,
                    CreationKey = creationKey, CreationRequestFingerprint = creationFingerprint,
                    // A revision starts from its predecessor's terms, never the current defaults.
                    DefaultTermsRevision = r.SupersedesAgreementId.HasValue ? null : r.DefaultTermsRevision };
                a.DraftContributorHistoryComplete = true;
                db.ConsignmentAgreements.Add(a);
            }
            var before = MapAgreement(a);
            var priorTerms = DraftTerms(a);
            var priorFingerprint = TermsFingerprint(a);
            a.PartnerCommissionPercentage = r.PartnerCommissionPercentage.Value;
            a.EffectiveFrom = r.EffectiveFrom?.ToUniversalTime(); a.EffectiveTo = r.EffectiveTo?.ToUniversalTime();
            a.DurationTerms = Trim(r.DurationTerms); a.SettlementFrequency = Trim(r.SettlementFrequency);
            a.PaymentDeadlineDays = r.PaymentDeadlineDays; a.DiscountTerms = Trim(r.DiscountTerms);
            a.ReturnTerms = Trim(r.ReturnTerms); a.LossTerms = Trim(r.LossTerms);
            a.SignedAgreementReference = Trim(r.SignedAgreementReference); a.ExternalTrackerReference = Trim(r.ExternalTrackerReference);
            // A partner has signed these exact terms. Changing them is an amendment: a new version, signed again.
            if (id.HasValue && priorFingerprint != TermsFingerprint(a)
                && await db.ConsignmentSignedAgreements.AnyAsync(s => s.AgreementId == a.Id, ct))
                throw Conflict("The partner has signed these terms. Create a new agreement version to change them; the signed copy stays with this version.");
            if ((!id.HasValue || priorTerms != DraftTerms(a))
                && a.DraftContributors.All(c => c.AdminUserId != admin))
                a.DraftContributors.Add(new ConsignmentDraftContributor { AgreementId=a.Id, AdminUserId=admin,
                    FirstContributedAt=time.GetUtcNow(), IsCreator=!id.HasValue });
            a.UpdatedByAdminUserId = admin; saved = a.Id;
            audit.Append(admin, ActorType.Admin, "consignment.agreement-saved", "ConsignmentAgreement", a.Id, before, MapAgreement(a));
        }, ct);
        return MapAgreement(await db.ConsignmentAgreements.AsNoTracking().Include(x => x.Merchant).SingleAsync(x => x.Id == saved, ct));
    }

    public async Task<ConsignmentAgreementResponse> AgreementActionAsync(Guid? actor, Guid id,
        string action, ConsignmentActionRequest r, CancellationToken ct)
    {
        ValidateAction(r);
        await RunAsync(actor, async admin => {
            var a = await db.ConsignmentAgreements.Include(x => x.Merchant).Include(x => x.DraftContributors).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(a.RowVersion, r.ConcurrencyToken);
            var before = a.Status;
            if (action == "approve")
            {
                if (a.Status != ConsignmentAgreementStatus.Draft || Pending(a).Count > 0)
                    throw Conflict("Confirm every pending term and signed agreement reference before approval.");
                if (!a.DraftContributorHistoryComplete || a.DraftContributors.Count == 0)
                    throw Conflict("This draft has incomplete contributor history. Create a new version for independent review.");
                var self = a.DraftContributors.Any(c => c.AdminUserId == admin);
                var review = await Review(admin,self,"approve",r,a.Id,null,ct);
                if(self && !string.Equals(r.SelfReview!.ExternalEvidenceReference.Trim(),a.SignedAgreementReference?.Trim(),StringComparison.OrdinalIgnoreCase))
                    throw Bad("Self-review must reference this version's actual partner acceptance or signed agreement.");
                a.ApprovalReviewMode = review.ReviewMode;
                if (!a.Merchant.IsActive || a.EffectiveTo <= time.GetUtcNow()) throw Conflict("This agreement is inactive or expired.");
                if (a.SupersedesAgreementId.HasValue)
                {
                    var priorVersions = await db.ConsignmentAgreements.Where(x => x.MerchantId == a.MerchantId
                        && x.Reference == a.Reference && x.Id != a.Id && x.Status == ConsignmentAgreementStatus.Active).ToListAsync(ct);
                    if (priorVersions.Any(x => x.Version >= a.Version)) throw Conflict("A newer version is already approved. Create a revision of that agreement.");
                    var priorIds = priorVersions.Select(x => x.Id).ToArray();
                    // Reporting under earlier versions ends where this one starts. Reports already covering
                    // later dates are never shortened or reassigned: the revision must start after them.
                    if (a.EffectiveFrom is { } successorStart)
                    {
                        var earlierVersions = db.ConsignmentAgreements.Where(x => x.MerchantId == a.MerchantId && x.Reference == a.Reference
                            && x.Version < a.Version).Select(x => x.Id);
                        var reportedTo = await db.ConsignmentSalesReports.Where(r => earlierVersions.Contains(r.AgreementId)
                            && r.Status != ConsignmentSalesReportStatus.Voided && r.Status != ConsignmentSalesReportStatus.Superseded
                            && r.PeriodEndExclusive > successorStart).MaxAsync(r => (DateTimeOffset?)r.PeriodEndExclusive, ct);
                        if (reportedTo is { } covered)
                        {
                            var day = covered.ToOffset(TimeSpan.FromHours(8)).ToString("d MMM yyyy", System.Globalization.CultureInfo.InvariantCulture);
                            throw Conflict($"Sales reports under an earlier version already cover dates before {day}. Start this version on or after {day}, or correct those reports first.");
                        }
                    }
                    if (await db.ConsignmentDispatches.AnyAsync(x => priorIds.Contains(x.AgreementId) && x.Status == ConsignmentDispatchStatus.Reserved,ct))
                        throw Conflict("Dispatch or cancel the existing reservations before approving revised terms. Their signed terms will not change automatically.");
                    foreach (var prior in priorVersions)
                    {
                        prior.Status = ConsignmentAgreementStatus.Closed;
                        prior.UpdatedByAdminUserId = admin;
                        audit.Append(admin, ActorType.Admin, "consignment.agreement-superseded", "ConsignmentAgreement", prior.Id,
                            new { status = "Active" }, new { status = "Closed", successor = a.Id });
                    }
                    // Release the filtered active-version key before activating its successor.
                    // Both saves remain inside the same retryable transaction.
                    await db.SaveChangesAsync(ct);
                }
                a.Status = ConsignmentAgreementStatus.Active;
                a.ApprovedByAdminUserId = admin; a.ApprovedAt = time.GetUtcNow();
            }
            else if (action == "close") {
                if (await db.ConsignmentUnits.AnyAsync(u => u.Dispatch.AgreementId == a.Id
                    && u.Status != ConsignmentUnitStatus.Released && u.Status != ConsignmentUnitStatus.ExternalHandover
                    && u.Status != ConsignmentUnitStatus.WrittenOff,ct))
                    throw Conflict("Reconcile partner-held stock, reservations and returned units before closing this agreement.");
                a.Status = ConsignmentAgreementStatus.Closed;
            }
            else throw Bad("Choose a supported agreement action.");
            a.UpdatedByAdminUserId = admin;
            audit.Append(admin, ActorType.Admin, "consignment.agreement-" + action, "ConsignmentAgreement", a.Id,
                new { status = before.ToString() }, new { status = a.Status.ToString(), r.Reference });
        }, ct);
        return MapAgreement(await db.ConsignmentAgreements.AsNoTracking().Include(x => x.Merchant).SingleAsync(x => x.Id == id, ct));
    }

    public async Task<(IReadOnlyList<ConsignmentDispatchResponse> Items, int Total)> DispatchesAsync(
        int page, int pageSize, Guid? agreementId, CancellationToken ct)
    {
        Page(page,pageSize);
        var q = Graph();
        if (agreementId.HasValue) q = q.Where(d => d.AgreementId == agreementId);
        var count = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(d => d.CreatedAt).ThenBy(d => d.Id).Skip((page-1)*pageSize).Take(pageSize).ToListAsync(ct);
        return (rows.Select(d => Map(d, false)).ToArray(), count);
    }
    public async Task<ConsignmentDispatchResponse> GetAsync(Guid id, bool includeCodes, CancellationToken ct)
    {
        var d = Map(await Graph().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw Missing(), includeCodes);
        var unitIds = d.Units.Select(u => u.Id).ToArray();
        var tracked = (await db.ConsignmentStockLedgerEntries.Where(e => e.SourceType == ConsignmentLedgerSources.Unit
            && e.EntryType == ConsignmentLedgerEntryTypes.UnitCountedAtPartner && e.ReversesEntryId == null && unitIds.Contains(e.SourceLineId))
            .Select(e => e.SourceLineId).ToListAsync(ct)).ToHashSet();
        return d with { StockTracked = tracked.Count > 0, Units = d.Units.Select(u => u with { StockTracked = tracked.Contains(u.Id) }).ToArray(),
            DeliveryOrder = await DeliveryOrderSummaryAsync(id, ct) };
    }

    public async Task<ConsignmentDispatchResponse> ReserveAsync(Guid? actor, ReserveConsignmentRequest r, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(r.IdempotencyKey) || r.IdempotencyKey.Length > 80
            || string.IsNullOrWhiteSpace(r.Destination) || r.Destination.Length > 2000
            || string.IsNullOrWhiteSpace(r.ExternalTrackerReference) || r.ExternalTrackerReference.Length > 2000
            || r.Lines is null || r.Lines.Count is < 1 or > 50
            || r.Lines.Any(l => l is null || l.Quantity is < 1 or > 1000 || l.ProductVariantId == Guid.Empty
                || l.SmartTagIds is not null && (l.SmartTagIds.Count != l.Quantity || l.SmartTagIds.Distinct().Count() != l.Quantity))
            || r.Lines.Select(l => l.ProductVariantId).Distinct().Count() != r.Lines.Count
            || r.Lines.Sum(l => l.Quantity) > 1000) throw Bad("Choose up to 1,000 tags, a destination and an external tracker reference.");
        var canonical = new { r.AgreementId, r.MerchantBranchId, destination = r.Destination.Trim(), tracker = r.ExternalTrackerReference.Trim(),
            lines = r.Lines.OrderBy(l => l.ProductVariantId).Select(l => new { l.ProductVariantId, l.Quantity,
                ids = l.SmartTagIds?.Order().ToArray() }) };
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(canonical))));
        Guid saved = Guid.Empty;
        var reused = false;
        await RunAsync(actor, async admin => {
            reused = false;
            var existing = await db.ConsignmentDispatches.SingleOrDefaultAsync(d => d.IdempotencyKey == r.IdempotencyKey.Trim(), ct);
            if (existing is not null)
            {
                if (existing.RequestFingerprint != fingerprint) throw Conflict("This submission reference was already used for different stock.");
                saved = existing.Id; reused = true; return;
            }
            var a = await db.ConsignmentAgreements.Include(x => x.Merchant).SingleOrDefaultAsync(x => x.Id == r.AgreementId, ct) ?? throw Missing();
            RequireEffective(a);
            var branch = await db.MerchantBranches.SingleOrDefaultAsync(b => b.Id == r.MerchantBranchId && b.MerchantId == a.MerchantId && b.IsActive,ct)
                ?? throw Bad("Choose an active delivery branch belonging to this merchant.");
            var destination = BranchDestination(branch);
            if (r.Destination.Trim() != destination) throw Conflict("The branch address changed. Choose the branch again before reserving stock.");
            var duplicate = await db.ConsignmentDispatches.SingleOrDefaultAsync(d => d.RequestFingerprint == fingerprint && d.Status == ConsignmentDispatchStatus.Reserved,ct);
            if (duplicate is not null) { saved = duplicate.Id; reused = true; return; }
            await StockLocks(r.Lines.Select(l => l.ProductVariantId), ct);
            var selected = new List<SmartTag>();
            foreach (var line in r.Lines.OrderBy(l => l.ProductVariantId))
            {
                var sku = await db.TagProductVariants.Include(v => v.TagProduct).SingleOrDefaultAsync(v => v.Id == line.ProductVariantId, ct);
                if (sku is null || !TagCatalogSellability.IsSellable(sku)) throw Conflict("Choose an available QR + NFC tag option.");
                var q = db.SmartTags.Where(SellableInventoryRules.FulfillableUnitOf(db, line.ProductVariantId))
                    .Where(t => t.InventoryReceiptId != null).Include(t => t.Batch).Include(t => t.ProductVariant).ThenInclude(v => v!.TagProduct);
                var tags = line.SmartTagIds is not null
                    ? await q.Where(t => line.SmartTagIds.Contains(t.Id)).ToListAsync(ct)
                    : await MerchantInventoryEligibility.InPickOrder(q).Take(line.Quantity).ToListAsync(ct);
                if (tags.Count != line.Quantity) throw Conflict("There are not enough eligible inspected tags for this allocation.");
                selected.AddRange(tags);
            }
            await InventoryCustodyRules.ProtectRetailReservationsAsync(db, selected, ct);
            var now = time.GetUtcNow();
            var seller = await identity.RequireForDocumentAsync(BusinessDocumentKind.ConsignmentDispatch, ct);
            var d = new ConsignmentDispatch {
                AgreementId = a.Id, Agreement = a, DispatchNumber = await numbers.NextConsignmentDispatchNumberAsync(now,ct),
                IdempotencyKey = r.IdempotencyKey.Trim(), RequestFingerprint = fingerprint,
                MerchantNameSnapshot = a.Merchant.TradingName ?? a.Merchant.LegalBusinessName,
                AgreementReferenceSnapshot = a.Reference, AgreementVersionSnapshot = a.Version,
                CommissionPercentageSnapshot = a.PartnerCommissionPercentage,
                DestinationSnapshot = destination, MerchantBranchId = branch.Id, ExternalTrackerReference = r.ExternalTrackerReference.Trim(),
                Seller = SellerIdentitySnapshot.From(seller), UpdatedByAdminUserId = admin };
            foreach (var tag in selected)
            {
                tag.AssignmentVersion++; // Rowversion serializes against retail assignment and owner activation.
                d.Units.Add(new ConsignmentUnit { SmartTag = tag, SmartTagId = tag.Id, ProductVariantId = tag.ProductVariantId!.Value,
                    BatchId = tag.BatchId, TagCodeSnapshot = tag.TagCode, SkuSnapshot = tag.ProductVariant!.Sku,
                    ProductNameSnapshot = tag.ProductVariant.TagProduct!.Name, VariantSnapshot = tag.ProductVariant.DisplayName,
                    BatchNumberSnapshot = tag.Batch?.BatchNo });
            }
            db.ConsignmentDispatches.Add(d); saved = d.Id;
            Movement(d, null, "reserved", r.ExternalTrackerReference.Trim(), admin);
        }, ct);
        return (await GetAsync(saved, false, ct)) with { ReservationReused = reused };
    }

    public async Task<ConsignmentDispatchResponse> ActionAsync(Guid? actor, Guid id, string action,
        ConsignmentActionRequest r, CancellationToken ct)
    {
        ValidateAction(r);
        await RunAsync(actor, async admin => {
            var d = await db.ConsignmentDispatches.Include(d => d.Agreement).ThenInclude(a => a.Merchant)
                .Include(d => d.Units).ThenInclude(u => u.SmartTag).Include(d => d.HandoverRecords)
                .SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw Missing();
            // Exact lost-response replay is safe; changed references still require current state.
            if (action == "dispatch" && d.Status == ConsignmentDispatchStatus.Dispatched && d.ShipmentReference == r.Reference.Trim()
                ) return;
            if (action is "receive" or "record-discrepancy" or "resolve-discrepancy"
                && await IsReceivingReplay(d,r,action,admin,ct)) return;
            Token(d.RowVersion, r.ConcurrencyToken);
            var before = new { status = d.Status.ToString(), units = d.Units.Select(u => new {
                u.Id, status = u.Status.ToString(), qa = u.SmartTag.QaStatus?.ToString(), u.SmartTag.QaVersion }).ToArray() };
            await StockLocks(d.Units.Select(u => u.ProductVariantId), ct);
            var now = time.GetUtcNow();
            if (action == "dispatch")
            {
                RequireEffective(d.Agreement);
                if (d.Status != ConsignmentDispatchStatus.Reserved) throw Conflict("Only reserved stock can be dispatched.");
                if (!await db.MerchantBranches.AnyAsync(b => b.Id == d.MerchantBranchId && b.MerchantId == d.Agreement.MerchantId && b.IsActive,ct))
                    throw Conflict("The reserved delivery branch needs review before dispatch. Cancel and reserve against an active merchant branch.");
                foreach (var u in d.Units)
                {
                    if (u.Status != ConsignmentUnitStatus.Reserved || u.ReleasedAt != null)
                        throw Conflict("A reserved unit changed custody. Reload before dispatch.");
                    RequireUnowned(u.SmartTag);
                    RequireInspectedCommercial(u.SmartTag);
                    if (u.SmartTag.FulfilmentStatus is not (TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed)) throw Conflict("A tag is no longer in central stock.");
                    u.Status = ConsignmentUnitStatus.Dispatched;
                    u.SmartTag.FulfilmentStatus = TagFulfilmentStatus.SentToReseller;
                    u.SmartTag.SentToResellerAt = now;
                    u.SmartTag.AssignmentVersion++;
                }
                d.Status = ConsignmentDispatchStatus.Dispatched; d.DispatchedAt = now; d.ShipmentReference = r.Reference.Trim();
                d.DispatchedByAdminUserId = admin;
                d.DocumentIssuedAt = now;
                d.IssuedDocumentContent = ConsignmentDocumentService.RenderIssued(d);
                d.IssuedDocumentSha256 = Convert.ToHexString(SHA256.HashData(d.IssuedDocumentContent));
                Movement(d,null,"dispatched",r.Reference.Trim(),admin);
            }
            else if (action is "receive" or "record-discrepancy" or "resolve-discrepancy")
                await RecordReceiving(d,action,r,admin,ct);
            else if (action == "cancel")
            {
                if (d.Status != ConsignmentDispatchStatus.Reserved) throw Conflict("Dispatched stock must use the return process.");
                foreach (var u in d.Units) {
                    RequireUnowned(u.SmartTag); u.Status = ConsignmentUnitStatus.Released;
                    u.ReleasedAt = now; u.ExternalReference = r.Reference.Trim(); u.SmartTag.AssignmentVersion++;
                }
                d.Status = ConsignmentDispatchStatus.Cancelled; Movement(d,null,"cancelled",r.Reference.Trim(),admin);
            }
            else
            {
                var ids = r.UnitIds?.Distinct().ToArray() ?? [];
                if (ids.Length == 0 || ids.Length != r.UnitIds!.Count || ids.Any(uid => d.Units.All(u => u.Id != uid)))
                    throw Bad("Select units belonging to this dispatch.");
                foreach (var u in d.Units.Where(u => ids.Contains(u.Id)))
                {
                    if (action == "return")
                    {
                        if (u.Status is not (ConsignmentUnitStatus.Dispatched or ConsignmentUnitStatus.Received)) throw Conflict("Only partner-held unsold tags can be returned.");
                        var countedAtPartner = u.Status == ConsignmentUnitStatus.Received && u.ReceivingState == ConsignmentReceivingState.Good;
                        if (u.ReceivingState == ConsignmentReceivingState.Missing && r.Reference.Trim().Length < 5)
                            throw Bad("Record the actual physical return evidence for this located unit. A missing count alone is not a return.");
                        RequireUnowned(u.SmartTag);
                        u.Status = ConsignmentUnitStatus.ReturnedQuarantine; u.ReturnedAt = now;
                        var t = u.SmartTag;
                        t.QaStatus = PhysicalQaStatus.Pending; t.QaVersion++; u.ReturnQaVersion = t.QaVersion;
                        t.QaInspectionId = null; t.QaQrVerifiedAt = null; t.QaNfcVerifiedAt = null;
                        t.QaQrUrl = null; t.QaNfcUrl = null; t.QaInspectedAt = null;
                        t.QaPhysicalCondition = PhysicalTagCondition.Unchecked;
                        t.FulfilmentStatus = TagFulfilmentStatus.Printed;
                        if (countedAtPartner) await PostUnitReturnedAsync(d,u,r.ReturnFromBucket,admin,ct);
                    }
                    else if (action == "release")
                    {
                        if (u.Status != ConsignmentUnitStatus.ReturnedQuarantine) throw Conflict("Receive and inspect the returned tag before release.");
                        if (u.ReceivingState is ConsignmentReceivingState.Missing or ConsignmentReceivingState.Damaged or ConsignmentReceivingState.ReviewRequired)
                            throw Conflict("Complete the receiving review for this physical return before releasing it to available stock.");
                        RequireUnowned(u.SmartTag);
                        RequireInspectedCommercial(u.SmartTag);
                        if (u.ReturnQaVersion is null || u.ReturnedAt is null || u.SmartTag.QaInspectedAt is null
                            || u.SmartTag.QaVersion <= u.ReturnQaVersion || u.SmartTag.QaInspectedAt < u.ReturnedAt
                            || u.SmartTag.FulfilmentStatus is not (TagFulfilmentStatus.Generated or TagFulfilmentStatus.Printed))
                            throw Conflict("A fresh physical inspection is required after this return.");
                        u.Status = ConsignmentUnitStatus.Released; u.ReleasedAt = now;
                    }
                    else if (action is "external-handover" or "correct-handover" or "reverse-handover")
                    {
                        if (ids.Length != 1) throw Bad("Record one tag per unique external handover reference.");
                        await RecordHandover(d,u,action,r,admin,ct);
                    }
                    else if (action == "write-off")
                    {
                        RequireUnowned(u.SmartTag);
                        if (u.Status != ConsignmentUnitStatus.ReturnedQuarantine || u.SmartTag.QaStatus is not (PhysicalQaStatus.Failed or PhysicalQaStatus.NeedsReview))
                            throw Conflict("Only physically returned stock that failed inspection or needs review can be written off. Missing stock must remain under discrepancy investigation.");
                        u.Status = ConsignmentUnitStatus.WrittenOff;
                        u.SmartTag.Status = SmartTagStatus.Disabled;
                    }
                    else throw Bad("Choose a supported custody action.");
                    u.ExternalReference = r.Reference.Trim(); u.SmartTag.AssignmentVersion++;
                    Movement(d,u,action,r.Reference.Trim(),admin);
                }
            }
            d.UpdatedByAdminUserId = admin;
            audit.Append(admin, ActorType.Admin, "consignment.custody-changed", "ConsignmentDispatch", d.Id, before,
                new { status = d.Status.ToString(), r.Reference, units = d.Units.Select(u => new {
                    u.Id, status = u.Status.ToString(), qa = u.SmartTag.QaStatus?.ToString(), u.SmartTag.QaVersion }).ToArray() });
            db.Entry(d).Property(x => x.UpdatedAt).IsModified = true;
        },ct);
        return await GetAsync(id,false,ct);
    }

    private async Task RunAsync(Guid? actor, Func<Guid,Task> operation, CancellationToken ct)
    {
        var admin = await db.AdminUsers.AsNoTracking().Where(a => a.UserId == actor && a.IsActive && a.DisabledAt == null)
            .Select(a => (Guid?)a.Id).SingleOrDefaultAsync(ct) ?? throw new ApiException(actor is null ? 401 : 403,"forbidden","Admin access is required.");
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () => {
            db.ChangeTracker.Clear();
            await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(ct) : null;
            if (db.Database.IsSqlServer()) await SqlServerInventoryReservationLock.AcquireForTransactionAsync(db,["MyPetLink:Consignment"],ct);
            try {
                await operation(admin);
                await db.SaveChangesAsync(ct);
                if (tx is not null) await tx.CommitAsync(ct);
            }
            catch (DbUpdateConcurrencyException) { throw Conflict("This stock or agreement changed. Reload before trying again."); }
            catch (DbUpdateException e) when (e.InnerException is Microsoft.Data.SqlClient.SqlException sql && sql.Number is 2601 or 2627)
            { throw Conflict("This stock or reference is already in use. Reload before trying again."); }
        });
    }
    private Task StockLocks(IEnumerable<Guid> ids, CancellationToken ct) => db.Database.IsSqlServer()
        ? SqlServerInventoryReservationLock.AcquireForTransactionAsync(db,SqlServerInventoryReservationLock.InventoryResources(ids),ct) : Task.CompletedTask;
    // Explicit read projection: archived PDF bytes are fetched only by the PDF endpoint.
    private IQueryable<ConsignmentDispatch> Graph() => db.ConsignmentDispatches.AsNoTracking().AsSplitQuery()
        .Select(d => new ConsignmentDispatch {
            Id=d.Id, AgreementId=d.AgreementId, DispatchNumber=d.DispatchNumber, CreatedAt=d.CreatedAt,
            MerchantNameSnapshot=d.MerchantNameSnapshot, AgreementReferenceSnapshot=d.AgreementReferenceSnapshot,
            AgreementVersionSnapshot=d.AgreementVersionSnapshot, CommissionPercentageSnapshot=d.CommissionPercentageSnapshot,
            DestinationSnapshot=d.DestinationSnapshot, Status=d.Status, ExternalTrackerReference=d.ExternalTrackerReference,
            DispatchedAt=d.DispatchedAt, ReceivedAt=d.ReceivedAt, ShipmentReference=d.ShipmentReference,
            ReceiptAcknowledgment=d.ReceiptAcknowledgment, RowVersion=d.RowVersion, MerchantBranchId=d.MerchantBranchId,
            HasOpenDiscrepancy=d.HasOpenDiscrepancy, DocumentIssuedAt=d.DocumentIssuedAt, IssuedDocumentSha256=d.IssuedDocumentSha256,
            RecipientName=d.RecipientName, PartnerReceivedAt=d.PartnerReceivedAt, ReceivedQuantity=d.ReceivedQuantity,
            Units=d.Units.Select(u => new ConsignmentUnit {
                Id=u.Id, TagCodeSnapshot=u.TagCodeSnapshot, SkuSnapshot=u.SkuSnapshot, ProductNameSnapshot=u.ProductNameSnapshot,
                VariantSnapshot=u.VariantSnapshot, BatchNumberSnapshot=u.BatchNumberSnapshot, Status=u.Status,
                ExternalReference=u.ExternalReference, CurrentHandoverRecordId=u.CurrentHandoverRecordId, ReceivingState=u.ReceivingState,
                SmartTag=new SmartTag { QaStatus=u.SmartTag.QaStatus, ActivatedAt=u.SmartTag.ActivatedAt }
            }).ToList(),
            Movements=d.Movements.Select(m => new ConsignmentMovement {
                Id=m.Id, Action=m.Action, Reference=m.Reference, OccurredAt=m.OccurredAt, UnitId=m.UnitId,
                ActorAdminUserId=m.ActorAdminUserId, EvidenceJson=m.EvidenceJson, ReviewMode=m.ReviewMode,
                ActorAdminUser=new AdminUser { User=new User { DisplayName=m.ActorAdminUser.User.DisplayName } }
            }).ToList(),
            HandoverRecords=d.HandoverRecords.ToList(), ReviewEvents=d.ReviewEvents.ToList()
        });
    private void Movement(ConsignmentDispatch d, ConsignmentUnit? u, string action, string reference, Guid admin,string? evidence = null,string? reviewMode = null)
    {
        var movement = new ConsignmentMovement { DispatchId = d.Id, UnitId = u?.Id, Action = action,
            Reference = reference, ActorAdminUserId = admin, OccurredAt = time.GetUtcNow(), EvidenceJson = evidence, ReviewMode=reviewMode };
        d.Movements.Add(movement);
        db.ConsignmentMovements.Add(movement);
        audit.Append(admin,ActorType.Admin,"consignment." + action,"ConsignmentDispatch",d.Id,null,
            new { unitId = u?.Id, reference, units = d.Units.Count, state = d.Status.ToString() });
    }
    private void RequireEffective(ConsignmentAgreement a)
    {
        var now = time.GetUtcNow();
        if (a.Status != ConsignmentAgreementStatus.Active || a.ApprovedByAdminUserId is null || a.ApprovedAt is null
            || !a.Merchant.IsActive || a.EffectiveFrom is null
            || a.EffectiveFrom > now || a.EffectiveTo <= now || Pending(a).Count > 0)
            throw Conflict("Complete agreement approval and confirm its effective dates before allocating or dispatching stock. Older agreements need a reviewed new version.");
    }
    private static void RequireUnowned(SmartTag t)
    {
        if (t.Status != SmartTagStatus.Unclaimed || t.OwnerUserId != null || t.PetId != null || t.OrderId != null
            || t.OrderItemId != null || t.ActivatedAt != null || t.DeletedAt != null || t.ArchivedAt != null)
            throw Conflict("This tag has an owner, an order or an unavailable status. It cannot be moved through this custody action.");
    }
    private static IReadOnlyList<string> Pending(ConsignmentAgreement a)
    {
        var fields = new List<string>();
        if (a.EffectiveFrom is null) fields.Add("Effective start");
        foreach (var (name,value) in new[] { ("Duration",a.DurationTerms), ("Settlement frequency",a.SettlementFrequency),
            ("Discount permissions",a.DiscountTerms), ("Return terms",a.ReturnTerms), ("Loss terms",a.LossTerms),
            ("Signed agreement reference",a.SignedAgreementReference), ("External tracker",a.ExternalTrackerReference) })
            if (string.IsNullOrWhiteSpace(value)) fields.Add(name);
        if (a.PaymentDeadlineDays is null) fields.Add("Payment deadline");
        return fields;
    }
    private static ConsignmentAgreementResponse MapAgreement(ConsignmentAgreement a) => new(a.Id,a.MerchantId,
        a.Merchant?.TradingName ?? a.Merchant?.LegalBusinessName ?? "",a.Reference,a.Version,a.Status.ToString(),
        a.PartnerCommissionPercentage,a.EffectiveFrom,a.EffectiveTo,a.DurationTerms,a.SettlementFrequency,a.PaymentDeadlineDays,
        a.DiscountTerms,a.ReturnTerms,a.LossTerms,a.SignedAgreementReference,a.ExternalTrackerReference,Pending(a),Convert.ToBase64String(a.RowVersion),a.ApprovalReviewMode,
        a.DefaultTermsRevision);
    private static SaveConsignmentAgreementRequest DraftTerms(ConsignmentAgreement a) => new(a.MerchantId,a.Reference,
        a.PartnerCommissionPercentage,a.EffectiveFrom,a.EffectiveTo,a.DurationTerms,a.SettlementFrequency,a.PaymentDeadlineDays,
        a.DiscountTerms,a.ReturnTerms,a.LossTerms,a.SignedAgreementReference,a.ExternalTrackerReference,a.SupersedesAgreementId);
    private static ConsignmentDispatchResponse Map(ConsignmentDispatch d, bool codes) => new(d.Id,d.AgreementId,d.DispatchNumber,
        d.MerchantNameSnapshot,d.AgreementReferenceSnapshot,d.AgreementVersionSnapshot,d.CommissionPercentageSnapshot,
        d.DestinationSnapshot,d.Status.ToString(),d.ExternalTrackerReference,d.DispatchedAt,d.ReceivedAt,d.ShipmentReference,d.ReceiptAcknowledgment,
        d.Units.Count(u => u.Status == ConsignmentUnitStatus.Reserved),
        d.Units.Count(u => u.Status is ConsignmentUnitStatus.Dispatched or ConsignmentUnitStatus.Received),
        d.Units.Count(u => u.Status == ConsignmentUnitStatus.ReturnedQuarantine),d.Units.Count(u => u.Status == ConsignmentUnitStatus.Released),
        d.Units.Count(u => u.Status == ConsignmentUnitStatus.ExternalHandover),
        d.Units.Count(u => u.SmartTag.ActivatedAt != null && u.Status != ConsignmentUnitStatus.ExternalHandover),
        d.Units.OrderBy(u => u.SkuSnapshot).ThenBy(u => u.TagCodeSnapshot).Select(u => new ConsignmentUnitResponse(u.Id,
            codes ? u.TagCodeSnapshot : null,u.SkuSnapshot,u.ProductNameSnapshot,u.VariantSnapshot,u.BatchNumberSnapshot,
            u.Status.ToString(),u.SmartTag.QaStatus?.ToString() ?? "Not inspected",u.SmartTag.ActivatedAt != null,u.ExternalReference,u.CurrentHandoverRecordId,u.ReceivingState.ToString())).ToArray(),
        d.Movements.OrderByDescending(m => m.OccurredAt).Select(m => new ConsignmentMovementResponse(m.Action,m.Reference,m.OccurredAt,m.UnitId,m.ActorAdminUserId,m.EvidenceJson,m.ActorAdminUser?.User?.DisplayName,m.ReviewMode)).ToArray(),
        Convert.ToBase64String(d.RowVersion),d.MerchantBranchId,d.HasOpenDiscrepancy,d.DocumentIssuedAt != null && d.IssuedDocumentSha256 != null,
        d.RecipientName,d.PartnerReceivedAt,d.ReceivedQuantity,d.HandoverRecords.OrderByDescending(h => h.RecordedAt).Select(MapHandover).ToArray()) { Reviews=d.ReviewEvents.OrderByDescending(e=>e.RecordedAt).Select(MapReview).ToArray() };
    private static void ValidateAction(ConsignmentActionRequest r) {
        if (string.IsNullOrWhiteSpace(r.Reference) || r.Reference.Length > 1000) throw Bad("Record the reason or acknowledgment reference.");
    }
    private static void Token(byte[] actual, string? token) {
        byte[] expected;
        try { expected = Convert.FromBase64String(token ?? ""); } catch (FormatException) { throw Bad("Reload before saving this record."); }
        if (expected.Length == 0 || !expected.SequenceEqual(actual)) throw Conflict("This record changed. Reload before trying again.");
    }
    private static void Page(int page,int size) { if (page < 1 || page > 1000000 || size is < 1 or > 100) throw Bad("Choose a valid page size."); }
    private static string? Trim(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
    private static ApiException Bad(string message) => new(400,"validation_failed",message);
    private static ApiException Conflict(string message) => new(409,"consignment_conflict",message);
    private static ApiException Missing() => new(404,"consignment_not_found","This agreement or dispatch could not be found.");
}
