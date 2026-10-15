using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class MerchantDirectoryService(
    MyPetLinkDbContext db, IAuditLogService audit, TimeProvider time,
    IOptions<CloudflareR2Options>? r2 = null, IMediaService? mediaService = null,
    IAdminAccessResolver? adminAccess = null, ILogger<MerchantDirectoryService>? logger = null)
{
    private CloudflareR2Options R2 => r2?.Value ?? new CloudflareR2Options();

    public async Task<AdminMerchantListingResponse> UpdateLogoAsync(
        Guid? actor, Guid merchantId, UpdateMerchantLogoRequest request, CancellationToken ct)
    {
        var access = adminAccess is null ? AdminAccessSnapshot.None : await adminAccess.ResolveAsync(actor, ct);
        if (!access.Has(AdminCapabilities.SalesManage))
            throw new ApiException(403, "forbidden", "You do not have access to manage merchant logos.");
        Validate(request);
        var merchant = await RequireMerchant(merchantId, ct);
        Concurrency(merchant, merchant.RowVersion, request.ConcurrencyToken);
        MediaFile? logo = null;
        if (request.MediaId is { } id)
        {
            logo = await db.MediaFiles.Include(m => m.Links).SingleOrDefaultAsync(m => m.Id == id, ct);
            if (!EligibleLogo(logo, merchantId))
                throw Invalid("mediaId", "Choose a completed logo uploaded for this merchant.");
        }
        var old = merchant.LogoMediaFile;
        var retireOld = old?.Category == MediaUploadCategory.MerchantLogo
            && old.Links.Any(l => l.OwnerType == MediaOwnerType.Merchant && l.OwnerId == merchantId);
        if (merchant.LogoMediaFileId == request.MediaId) return Listing(merchant);
        merchant.LogoMediaFileId = logo?.Id;
        merchant.LogoMediaFile = logo;
        merchant.UpdatedAt = time.GetUtcNow();
        if (retireOld && old is not null)
        {
            old.UploadStatus = MediaUploadStatus.Deleted;
            old.DeletedAt = time.GetUtcNow();
            foreach (var link in old.Links) link.ArchivedAt ??= time.GetUtcNow();
        }
        audit.Append(actor, ActorType.Admin, "merchant.logo.update", "Merchant", merchantId,
            new { LogoMediaFileId = old?.Id }, new { merchant.LogoMediaFileId });
        // Reference, old-file retirement, audit and merchant rowversion change
        // commit atomically. Publication and branch settings are untouched.
        await Save(ct);
        if (retireOld && old is not null && mediaService is not null)
        {
            try { await mediaService.DeleteAsync(actor, old.Id, CancellationToken.None); }
            catch (Exception e) { logger?.LogWarning(e, "Could not clean up replaced merchant logo {MediaId}.", old.Id); }
        }
        return Listing(merchant);
    }

    private bool EligibleLogo(MediaFile? media, Guid merchantId) => media is
        { Category: MediaUploadCategory.MerchantLogo, MediaType: MediaFileType.Image,
          UploadStatus: MediaUploadStatus.Ready, IsPublic: true, DeletedAt: null }
        && media.BucketName == R2.PublicBucketName
        && media.ObjectKey.StartsWith("merchant-logos/", StringComparison.Ordinal)
        && !media.ObjectKey.StartsWith("merchant-logos/pending/", StringComparison.Ordinal)
        && media.Links.Any(l => l.OwnerType == MediaOwnerType.Merchant && l.OwnerId == merchantId && l.ArchivedAt == null);
    public async Task<AdminMerchantListingResponse> GetListingAsync(Guid merchantId, CancellationToken ct)
    {
        var merchant = await RequireMerchant(merchantId, ct);
        return Listing(merchant);
    }

    public async Task<AdminMerchantListingResponse> UpdateListingAsync(
        Guid? actor, Guid merchantId, UpdateMerchantListingRequest request, CancellationToken ct)
    {
        Validate(request);
        var merchant = await RequireMerchant(merchantId, ct);
        Concurrency(merchant, merchant.RowVersion, request.ConcurrencyToken);
        var enabling = request.ShowOnWebsite && !merchant.ShowOnWebsite;
        if (enabling)
        {
            ValidatePermission(request.Permission);
            var selected = merchant.Branches.Where(b => b.ShowOnWebsite).Select(b => b.Id).ToHashSet();
            var agreed = request.Permission!.BranchIds;
            if (agreed is null || agreed.Count > 100 || agreed.Count != agreed.Distinct().Count()
                || !selected.SetEquals(agreed))
                throw Invalid("permission.branchIds", "Confirm permission for every selected branch, including inactive branches.");
        }
        var before = new { merchant.ShowOnWebsite, merchant.BusinessDescription };
        merchant.ShowOnWebsite = request.ShowOnWebsite;
        merchant.BusinessDescription = Trim(request.BusinessDescription);
        merchant.DirectoryPublicCode ??= Guid.NewGuid().ToString("N");
        merchant.UpdatedAt = time.GetUtcNow();
        audit.Append(actor, ActorType.Admin, "merchant.listing.update", "Merchant", merchant.Id,
            before, new { merchant.ShowOnWebsite, merchant.BusinessDescription,
                Permission = enabling ? PermissionSnapshot(request.Permission!, merchant.Branches.Where(b => b.ShowOnWebsite)) : null,
                WithdrawalReason = !request.ShowOnWebsite ? Trim(request.WithdrawalReason) : null });
        await Save(ct);
        return Listing(merchant);
    }

    public async Task<AdminMerchantListingResponse> UpsertBranchAsync(
        Guid? actor, Guid merchantId, Guid? branchId, UpsertMerchantBranchRequest request, CancellationToken ct)
    {
        Validate(request);
        if (request.Address is null) throw Invalid("address", "Enter the branch address.");
        Validate(request.Address, "address.");
        if (request.Latitude.HasValue != request.Longitude.HasValue)
            throw Invalid("latitude", "Enter both latitude and longitude, or leave both empty.");
        ValidatePhone(request.ContactPhone, "contactPhone");
        ValidatePhone(request.WhatsApp, "whatsApp");
        var maps = PartnerNavigationUrls.Normalize(request.GoogleMapsUrl, false);
        var waze = PartnerNavigationUrls.Normalize(request.WazeUrl, true);
        var merchant = await RequireMerchant(merchantId, ct);
        MerchantBranch branch;
        if (request.MerchantConcurrencyToken is not null)
            Concurrency(merchant, merchant.RowVersion, request.MerchantConcurrencyToken);
        object? before = null;
        if (branchId.HasValue)
        {
            // Parent-scoped lookup prevents editing a branch through a different merchant.
            branch = merchant.Branches.SingleOrDefault(b => b.Id == branchId)
                ?? throw new ApiException(404, "branch_not_found", "That branch could not be found.");
            Concurrency(branch, branch.RowVersion, request.ConcurrencyToken);
            before = Branch(branch, merchant);
        }
        else
        {
            if (merchant.Branches.Count >= 100)
                throw Invalid("name", "A merchant can have up to 100 branches. Edit an existing branch instead.");
            branch = new MerchantBranch { MerchantId = merchant.Id, Merchant = merchant };
        }
        // Selected branches must stay within the agreed scope even while a
        // commercially inactive merchant is waiting to be reactivated.
        var enablingBranch = merchant.ShowOnWebsite && request.ShowOnWebsite && request.IsActive
            && (!branch.ShowOnWebsite || !branch.IsActive || !branchId.HasValue || ScopeChanged(branch, request));
        if (enablingBranch) ValidatePermission(request.Permission);
        // Serialize publication scope against all branch edits. A merchant
        // permission confirmation must not race a new branch opt-in/address.
        merchant.UpdatedAt = time.GetUtcNow();
        db.Entry(merchant).Property(m => m.UpdatedAt).IsModified = true;
        if (!branchId.HasValue)
        {
            merchant.Branches.Add(branch);
            db.MerchantBranches.Add(branch);
        }
        branch.Name = request.Name.Trim();
        branch.AddressLine1 = request.Address.AddressLine1.Trim();
        branch.AddressLine2 = Trim(request.Address.AddressLine2);
        branch.City = request.Address.City.Trim();
        branch.State = request.Address.State.Trim();
        branch.Postcode = request.Address.Postcode.Trim();
        branch.Country = request.Address.Country.Trim();
        branch.GoogleMapsUrl = maps;
        branch.WazeUrl = waze;
        branch.Latitude = request.Latitude;
        branch.Longitude = request.Longitude;
        branch.ContactPhone = Trim(request.ContactPhone);
        branch.WhatsApp = Trim(request.WhatsApp);
        branch.BusinessHours = Trim(request.BusinessHours);
        branch.IsActive = request.IsActive;
        branch.ShowOnWebsite = request.ShowOnWebsite;
        branch.DisplayOrder = request.DisplayOrder;
        branch.UpdatedAt = time.GetUtcNow();
        audit.Append(actor, ActorType.Admin, branchId.HasValue ? "merchant.branch.update" : "merchant.branch.create",
            "MerchantBranch", branch.Id, before, new { merchantId, Branch = Branch(branch, merchant),
                Permission = enablingBranch ? PermissionSnapshot(request.Permission!, [branch]) : null,
                WithdrawalReason = !request.ShowOnWebsite || !request.IsActive ? Trim(request.WithdrawalReason) : null });
        await Save(ct);
        return Listing(merchant);
    }

    public async Task<(IReadOnlyCollection<PublicPartnerStoreResponse> Items, int Total)> ListPublicAsync(
        int page, int pageSize, string? search, string? publicCode, CancellationToken ct)
    {
        if (page < 1 || pageSize is < 1 or > 100) throw Invalid("page", "Choose a valid page and page size.");
        // Privacy is enforced in both SQL selection and projection. Neither the
        // admin DTO nor billing/contact fields ever cross this boundary.
        var query = db.Merchants.AsNoTracking().Where(m => m.IsActive && m.ShowOnWebsite
            && m.DirectoryPublicCode != null && m.Branches.Any(b => b.IsActive && b.ShowOnWebsite));
        if (!string.IsNullOrWhiteSpace(publicCode)) query = query.Where(m => m.DirectoryPublicCode == publicCode);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            if (term.Length > 160) throw Invalid("search", "Search must be 160 characters or fewer.");
            query = query.Where(m => (m.TradingName ?? m.LegalBusinessName).Contains(term)
                || m.Branches.Any(b => b.IsActive && b.ShowOnWebsite &&
                    (b.Name.Contains(term) || b.City.Contains(term) || b.State.Contains(term)
                        || b.Postcode.Contains(term) || b.AddressLine1.Contains(term))));
        }
        var total = await query.CountAsync(ct);
        var publicBucket = R2.PublicBucketName;
        var publicBase = R2.PublicBaseUrl;
        var merchants = await query.OrderBy(m => m.TradingName ?? m.LegalBusinessName).ThenBy(m => m.Id)
            .Skip((int)Math.Min((long)(page - 1) * pageSize, int.MaxValue)).Take(pageSize)
            .Select(m => new PublicPartnerStoreResponse(m.DirectoryPublicCode!, m.TradingName ?? m.LegalBusinessName,
                m.BusinessDescription, m.Branches.Where(b => b.IsActive && b.ShowOnWebsite)
                    .OrderBy(b => b.DisplayOrder).ThenBy(b => b.Name).ThenBy(b => b.Id)
                    .Select(b => new PublicPartnerBranchResponse(b.Name,
                        new MerchantAddressDto(b.AddressLine1, b.AddressLine2, b.Postcode, b.City, b.State, b.Country),
                        b.GoogleMapsUrl, b.WazeUrl, b.Latitude, b.Longitude, b.ContactPhone, b.WhatsApp, b.BusinessHours)).ToArray(),
                m.LogoMediaFile != null && m.LogoMediaFile.Category == MediaUploadCategory.MerchantLogo
                    && m.LogoMediaFile.MediaType == MediaFileType.Image && m.LogoMediaFile.IsPublic
                    && m.LogoMediaFile.UploadStatus == MediaUploadStatus.Ready && m.LogoMediaFile.DeletedAt == null
                    && m.LogoMediaFile.BucketName == publicBucket
                    && m.LogoMediaFile.ObjectKey.StartsWith("merchant-logos/")
                    && !m.LogoMediaFile.ObjectKey.StartsWith("merchant-logos/pending/")
                    && m.LogoMediaFile.Links.Any(l => l.OwnerType == MediaOwnerType.Merchant && l.OwnerId == m.Id && l.ArchivedAt == null)
                    ? MediaUrlBuilder.BuildPublicUrl(publicBase, m.LogoMediaFile.ObjectKey) : null))
            .ToArrayAsync(ct);
        return (merchants.Select(m => m with { Branches = m.Branches.Select(b => b with {
            GoogleMapsUrl = b.GoogleMapsUrl ?? (b.Latitude.HasValue && b.Longitude.HasValue ? PartnerNavigationUrls.Google(b.Latitude.Value, b.Longitude.Value) : null),
            WazeUrl = b.WazeUrl ?? (b.Latitude.HasValue && b.Longitude.HasValue ? PartnerNavigationUrls.Waze(b.Latitude.Value, b.Longitude.Value) : null)
        }).ToArray() }).ToArray(), total);
    }

    private async Task<Merchant> RequireMerchant(Guid id, CancellationToken ct) =>
        await db.Merchants.Include(m => m.Branches).Include(m => m.LogoMediaFile).ThenInclude(m => m!.Links)
            .SingleOrDefaultAsync(m => m.Id == id, ct)
        ?? throw new ApiException(404, "merchant_not_found", "That merchant could not be found.");
    private AdminMerchantListingResponse Listing(Merchant m) => new(
        m.ShowOnWebsite, m.BusinessDescription, m.IsActive && m.ShowOnWebsite && m.Branches.Any(b => b.IsActive && b.ShowOnWebsite),
        m.DirectoryPublicCode, Convert.ToBase64String(m.RowVersion),
        m.Branches.OrderBy(b => b.DisplayOrder).ThenBy(b => b.Name).Select(b => Branch(b, m)).ToArray(), m.IsActive,
        EligibleLogo(m.LogoMediaFile, m.Id) ? m.LogoMediaFileId : null,
        EligibleLogo(m.LogoMediaFile, m.Id) ? MediaUrlBuilder.BuildPublicUrl(R2.PublicBaseUrl, m.LogoMediaFile!.ObjectKey) : null);
    private static AdminMerchantBranchResponse Branch(MerchantBranch b, Merchant m) => new(
        b.Id, b.Name, new(b.AddressLine1, b.AddressLine2, b.Postcode, b.City, b.State, b.Country),
        b.GoogleMapsUrl, b.WazeUrl, b.Latitude, b.Longitude, b.ContactPhone, b.WhatsApp, b.BusinessHours,
        b.IsActive, b.ShowOnWebsite, b.DisplayOrder, m.IsActive && m.ShowOnWebsite && b.IsActive && b.ShowOnWebsite,
        Convert.ToBase64String(b.RowVersion));
    private void Concurrency(object entity, byte[] current, string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw Invalid("concurrencyToken", "Reload this record before saving.");
        byte[] expected;
        try { expected = Convert.FromBase64String(token); }
        catch (FormatException) { throw Invalid("concurrencyToken", "Reload this record before saving."); }
        if (!current.SequenceEqual(expected)) throw new ApiException(409, "concurrency_conflict", "This record changed. Reload before saving.");
        db.Entry(entity).Property("RowVersion").OriginalValue = expected;
    }
    private async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw new ApiException(409, "concurrency_conflict", "This record changed. Reload before saving."); }
    }
    private static void Validate(object value, string prefix = "")
    {
        // Positional record validation attributes belong to constructor
        // parameters (the same metadata MVC uses), rather than properties.
        var errors = new Dictionary<string, string[]>();
        var parameters = value.GetType().GetConstructors().OrderByDescending(c => c.GetParameters().Length)
            .First().GetParameters();
        foreach (var parameter in parameters)
        {
            var property = value.GetType().GetProperty(parameter.Name!);
            if (property is null) continue;
            var results = new List<ValidationResult>();
            Validator.TryValidateValue(property.GetValue(value), new ValidationContext(value) { MemberName = property.Name },
                results, parameter.GetCustomAttributes<ValidationAttribute>());
            if (results.Count > 0) errors[prefix + property.Name] = results.Select(r => r.ErrorMessage ?? "Check this field.").ToArray();
        }
        if (errors.Count > 0) throw new ApiException(400, "validation_failed", "Please check the highlighted fields.", errors);
    }
    private static void ValidatePhone(string? value, string field)
    {
        if (!string.IsNullOrWhiteSpace(value) && !Regex.IsMatch(value, @"^\+[1-9][0-9]{7,14}$"))
            throw Invalid(field, "Enter a valid phone number including the country code.");
    }
    private static void ValidatePermission(PublicationPermissionRequest? permission)
    {
        if (permission is null) throw Invalid("permission.reference", "Record the merchant’s permission before publishing.");
        Validate(permission, "permission.");
        if (permission.Source is not ("WhatsApp" or "Email" or "WrittenAgreement" or "Other"))
            throw Invalid("permission.source", "Choose a permission source.");
    }
    private static object PermissionSnapshot(PublicationPermissionRequest permission, IEnumerable<MerchantBranch> branches) => new
    {
        permission.Source, Reference = permission.Reference.Trim(),
        // Snapshot names and addresses: later edits must not rewrite agreed scope.
        Branches = branches.OrderBy(b => b.Id).Select(b => new { b.Id, b.Name, b.AddressLine1, b.AddressLine2, b.City, b.State, b.Postcode, b.Country }).ToArray()
    };
    private static bool ScopeChanged(MerchantBranch branch, UpsertMerchantBranchRequest request) =>
        branch.Name != request.Name.Trim() || branch.AddressLine1 != request.Address.AddressLine1.Trim()
        || branch.AddressLine2 != Trim(request.Address.AddressLine2) || branch.City != request.Address.City.Trim()
        || branch.State != request.Address.State.Trim() || branch.Postcode != request.Address.Postcode.Trim()
        || branch.Country != request.Address.Country.Trim();
    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiException Invalid(string field, string message) => new(400, "validation_failed", message,
        new Dictionary<string, string[]> { [field] = [message] });
}
