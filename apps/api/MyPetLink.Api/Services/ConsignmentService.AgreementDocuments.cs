using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

// The agreement a partner signs is generated from the saved agreement row, never
// from the browser. Preview renders the saved draft; issuing freezes it: the PDF
// bytes and a snapshot are kept, and a later edit produces a new issue instead of
// changing one already sent. Neither step approves, signs or activates anything.
public sealed partial class ConsignmentService
{
    internal const int MaxSignedCopyBytes = 8 * 1024 * 1024;
    private static readonly JsonSerializerOptions DocumentJson = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan Malaysia = TimeSpan.FromHours(8);

    internal sealed record AgreementPartySnapshot(string LegalName, string? TradingName, string? RegistrationNumber,
        IReadOnlyList<string> Address, string? ContactPerson, string? Email);
    internal sealed record AgreementDocumentSnapshot(Guid AgreementId, string Reference, int Version, string BrandName,
        AgreementPartySnapshot Company, AgreementPartySnapshot Partner, decimal PartnerCommissionPercentage,
        DateTimeOffset EffectiveFrom, DateTimeOffset? EffectiveTo, string DurationTerms, string SettlementFrequency,
        int PaymentDeadlineDays, string DiscountTerms, string ReturnTerms, string LossTerms);

    /// <summary>
    /// SHA-256 of the commercial terms of one agreement version, in a fixed form. Evidence
    /// and tracker references are not terms, so recording them never changes it.
    /// </summary>
    internal static string TermsFingerprint(ConsignmentAgreement a)
    {
        var canonical = JsonSerializer.Serialize(new {
            merchant = a.MerchantId, reference = a.Reference, version = a.Version,
            commission = a.PartnerCommissionPercentage.ToString("F2", CultureInfo.InvariantCulture),
            from = a.EffectiveFrom?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            to = a.EffectiveTo?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            duration = a.DurationTerms, settlement = a.SettlementFrequency, deadline = a.PaymentDeadlineDays,
            discounts = a.DiscountTerms, returns = a.ReturnTerms, loss = a.LossTerms });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    /// <summary>What the document still needs. The signed reference is not one: the partner signs this document.</summary>
    internal static IReadOnlyList<string> MissingForDocument(ConsignmentAgreement a, BusinessIdentitySetting? seller)
    {
        var missing = Pending(a).Where(p => p is not ("Signed agreement reference" or "External tracker")).ToList();
        var m = a.Merchant;
        if (string.IsNullOrWhiteSpace(m.LegalBusinessName)) missing.Add("Partner legal business name");
        if (string.IsNullOrWhiteSpace(m.BusinessRegistrationNumber)) missing.Add("Partner business registration number");
        if (new[] { m.BillingAddressLine1, m.BillingPostcode, m.BillingCity, m.BillingState, m.BillingCountry }.Any(string.IsNullOrWhiteSpace))
            missing.Add("Partner business address");
        if (seller is null) missing.Add("MyPetLink business details");
        else missing.AddRange(BusinessIdentityService.MissingFor(BusinessDocumentKind.ConsignmentAgreement, seller).Select(f => "MyPetLink " + f.ToLowerInvariant()));
        return missing;
    }

    private static AgreementDocumentSnapshot Snapshot(ConsignmentAgreement a, BusinessIdentitySetting s)
    {
        var m = a.Merchant;
        static IReadOnlyList<string> Lines(params string?[] parts) =>
            parts.Where(p => !string.IsNullOrWhiteSpace(p)).Select(p => p!.Trim()).ToArray();
        var company = new AgreementPartySnapshot(s.LegalBusinessName.Trim(), null, s.BusinessRegistrationNumber.Trim(),
            Lines(s.RegisteredAddressLine1, s.RegisteredAddressLine2, $"{s.RegisteredPostcode} {s.RegisteredCity}".Trim(), s.RegisteredState, s.RegisteredCountry),
            null, s.SupportEmail.Trim());
        var partner = new AgreementPartySnapshot(m.LegalBusinessName.Trim(),
            string.IsNullOrWhiteSpace(m.TradingName) || m.TradingName.Trim() == m.LegalBusinessName.Trim() ? null : m.TradingName.Trim(),
            m.BusinessRegistrationNumber?.Trim(),
            Lines(m.BillingAddressLine1, m.BillingAddressLine2, $"{m.BillingPostcode} {m.BillingCity}".Trim(), m.BillingState, m.BillingCountry),
            string.IsNullOrWhiteSpace(m.ContactPerson) ? null : m.ContactPerson.Trim(),
            string.IsNullOrWhiteSpace(m.ContactEmail) ? null : m.ContactEmail.Trim());
        return new(a.Id, a.Reference, a.Version, s.BrandName.Trim(), company, partner, a.PartnerCommissionPercentage,
            a.EffectiveFrom!.Value.ToUniversalTime(), a.EffectiveTo?.ToUniversalTime(), a.DurationTerms!, a.SettlementFrequency!,
            a.PaymentDeadlineDays!.Value, a.DiscountTerms!, a.ReturnTerms!, a.LossTerms!);
    }

    private Task<BusinessIdentitySetting?> SellerAsync(CancellationToken ct) =>
        db.BusinessIdentitySettings.AsNoTracking().SingleOrDefaultAsync(s => s.Id == BusinessIdentityService.SettingsId, ct);

    public async Task<ConsignmentAgreementDocumentSummary> AgreementDocumentAsync(Guid id, CancellationToken ct)
    {
        var a = await db.ConsignmentAgreements.AsNoTracking().Include(x => x.Merchant).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
        var seller = await SellerAsync(ct);
        var issued = await db.ConsignmentAgreementDocuments.AsNoTracking().Where(d => d.AgreementId == id)
            .OrderByDescending(d => d.IssueNumber)
            .Select(d => new { d.Id, d.IssueNumber, d.AgreementVersion, d.TermsFingerprint, d.ContentSha256, d.FileName, d.IssuedAt, d.SnapshotJson,
                Name = db.AdminUsers.Where(u => u.Id == d.IssuedByAdminUserId).Select(u => u.User.DisplayName).FirstOrDefault() })
            .ToListAsync(ct);
        var signed = await db.ConsignmentSignedAgreements.AsNoTracking().Where(s => s.AgreementId == id)
            .OrderByDescending(s => s.UploadedAt).ThenByDescending(s => s.Id)
            .Select(s => new { s.Id, s.IssuedDocumentId, s.IssuedDocument.IssueNumber, s.AgreementVersion, s.OriginalFileName, s.ContentType,
                s.FileSize, s.Sha256, s.PartnerSignatoryName, s.PartnerSignatoryDesignation, s.PartnerSignedOn, s.CompanySignatoryName,
                s.CompanySignatoryDesignation, s.CompanySignedOn, s.Notes, s.UploadedAt, s.TermsFingerprint,
                Name = db.AdminUsers.Where(u => u.Id == s.UploadedByAdminUserId).Select(u => u.User.DisplayName).FirstOrDefault() })
            .ToListAsync(ct);
        var missing = MissingForDocument(a, seller);
        var fingerprint = TermsFingerprint(a);
        var current = issued.FirstOrDefault(d => d.TermsFingerprint == fingerprint);
        var latest = issued.FirstOrDefault();
        var snapshotNow = missing.Count == 0 ? JsonSerializer.Serialize(Snapshot(a, seller!), DocumentJson) : null;
        var partyChanged = current is not null && snapshotNow is not null && current.SnapshotJson != snapshotNow;
        var signedMatches = signed.Any(s => s.TermsFingerprint == fingerprint);
        var (status, label) = a.Status switch {
            ConsignmentAgreementStatus.Closed => ("closed", "Closed"),
            ConsignmentAgreementStatus.Active => ("approved", "Approved"),
            _ when missing.Count > 0 => ("incomplete", "Draft — Incomplete"),
            _ when signedMatches => ("signed-copy-received", "Signed Copy Received"),
            _ when current is not null => ("issued", "Issued for Signature"),
            _ => ("ready", "Ready for Signature"),
        };
        return new(a.Id, a.Reference, a.Version, status, label, missing, missing.Count == 0 ? fingerprint : null, current?.Id, partyChanged,
            signedMatches, a.Status != ConsignmentAgreementStatus.Closed && missing.Count == 0 && latest?.SnapshotJson != snapshotNow,
            Convert.ToBase64String(a.RowVersion),
            issued.Select(d => new ConsignmentIssuedAgreementResponse(d.Id, d.IssueNumber, d.AgreementVersion, d.TermsFingerprint, d.ContentSha256,
                d.FileName, d.IssuedAt, d.Name, d.Id == current?.Id)).ToArray(),
            signed.Select(s => new ConsignmentSignedAgreementResponse(s.Id, s.IssuedDocumentId, s.IssueNumber, s.AgreementVersion, s.OriginalFileName,
                s.ContentType, s.FileSize, s.Sha256, s.PartnerSignatoryName, s.PartnerSignatoryDesignation, s.PartnerSignedOn, s.CompanySignatoryName,
                s.CompanySignatoryDesignation, s.CompanySignedOn, s.Notes, s.UploadedAt, s.Name, s.TermsFingerprint == fingerprint)).ToArray());
    }

    /// <summary>The saved draft as it would be issued, marked as a preview. Nothing is stored except the audit entry.</summary>
    public async Task<OrderDocumentResult> PreviewAgreementAsync(Guid? actor, Guid id, string? token, CancellationToken ct)
    {
        var admin = await RequireDocumentAccessAsync(actor, ct);
        var a = await db.ConsignmentAgreements.AsNoTracking().Include(x => x.Merchant).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
        // The token says which saved version the operator is looking at. Anything else
        // (an unsaved form, or someone else's later save) would preview terms they did not see.
        Token(a.RowVersion, token);
        var seller = await SellerAsync(ct);
        RequireDocumentReady(a, seller);
        var fingerprint = TermsFingerprint(a);
        var pdf = ConsignmentAgreementRenderer.Render(new(Snapshot(a, seller!), BrandLogo(), true, null, fingerprint, time.GetUtcNow()));
        audit.Append(admin, ActorType.Admin, "consignment.agreement-document-previewed", "ConsignmentAgreement", a.Id, null, new { fingerprint });
        await db.SaveChangesAsync(ct);
        return new(pdf, AgreementFileName(a.Reference, a.Version, null, "_PREVIEW"));
    }

    public async Task<ConsignmentAgreementDocumentSummary> IssueAgreementAsync(Guid? actor, Guid id, IssueConsignmentAgreementRequest r, CancellationToken ct)
    {
        await RunAsync(actor, async admin => {
            var a = await db.ConsignmentAgreements.Include(x => x.Merchant).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            Token(a.RowVersion, r.ConcurrencyToken);
            if (a.Status == ConsignmentAgreementStatus.Closed)
                throw Conflict("This agreement version is closed. Issue the current version instead.");
            var seller = await SellerAsync(ct);
            RequireDocumentReady(a, seller);
            var snapshot = Snapshot(a, seller!);
            var json = JsonSerializer.Serialize(snapshot, DocumentJson);
            var latest = await db.ConsignmentAgreementDocuments.Where(d => d.AgreementId == a.Id).OrderByDescending(d => d.IssueNumber)
                .Select(d => new { d.IssueNumber, d.SnapshotJson }).FirstOrDefaultAsync(ct);
            // Issuing the same saved terms twice hands back the copy already sent.
            if (latest?.SnapshotJson == json) return;
            var issue = (latest?.IssueNumber ?? 0) + 1;
            var fingerprint = TermsFingerprint(a);
            var issuedAt = time.GetUtcNow();
            var pdf = ConsignmentAgreementRenderer.Render(new(snapshot, BrandLogo(), false, issue, fingerprint, issuedAt));
            var document = new ConsignmentAgreementDocument {
                AgreementId = a.Id, MerchantId = a.MerchantId, AgreementReference = a.Reference, AgreementVersion = a.Version,
                IssueNumber = issue, TermsFingerprint = fingerprint, SnapshotJson = json, Content = pdf,
                ContentSha256 = Convert.ToHexString(SHA256.HashData(pdf)), FileName = AgreementFileName(a.Reference, a.Version, issue),
                IssuedAt = issuedAt, IssuedByAdminUserId = admin };
            db.ConsignmentAgreementDocuments.Add(document);
            audit.Append(admin, ActorType.Admin, "consignment.agreement-document-issued", "ConsignmentAgreement", a.Id, null,
                new { documentId = document.Id, issue, fingerprint, sha256 = document.ContentSha256, version = a.Version });
        }, ct);
        return await AgreementDocumentAsync(id, ct);
    }

    public async Task<OrderDocumentResult> IssuedAgreementPdfAsync(Guid? actor, Guid id, Guid documentId, CancellationToken ct)
    {
        var admin = await RequireDocumentAccessAsync(actor, ct);
        // Both ids must belong together: a document id alone never opens another agreement's file.
        var d = await db.ConsignmentAgreementDocuments.AsNoTracking().Where(x => x.Id == documentId && x.AgreementId == id)
            .Select(x => new { x.Content, x.FileName, x.IssueNumber }).SingleOrDefaultAsync(ct) ?? throw Missing();
        audit.Append(admin, ActorType.Admin, "consignment.agreement-document-downloaded", "ConsignmentAgreement", id, null, new { documentId, issue = d.IssueNumber });
        await db.SaveChangesAsync(ct);
        return new(d.Content, d.FileName);
    }

    public async Task<ConsignmentAgreementDocumentSummary> UploadSignedAgreementAsync(Guid? actor, Guid id,
        UploadConsignmentSignedAgreementRequest r, CancellationToken ct)
    {
        var partner = Trim(r.PartnerSignatoryName);
        var companyName = Trim(r.CompanySignatoryName);
        if (partner is null || partner.Length > 200 || Trim(r.PartnerSignatoryDesignation)?.Length > 200
            || companyName?.Length > 200 || Trim(r.CompanySignatoryDesignation)?.Length > 200 || Trim(r.Notes)?.Length > 1000)
            throw Bad("Enter who signed for the partner, keeping names and designations to 200 characters.");
        if (companyName is null && (r.CompanySignedOn is not null || Trim(r.CompanySignatoryDesignation) is not null))
            throw Bad("Enter who signed for MyPetLink, or leave the MyPetLink signature details blank.");
        var content = DecodeSignedFile(r.ContentBase64);
        var type = DetectSignedFileType(content) ?? throw Bad("Upload the signed agreement as a PDF, JPEG or PNG file.");
        var declared = r.ContentType?.Trim().ToLowerInvariant() is "image/jpg" ? "image/jpeg" : r.ContentType?.Trim().ToLowerInvariant();
        var name = SafeFileName(r.FileName);
        var extension = Path.GetExtension(name).ToLowerInvariant();
        if (declared != type || type switch { "application/pdf" => extension != ".pdf", "image/png" => extension != ".png",
                _ => extension is not (".jpg" or ".jpeg") })
            throw Bad("The file’s contents don’t match its name or type. Upload the original PDF, JPEG or PNG.");
        // The whole file must open, not just its first bytes: nothing unreadable is kept as signed evidence.
        await SignedAgreementFileValidator.RequireReadableAsync(content, type, ct);
        var today = DateOnly.FromDateTime(time.GetUtcNow().ToOffset(Malaysia).DateTime);
        await RunAsync(actor, async admin => {
            var a = await db.ConsignmentAgreements.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw Missing();
            if (a.Status == ConsignmentAgreementStatus.Closed)
                throw Conflict("This agreement version is closed. Record signed copies against the current version.");
            var issued = await db.ConsignmentAgreementDocuments.Where(d => d.Id == r.IssuedDocumentId && d.AgreementId == id)
                .Select(d => new { d.Id, d.IssueNumber, d.TermsFingerprint, d.IssuedAt }).SingleOrDefaultAsync(ct)
                ?? throw Bad("Choose the issued agreement this signed copy answers.");
            if (issued.TermsFingerprint != TermsFingerprint(a))
                throw Conflict($"The terms changed after issue {issued.IssueNumber} was sent. Issue the current terms and have the partner sign that copy.");
            var issuedDay = DateOnly.FromDateTime(issued.IssuedAt.ToOffset(Malaysia).DateTime);
            foreach (var day in new[] { (DateOnly?)r.PartnerSignedOn, r.CompanySignedOn })
                if (day is { } d && (d < issuedDay || d > today))
                    throw Bad("Signing dates must fall between the day the agreement was issued and today.");
            var sha = Convert.ToHexString(SHA256.HashData(content));
            if (await db.ConsignmentSignedAgreements.AnyAsync(s => s.AgreementId == id && s.Sha256 == sha, ct))
                throw Conflict("This file has already been recorded for this agreement.");
            var copy = new ConsignmentSignedAgreement {
                AgreementId = id, MerchantId = a.MerchantId, AgreementVersion = a.Version, IssuedDocumentId = issued.Id,
                TermsFingerprint = issued.TermsFingerprint, OriginalFileName = name, ContentType = type, FileSize = content.Length,
                Sha256 = sha, Content = content, PartnerSignatoryName = partner, PartnerSignatoryDesignation = Trim(r.PartnerSignatoryDesignation),
                PartnerSignedOn = r.PartnerSignedOn, CompanySignatoryName = companyName, CompanySignatoryDesignation = Trim(r.CompanySignatoryDesignation),
                CompanySignedOn = r.CompanySignedOn, Notes = Trim(r.Notes), UploadedAt = time.GetUtcNow(), UploadedByAdminUserId = admin };
            db.ConsignmentSignedAgreements.Add(copy);
            // Recording evidence changes no status: approval still needs its own review.
            audit.Append(admin, ActorType.Admin, "consignment.agreement-signed-copy-uploaded", "ConsignmentAgreement", id, null,
                new { signedCopyId = copy.Id, issuedDocumentId = issued.Id, issue = issued.IssueNumber, sha256 = sha, size = content.Length, type });
        }, ct);
        return await AgreementDocumentAsync(id, ct);
    }

    public async Task<(byte[] Content, string ContentType, string FileName)> SignedAgreementFileAsync(Guid? actor, Guid id, Guid copyId, CancellationToken ct)
    {
        var admin = await RequireDocumentAccessAsync(actor, ct);
        var s = await db.ConsignmentSignedAgreements.AsNoTracking().Where(x => x.Id == copyId && x.AgreementId == id)
            .Select(x => new { x.Content, x.ContentType, x.OriginalFileName, x.AgreementVersion, x.IssuedDocument.IssueNumber, x.IssuedDocument.AgreementReference })
            .SingleOrDefaultAsync(ct) ?? throw Missing();
        audit.Append(admin, ActorType.Admin, "consignment.agreement-signed-copy-downloaded", "ConsignmentAgreement", id, null, new { signedCopyId = copyId });
        await db.SaveChangesAsync(ct);
        var extension = s.ContentType switch { "application/pdf" => ".pdf", "image/png" => ".png", _ => ".jpg" };
        return (s.Content, s.ContentType, $"MyPetLink_Consignment_{SafeReference(s.AgreementReference)}_v{s.AgreementVersion}_issue{s.IssueNumber}_SIGNED{extension}");
    }

    private static void RequireDocumentReady(ConsignmentAgreement a, BusinessIdentitySetting? seller)
    {
        var missing = MissingForDocument(a, seller);
        if (missing.Count > 0)
            throw new ApiException(409, "agreement_document_incomplete",
                $"Complete these details before preparing the agreement: {string.Join(", ", missing)}.");
    }

    // Agreement files carry signatures and commercial terms: viewing the module is not enough.
    private async Task<Guid> RequireDocumentAccessAsync(Guid? actor, CancellationToken ct)
    {
        var admin = await db.AdminUsers.AsNoTracking().Where(a => a.UserId == actor && a.IsActive && a.DisabledAt == null)
            .Select(a => (Guid?)a.Id).SingleOrDefaultAsync(ct) ?? throw new ApiException(actor is null ? 401 : 403, "forbidden", "Admin access is required.");
        var snapshot = access is null ? AdminAccessSnapshot.None : await access.ResolveAsync(actor, ct);
        if (!snapshot.Has(AdminCapabilities.ConsignmentAgreementsManage) && !snapshot.Has(AdminCapabilities.ConsignmentAgreementsApprove))
            throw new ApiException(403, "forbidden", "You don’t have permission to open agreement documents.");
        return admin;
    }

    private static byte[] DecodeSignedFile(string? base64)
    {
        // Checked before decoding so an oversized upload is never buffered twice.
        if (string.IsNullOrWhiteSpace(base64) || base64.Length > (MaxSignedCopyBytes + 2) / 3 * 4 + 4)
            throw Bad("Choose a signed agreement file of up to 8 MB.");
        try
        {
            var content = Convert.FromBase64String(base64.Trim());
            if (content.Length is 0 or > MaxSignedCopyBytes) throw Bad("Choose a signed agreement file of up to 8 MB.");
            return content;
        }
        catch (FormatException) { throw Bad("The file could not be read. Choose it again."); }
    }

    /// <summary>
    /// The type the bytes claim to be, whatever the browser said. Only a first filter:
    /// <see cref="SignedAgreementFileValidator"/> then opens the whole file.
    /// </summary>
    internal static string? DetectSignedFileType(ReadOnlySpan<byte> c)
    {
        if (c.Length >= 5 && c[..5].SequenceEqual("%PDF-"u8)) return "application/pdf";
        if (c.Length >= 8 && c[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (c.Length >= 3 && c[0] == 0xFF && c[1] == 0xD8 && c[2] == 0xFF) return "image/jpeg";
        return null;
    }

    private static string SafeFileName(string? fileName)
    {
        var name = Path.GetFileName((fileName ?? "").Replace('\\', '/'));
        name = new string(name.Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        if (name.Length is 0 or > 200) throw Bad("Choose a file with a name of up to 200 characters.");
        return name;
    }

    private static string SafeReference(string reference) =>
        new string(reference.Select(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_' ? ch : '-').ToArray()).Trim('-');

    internal static string AgreementFileName(string reference, int version, int? issue, string suffix = "") =>
        $"MyPetLink_Consignment_{SafeReference(reference)}_v{version}{(issue is > 1 ? "_issue" + issue : "")}{suffix}.pdf";

    private static byte[] BrandLogo()
    {
        var assembly = typeof(ConsignmentService).Assembly;
        var resource = assembly.GetManifestResourceNames().SingleOrDefault(n => n.EndsWith("Assets.Brand.mypetlink-logo-horizontal.png", StringComparison.Ordinal));
        if (resource is null) return [];
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }
}
