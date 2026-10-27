using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class ConsignmentDocumentService(MyPetLinkDbContext db, ConsignmentService service, IAuditLogService audit)
{
    public async Task<ConsignmentDispatchResponse> ManifestAsync(Guid? actor, Guid id, CancellationToken ct)
    {
        var result = await service.GetAsync(id,true,ct);
        await Record(actor,id,"manifest",ct);
        return result;
    }
    public async Task<byte[]> CsvAsync(Guid? actor, Guid id, CancellationToken ct)
    {
        var d = await service.GetAsync(id,true,ct);
        var text = new StringBuilder();
        text.AppendLine(string.Join(',',new[] { "Merchant", "Dispatch", "Agreement", "Version", "Dispatched UTC", "Partner received UTC", "Unit Reference", "Tag Code", "SKU", "Batch", "Custody", "Inspection", "Activated", "External Reference", "Tracker", "Agreement review mode", "Receiving review modes" }.Select(AdminExportSanitizer.Csv)));
        var agreementMode=await db.ConsignmentAgreements.Where(a=>a.Id==d.AgreementId).Select(a=>a.ApprovalReviewMode).SingleAsync(ct);
        foreach (var u in d.Units)
            text.AppendLine(string.Join(',',new[] { d.MerchantName,d.DispatchNumber,d.AgreementReference,d.AgreementVersion.ToString(),d.DispatchedAt?.ToString("O") ?? "",d.PartnerReceivedAt?.ToString("O") ?? "",u.UnitReference,
                u.TagCode!,u.Sku,u.Batch ?? "",u.Status,u.QaStatus,u.IsActivated ? "Yes" : "No",u.ExternalReference ?? "",d.ExternalTrackerReference,
                agreementMode ?? "Historical review not recorded",
                string.Join("; ",d.Reviews.Select(e=>e.ReviewMode).Distinct()) }.Select(AdminExportSanitizer.Csv)));
        await Record(actor,id,"manifest-csv",ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
    }
    public async Task<OrderDocumentResult> PdfAsync(Guid? actor, Guid id, CancellationToken ct)
    {
        var d = await db.ConsignmentDispatches.AsNoTracking().Where(x => x.Id == id).Select(x => new { x.IssuedDocumentContent, x.DispatchNumber }).SingleOrDefaultAsync(ct)
            ?? throw new ApiException(404,"consignment_not_found","This dispatch could not be found.");
        if (d.IssuedDocumentContent is null)
            throw new ApiException(409,"consignment_document_not_issued","No dispatch note has been issued. Confirm dispatch first. Historical deliveries without an archived issued copy require document review.");
        await Record(actor,id,"dispatch-note",ct);
        return new OrderDocumentResult(d.IssuedDocumentContent,d.DispatchNumber + ".pdf");
    }
    /// <summary>The issued Delivery Order exactly as stored. Downloading again never re-renders or renumbers it.</summary>
    public async Task<OrderDocumentResult> DeliveryOrderPdfAsync(Guid? actor, Guid id, CancellationToken ct)
    {
        var order = await db.ConsignmentDeliveryOrders.AsNoTracking().Where(x => x.DispatchId == id)
            .Select(x => new { x.Content, x.FileName, x.DeliveryOrderNumber }).SingleOrDefaultAsync(ct);
        if (order is null)
            throw await db.ConsignmentDispatches.AnyAsync(x => x.Id == id, ct)
                ? new ApiException(409,"consignment_delivery_order_not_issued","No Delivery Order has been generated for this delivery yet.")
                : new ApiException(404,"consignment_not_found","This dispatch could not be found.");
        await Record(actor,id,"delivery-order:" + order.DeliveryOrderNumber,ct);
        return new OrderDocumentResult(order.Content,order.FileName);
    }
    internal static byte[] RenderIssued(ConsignmentDispatch d)
    {
        var s = d.Seller;
        var assembly = typeof(ConsignmentDocumentService).Assembly;
        var resource = assembly.GetManifestResourceNames().First(n => n.EndsWith("mypetlink-logo-horizontal.png"));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var buffer = new MemoryStream(); stream.CopyTo(buffer);
        var model = new MerchantDocumentModel(MerchantDocumentKind.DeliveryOrder,buffer.ToArray(),s.BrandName,
            new(s.LegalBusinessName,s.BrandName,s.BusinessRegistrationNumber,s.TaxIdentificationNumber,s.SstRegistrationNumber,
                null,s.SupportEmail,null,new[] { s.AddressLine1, s.AddressLine2, s.Postcode + " " + s.City, s.State,s.Country }.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v!).ToArray()),
            new(d.MerchantNameSnapshot,null,null,null,null,null,null,null,[d.DestinationSnapshot]),s.SupportEmail,s.BusinessWebsite,
            "Consignment Dispatch Note","Dispatch No.",d.DispatchNumber,
            [("Dispatch No.",d.DispatchNumber),("Agreement",d.AgreementReferenceSnapshot + " / version " + d.AgreementVersionSnapshot),
             ("Status",d.Status.ToString()),("Shipment reference",d.ShipmentReference ?? "Not dispatched"),
             ("Dispatch date",d.DispatchedAt?.ToOffset(TimeSpan.FromHours(8)).ToString("dd MMM yyyy HH:mm") ?? "Not dispatched")],
            [],null,d.Units.GroupBy(u => new { u.ProductNameSnapshot,u.SkuSnapshot,u.VariantSnapshot,u.BatchNumberSnapshot })
                .OrderBy(g => g.Key.SkuSnapshot).Select(g => new MerchantDocumentLine(g.Key.ProductNameSnapshot,g.Key.SkuSnapshot,
                    g.Key.VariantSnapshot,"QR + NFC Smart Tag",g.Count(),"",null,"",g.Key.BatchNumberSnapshot)).ToArray(),
            null,null,null,null,null,"MYR",null,null,
            "Stock custody only. Ownership remains with MyPetLink under the agreement. No upfront stock payment is due. "
            + "This document is not an invoice, receipt, retail sale or commission statement. "
            + "Individual Tag Codes are recorded in the controlled manifest.",false,false,
            "Issued dispatch record. The partner's actual signed receipt evidence is recorded separately.");
        return MerchantDocumentRenderer.Render(model);
    }
    public async Task<byte[]> ReconciliationCsvAsync(Guid? actor,DateTimeOffset from,DateTimeOffset to,CancellationToken ct)
    {
        if (from == default || to <= from || to-from > TimeSpan.FromDays(366))
            throw new ApiException(400,"validation_failed","Choose an export period of up to 366 days. The end is exclusive.");
        var rows = await db.ConsignmentHandoverRecords.AsNoTracking().Where(h => h.EventAt >= from && h.EventAt < to)
            .OrderBy(h => h.EventAt).ThenBy(h => h.Id).Take(10001)
            .Join(db.ConsignmentUnits,h => h.UnitId,u => u.Id,(h,u) => new { h,u })
            .Join(db.ConsignmentDispatches,x => x.h.DispatchId,d => d.Id,(x,d) => new { x.h,x.u,d.MerchantNameSnapshot,d.AgreementReferenceSnapshot,d.AgreementVersionSnapshot,d.DispatchNumber, AgreementReviewMode=d.Agreement.ApprovalReviewMode, ReviewModes=d.ReviewEvents.Select(e=>e.ReviewMode).Distinct().ToList() }).ToListAsync(ct);
        if (rows.Count > 10000) throw new ApiException(400,"validation_failed","Choose a shorter export period (maximum 10,000 records).");
        var text = new StringBuilder();
        text.AppendLine(string.Join(',',new[] { "Merchant", "Merchant ID", "Agreement", "Agreement version", "Dispatch", "Unit ID", "Tag Code", "Event ID", "Event reference", "Kind", "Event UTC", "Recorded UTC", "Actor admin ID", "Supersedes record", "Reported sale", "Actual selling price MYR", "Discount MYR", "Discount description", "Evidence reference", "Verification", "Agreement review mode", "Receiving review modes" }.Select(AdminExportSanitizer.Csv)));
        foreach(var x in rows)
            text.AppendLine(string.Join(',',new[] { x.MerchantNameSnapshot,x.h.MerchantId.ToString(),x.AgreementReferenceSnapshot,x.AgreementVersionSnapshot.ToString(),x.DispatchNumber,x.u.Id.ToString(),x.u.TagCodeSnapshot,
                x.h.Id.ToString(),x.h.EventReference,x.h.Kind,x.h.EventAt.ToString("O"),x.h.RecordedAt.ToString("O"),x.h.ActorAdminUserId.ToString(),x.h.SupersedesRecordId?.ToString() ?? "",x.h.IsReportedSale ? "Yes" : "No",
                x.h.SellingPrice?.ToString("F2",System.Globalization.CultureInfo.InvariantCulture) ?? "",x.h.DiscountAmount?.ToString("F2",System.Globalization.CultureInfo.InvariantCulture) ?? "",x.h.DiscountDescription ?? "",x.h.EvidenceReference,"Unverified external report",x.AgreementReviewMode ?? "Historical review not recorded",string.Join("; ",x.ReviewModes) }.Select(AdminExportSanitizer.Csv)));
        await Record(actor,Guid.Empty,"reconciliation-csv:"+from.ToString("O")+":"+to.ToString("O"),ct);
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(text.ToString())).ToArray();
    }
    private async Task Record(Guid? actor,Guid id,string kind,CancellationToken ct)
    {
        var admin = await db.AdminUsers.AsNoTracking().Where(a => a.UserId == actor && a.IsActive && a.DisabledAt == null)
            .Select(a => (Guid?)a.Id).SingleOrDefaultAsync(ct) ?? throw new ApiException(403,"forbidden","Admin access is required.");
        audit.Append(admin,ActorType.Admin,"consignment.document-downloaded","ConsignmentDispatch",id,null,new { kind });
        await db.SaveChangesAsync(ct);
    }
}
