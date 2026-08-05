using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IMerchantSalesService
{
    // Merchants
    Task<(IReadOnlyCollection<MerchantResponse> Items, int Total)> ListMerchantsAsync(
        int page, int pageSize, string? search, bool? isActive, Guid? salespersonId,
        string? state, CancellationToken cancellationToken);
    Task<MerchantResponse> GetMerchantAsync(Guid id, CancellationToken cancellationToken);
    Task<MerchantResponse> CreateMerchantAsync(Guid? actorId, UpsertMerchantRequest request, CancellationToken cancellationToken);
    Task<MerchantResponse> UpdateMerchantAsync(Guid? actorId, Guid id, UpsertMerchantRequest request, CancellationToken cancellationToken);
    Task<MerchantResponse> SetMerchantActiveAsync(Guid? actorId, Guid id, bool isActive, string? concurrencyToken, CancellationToken cancellationToken);

    // Salespersons
    Task<(IReadOnlyCollection<SalespersonResponse> Items, int Total)> ListSalespersonsAsync(
        int page, int pageSize, string? search, bool? isActive, CancellationToken cancellationToken);
    Task<SalespersonResponse> GetSalespersonAsync(Guid id, CancellationToken cancellationToken);
    Task<SalespersonResponse> CreateSalespersonAsync(Guid? actorId, UpsertSalespersonRequest request, CancellationToken cancellationToken);
    Task<SalespersonResponse> UpdateSalespersonAsync(Guid? actorId, Guid id, UpsertSalespersonRequest request, CancellationToken cancellationToken);
    Task<SalespersonResponse> SetSalespersonActiveAsync(Guid? actorId, Guid id, bool isActive, string? concurrencyToken, CancellationToken cancellationToken);

    // Quotations
    Task<(IReadOnlyCollection<QuotationResponse> Items, int Total)> ListQuotationsAsync(
        int page, int pageSize, string? search, MerchantQuotationStatus? status, Guid? merchantId,
        Guid? salespersonId, DateTimeOffset? fromDate, DateTimeOffset? toDate, bool? expired,
        CancellationToken cancellationToken);
    Task<QuotationResponse> GetQuotationAsync(Guid id, CancellationToken cancellationToken);
    Task<QuotationResponse> CreateQuotationAsync(Guid? actorId, UpsertQuotationRequest request, CancellationToken cancellationToken);
    Task<QuotationResponse> UpdateQuotationAsync(Guid? actorId, Guid id, UpsertQuotationRequest request, CancellationToken cancellationToken);
    Task<QuotationResponse> TransitionQuotationAsync(
        Guid? actorId, Guid id, MerchantQuotationStatus target, string? concurrencyToken, CancellationToken cancellationToken);
    Task<ConvertQuotationResult> ConvertQuotationAsync(Guid? actorId, Guid id, string? concurrencyToken, CancellationToken cancellationToken);

    // Merchant orders
    Task<(IReadOnlyCollection<MerchantOrderResponse> Items, int Total)> ListMerchantOrdersAsync(
        int page, int pageSize, string? search, MerchantOrderPaymentStatus? paymentStatus,
        Guid? merchantId, Guid? salespersonId, DateTimeOffset? fromDate, DateTimeOffset? toDate,
        CancellationToken cancellationToken);
    Task<MerchantOrderResponse> GetMerchantOrderAsync(Guid id, CancellationToken cancellationToken);
    Task<MerchantOrderResponse> CancelMerchantOrderAsync(Guid? actorId, Guid id, string? concurrencyToken, CancellationToken cancellationToken);
}

public sealed class MerchantSalesService : IMerchantSalesService
{
    private static readonly Regex EmailPattern =
        new(@"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    // Malaysian numbers in E.164 or local form; deliberately permissive about
    // spacing and dashes, strict about the characters allowed.
    private static readonly Regex PhonePattern =
        new(@"^\+?[0-9][0-9\s\-]{6,20}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IDocumentNumberService _numbers;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public MerchantSalesService(
        MyPetLinkDbContext dbContext,
        IDocumentNumberService numbers,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _numbers = numbers;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    // ================= Merchants =================

    public async Task<(IReadOnlyCollection<MerchantResponse> Items, int Total)> ListMerchantsAsync(
        int page, int pageSize, string? search, bool? isActive, Guid? salespersonId,
        string? state, CancellationToken cancellationToken)
    {
        var query = _dbContext.Merchants
            .AsNoTracking()
            .Include(merchant => merchant.AssignedSalesperson)
            .AsQueryable();

        if (isActive.HasValue) query = query.Where(m => m.IsActive == isActive.Value);
        if (salespersonId.HasValue) query = query.Where(m => m.AssignedSalespersonId == salespersonId.Value);
        if (!string.IsNullOrWhiteSpace(state)) query = query.Where(m => m.BillingState == state);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(m =>
                m.MerchantCode.Contains(term) ||
                m.LegalBusinessName.Contains(term) ||
                m.ContactPerson.Contains(term) ||
                m.ContactEmail.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(m => m.MerchantCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items.Select(ToResponse).ToArray(), total);
    }

    public async Task<MerchantResponse> GetMerchantAsync(Guid id, CancellationToken cancellationToken) =>
        ToResponse(await RequireMerchantAsync(id, cancellationToken));

    public async Task<MerchantResponse> CreateMerchantAsync(
        Guid? actorId, UpsertMerchantRequest request, CancellationToken cancellationToken)
    {
        ValidateMerchant(request);
        await GuardDuplicateRegistrationAsync(request.BusinessRegistrationNumber, null, cancellationToken);
        var salesperson = await ResolveAssignableSalespersonAsync(request.AssignedSalespersonId, cancellationToken);

        var now = _timeProvider.GetUtcNow();
        var merchant = new Merchant
        {
            MerchantCode = await _numbers.NextMerchantCodeAsync(cancellationToken),
            PaymentTerm = MerchantPaymentTerm.Prepaid,
            CreatedAt = now,
            UpdatedAt = now,
        };

        ApplyMerchant(merchant, request, salesperson);
        _dbContext.Merchants.Add(merchant);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _auditLogService.Append(actorId, ActorType.Admin, "merchant.create", "Merchant", merchant.Id,
            null, MerchantAuditSnapshot(merchant));
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToResponse(await RequireMerchantAsync(merchant.Id, cancellationToken));
    }

    public async Task<MerchantResponse> UpdateMerchantAsync(
        Guid? actorId, Guid id, UpsertMerchantRequest request, CancellationToken cancellationToken)
    {
        ValidateMerchant(request);
        var merchant = await RequireMerchantAsync(id, cancellationToken, tracked: true);
        ApplyConcurrency(merchant, request.ConcurrencyToken);
        await GuardDuplicateRegistrationAsync(request.BusinessRegistrationNumber, id, cancellationToken);

        var salesperson = await ResolveAssignableSalespersonAsync(
            request.AssignedSalespersonId, cancellationToken, merchant.AssignedSalespersonId);

        var before = MerchantAuditSnapshot(merchant);
        ApplyMerchant(merchant, request, salesperson);
        merchant.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(actorId, ActorType.Admin, "merchant.update", "Merchant", merchant.Id,
            before, MerchantAuditSnapshot(merchant));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireMerchantAsync(id, cancellationToken));
    }

    public async Task<MerchantResponse> SetMerchantActiveAsync(
        Guid? actorId, Guid id, bool isActive, string? concurrencyToken, CancellationToken cancellationToken)
    {
        var merchant = await RequireMerchantAsync(id, cancellationToken, tracked: true);

        // Repeating the action is a no-op rather than an error: a retried
        // request should not fail just because it already succeeded.
        if (merchant.IsActive == isActive)
        {
            return ToResponse(merchant);
        }

        ApplyConcurrency(merchant, concurrencyToken);
        var before = MerchantAuditSnapshot(merchant);
        merchant.IsActive = isActive;
        merchant.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(actorId, ActorType.Admin,
            isActive ? "merchant.activate" : "merchant.deactivate", "Merchant", merchant.Id,
            before, MerchantAuditSnapshot(merchant));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireMerchantAsync(id, cancellationToken));
    }

    // ================= Salespersons =================

    public async Task<(IReadOnlyCollection<SalespersonResponse> Items, int Total)> ListSalespersonsAsync(
        int page, int pageSize, string? search, bool? isActive, CancellationToken cancellationToken)
    {
        var query = _dbContext.Salespersons.AsNoTracking().AsQueryable();

        if (isActive.HasValue) query = query.Where(s => s.IsActive == isActive.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(s => s.SalespersonCode.Contains(term) || s.Name.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(s => s.SalespersonCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items.Select(ToResponse).ToArray(), total);
    }

    public async Task<SalespersonResponse> GetSalespersonAsync(Guid id, CancellationToken cancellationToken) =>
        ToResponse(await RequireSalespersonAsync(id, cancellationToken));

    public async Task<SalespersonResponse> CreateSalespersonAsync(
        Guid? actorId, UpsertSalespersonRequest request, CancellationToken cancellationToken)
    {
        ValidateSalesperson(request);

        var now = _timeProvider.GetUtcNow();
        var salesperson = new Salesperson
        {
            SalespersonCode = await _numbers.NextSalespersonCodeAsync(cancellationToken),
            Name = request.Name.Trim(),
            Email = Trimmed(request.Email),
            Phone = Trimmed(request.Phone),
            DefaultCommissionPercentage = request.DefaultCommissionPercentage,
            InternalNotes = Trimmed(request.InternalNotes),
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _dbContext.Salespersons.Add(salesperson);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _auditLogService.Append(actorId, ActorType.Admin, "salesperson.create", "Salesperson",
            salesperson.Id, null, SalespersonAuditSnapshot(salesperson));
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToResponse(salesperson);
    }

    public async Task<SalespersonResponse> UpdateSalespersonAsync(
        Guid? actorId, Guid id, UpsertSalespersonRequest request, CancellationToken cancellationToken)
    {
        ValidateSalesperson(request);
        var salesperson = await RequireSalespersonAsync(id, cancellationToken, tracked: true);
        ApplyConcurrency(salesperson, request.ConcurrencyToken);

        var before = SalespersonAuditSnapshot(salesperson);
        salesperson.Name = request.Name.Trim();
        salesperson.Email = Trimmed(request.Email);
        salesperson.Phone = Trimmed(request.Phone);
        salesperson.DefaultCommissionPercentage = request.DefaultCommissionPercentage;
        salesperson.InternalNotes = Trimmed(request.InternalNotes);
        salesperson.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(actorId, ActorType.Admin, "salesperson.update", "Salesperson",
            salesperson.Id, before, SalespersonAuditSnapshot(salesperson));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireSalespersonAsync(id, cancellationToken));
    }

    public async Task<SalespersonResponse> SetSalespersonActiveAsync(
        Guid? actorId, Guid id, bool isActive, string? concurrencyToken, CancellationToken cancellationToken)
    {
        var salesperson = await RequireSalespersonAsync(id, cancellationToken, tracked: true);

        if (salesperson.IsActive == isActive)
        {
            return ToResponse(salesperson);
        }

        ApplyConcurrency(salesperson, concurrencyToken);
        var before = SalespersonAuditSnapshot(salesperson);
        salesperson.IsActive = isActive;
        salesperson.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(actorId, ActorType.Admin,
            isActive ? "salesperson.activate" : "salesperson.deactivate", "Salesperson",
            salesperson.Id, before, SalespersonAuditSnapshot(salesperson));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireSalespersonAsync(id, cancellationToken));
    }

    // ================= Quotations =================

    public async Task<(IReadOnlyCollection<QuotationResponse> Items, int Total)> ListQuotationsAsync(
        int page, int pageSize, string? search, MerchantQuotationStatus? status, Guid? merchantId,
        Guid? salespersonId, DateTimeOffset? fromDate, DateTimeOffset? toDate, bool? expired,
        CancellationToken cancellationToken)
    {
        var query = QuotationQuery().AsQueryable();

        if (status.HasValue) query = query.Where(q => q.Status == status.Value);
        if (merchantId.HasValue) query = query.Where(q => q.MerchantId == merchantId.Value);
        if (salespersonId.HasValue) query = query.Where(q => q.SalespersonId == salespersonId.Value);
        if (fromDate.HasValue) query = query.Where(q => q.QuotationDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(q => q.QuotationDate <= toDate.Value);

        if (expired == true)
        {
            var now = _timeProvider.GetUtcNow();
            query = query.Where(q => q.ValidUntil < now &&
                (q.Status == MerchantQuotationStatus.Sent || q.Status == MerchantQuotationStatus.Expired));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(q =>
                q.QuotationNumber.Contains(term) || q.MerchantLegalNameSnapshot.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(q => q.QuotationDate)
            .ThenByDescending(q => q.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items.Select(ToResponse).ToArray(), total);
    }

    public async Task<QuotationResponse> GetQuotationAsync(Guid id, CancellationToken cancellationToken) =>
        ToResponse(await RequireQuotationAsync(id, cancellationToken));

    public async Task<QuotationResponse> CreateQuotationAsync(
        Guid? actorId, UpsertQuotationRequest request, CancellationToken cancellationToken)
    {
        var merchant = await RequireMerchantAsync(request.MerchantId, cancellationToken);

        if (!merchant.IsActive)
        {
            throw Validation("merchantId", "This merchant is inactive and cannot receive a new quotation.");
        }

        var salesperson = await ResolveAssignableSalespersonAsync(
            request.SalespersonId ?? merchant.AssignedSalespersonId, cancellationToken);

        var now = _timeProvider.GetUtcNow();
        var quotation = new MerchantQuotation
        {
            QuotationNumber = await _numbers.NextQuotationNumberAsync(now, cancellationToken),
            MerchantId = merchant.Id,
            QuotationDate = now,
            ValidUntil = request.ValidUntil
                ?? now.AddDays(MerchantSalesConstants.DefaultQuotationValidityDays),
            Currency = MerchantSalesConstants.Currency,
            PaymentTermSnapshot = merchant.PaymentTerm,
            Status = MerchantQuotationStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now,
        };

        CaptureMerchantSnapshot(quotation, merchant);
        CaptureSalespersonSnapshot(quotation, salesperson);
        await ApplyQuotationContentAsync(quotation, request, cancellationToken);

        _dbContext.MerchantQuotations.Add(quotation);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _auditLogService.Append(actorId, ActorType.Admin, "quotation.create", "MerchantQuotation",
            quotation.Id, null, QuotationAuditSnapshot(quotation));
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToResponse(await RequireQuotationAsync(quotation.Id, cancellationToken));
    }

    public async Task<QuotationResponse> UpdateQuotationAsync(
        Guid? actorId, Guid id, UpsertQuotationRequest request, CancellationToken cancellationToken)
    {
        var quotation = await RequireQuotationAsync(id, cancellationToken, tracked: true);

        // Smallest safe rule: money is editable only while the quotation is a
        // Draft. Once it has been Sent the merchant has seen these figures, so
        // changing them silently would make the sent copy a lie. Re-quoting
        // means issuing a new quotation.
        if (quotation.Status != MerchantQuotationStatus.Draft)
        {
            throw Conflict("quotation_not_editable",
                "Only a draft quotation can be edited. Create a new quotation instead.");
        }

        ApplyConcurrency(quotation, request.ConcurrencyToken);

        if (quotation.MerchantId != request.MerchantId)
        {
            throw Validation("merchantId", "A quotation cannot be moved to a different merchant.");
        }

        var salesperson = await ResolveAssignableSalespersonAsync(
            request.SalespersonId, cancellationToken, quotation.SalespersonId);

        var before = QuotationAuditSnapshot(quotation);
        CaptureSalespersonSnapshot(quotation, salesperson);
        if (request.ValidUntil.HasValue) quotation.ValidUntil = request.ValidUntil.Value;
        await ApplyQuotationContentAsync(quotation, request, cancellationToken);
        quotation.UpdatedAt = _timeProvider.GetUtcNow();

        _auditLogService.Append(actorId, ActorType.Admin, "quotation.update", "MerchantQuotation",
            quotation.Id, before, QuotationAuditSnapshot(quotation));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireQuotationAsync(id, cancellationToken));
    }

    public async Task<QuotationResponse> TransitionQuotationAsync(
        Guid? actorId, Guid id, MerchantQuotationStatus target, string? concurrencyToken,
        CancellationToken cancellationToken)
    {
        var quotation = await RequireQuotationAsync(id, cancellationToken, tracked: true);

        // Asking for the state it is already in succeeds without doing anything,
        // so a retry after a dropped response is safe.
        if (quotation.Status == target)
        {
            return ToResponse(quotation);
        }

        if (!IsTransitionAllowed(quotation.Status, target))
        {
            throw Conflict("invalid_quotation_transition",
                $"A {Describe(quotation.Status)} quotation cannot become {Describe(target)}.");
        }

        ApplyConcurrency(quotation, concurrencyToken);
        var before = QuotationAuditSnapshot(quotation);
        var now = _timeProvider.GetUtcNow();

        quotation.Status = target;
        quotation.UpdatedAt = now;

        switch (target)
        {
            case MerchantQuotationStatus.Sent: quotation.SentAt = now; break;
            case MerchantQuotationStatus.Accepted: quotation.AcceptedAt = now; break;
            case MerchantQuotationStatus.Rejected: quotation.RejectedAt = now; break;
            case MerchantQuotationStatus.Expired: quotation.ExpiredAt = now; break;
            case MerchantQuotationStatus.Cancelled: quotation.CancelledAt = now; break;
        }

        _auditLogService.Append(actorId, ActorType.Admin, AuditActionFor(target), "MerchantQuotation",
            quotation.Id, before, QuotationAuditSnapshot(quotation));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireQuotationAsync(id, cancellationToken));
    }

    public async Task<ConvertQuotationResult> ConvertQuotationAsync(
        Guid? actorId, Guid id, string? concurrencyToken, CancellationToken cancellationToken)
    {
        var quotation = await RequireQuotationAsync(id, cancellationToken, tracked: true);

        // Already converted: hand back the order that exists. Two clicks on the
        // same button must never produce two orders.
        if (quotation.Status == MerchantQuotationStatus.Converted &&
            quotation.ConvertedMerchantOrderId.HasValue)
        {
            var existing = await RequireMerchantOrderAsync(
                quotation.ConvertedMerchantOrderId.Value, cancellationToken);
            return new ConvertQuotationResult(ToResponse(existing), AlreadyConverted: true);
        }

        if (quotation.Status != MerchantQuotationStatus.Accepted)
        {
            throw Conflict("quotation_not_convertible",
                $"Only an accepted quotation can become an order. This one is {Describe(quotation.Status)}.");
        }

        if (quotation.ValidUntil < _timeProvider.GetUtcNow())
        {
            throw Conflict("quotation_expired",
                "This quotation has passed its valid-until date. Issue a new quotation.");
        }

        ApplyConcurrency(quotation, concurrencyToken);

        var merchant = await RequireMerchantAsync(quotation.MerchantId, cancellationToken);
        if (!merchant.IsActive)
        {
            throw Conflict("merchant_inactive",
                "This merchant is inactive and cannot receive a new order.");
        }

        await RevalidateVariantsAsync(quotation.Items, cancellationToken);

        var now = _timeProvider.GetUtcNow();
        var order = new MerchantOrder
        {
            MerchantOrderNumber = await _numbers.NextMerchantOrderNumberAsync(now, cancellationToken),
            SourceQuotationId = quotation.Id,
            MerchantId = quotation.MerchantId,
            SalespersonId = quotation.SalespersonId,
            PaymentTermSnapshot = quotation.PaymentTermSnapshot,
            Currency = quotation.Currency,
            // Copied, never recalculated: the merchant accepted these figures.
            MerchandiseSubtotal = quotation.MerchandiseSubtotal,
            DiscountTotal = quotation.DiscountTotal,
            DeliveryFee = quotation.DeliveryFee,
            GrandTotal = quotation.GrandTotal,
            PaymentStatus = MerchantOrderPaymentStatus.AwaitingPayment,
            FulfilmentStatus = MerchantOrderFulfilmentStatus.NotStarted,
            CreatedAt = now,
            UpdatedAt = now,
        };

        CopySnapshots(quotation, order);

        foreach (var line in quotation.Items.OrderBy(item => item.SortOrder))
        {
            order.Items.Add(new MerchantOrderItem
            {
                ProductId = line.ProductId,
                ProductVariantId = line.ProductVariantId,
                ProductNameSnapshot = line.ProductNameSnapshot,
                SkuCodeSnapshot = line.SkuCodeSnapshot,
                OptionNameSnapshot = line.OptionNameSnapshot,
                SupportsQrSnapshot = line.SupportsQrSnapshot,
                SupportsNfcSnapshot = line.SupportsNfcSnapshot,
                UnitWeightGramsSnapshot = line.UnitWeightGramsSnapshot,
                Quantity = line.Quantity,
                WholesaleUnitPrice = line.WholesaleUnitPrice,
                LineDiscount = line.LineDiscount,
                LineSubtotal = line.LineSubtotal,
                SortOrder = line.SortOrder,
            });
        }

        var quotationBefore = QuotationAuditSnapshot(quotation);
        quotation.Status = MerchantQuotationStatus.Converted;
        quotation.ConvertedAt = now;
        quotation.ConvertedMerchantOrderId = order.Id;
        quotation.UpdatedAt = now;

        _dbContext.MerchantOrders.Add(order);

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-order.created", "MerchantOrder",
            order.Id, null, MerchantOrderAuditSnapshot(order));
        _auditLogService.Append(actorId, ActorType.Admin, "quotation.converted", "MerchantQuotation",
            quotation.Id, quotationBefore, QuotationAuditSnapshot(quotation));

        try
        {
            // Order, quotation status, link and audit all land together or not
            // at all, so a failure cannot leave a half-converted quotation.
            await SaveWithConcurrencyAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A parallel request may have won the unique index on
            // SourceQuotationId. If so, return its order rather than surfacing
            // a database error; otherwise the failure is real.
            var winner = await AlreadyConvertedAsync(quotation.Id, cancellationToken);
            if (winner is null)
            {
                throw Conflict("quotation_conversion_failed",
                    "This quotation could not be converted. Reload and try again.");
            }

            return new ConvertQuotationResult(ToResponse(winner), AlreadyConverted: true);
        }

        return new ConvertQuotationResult(
            ToResponse(await RequireMerchantOrderAsync(order.Id, cancellationToken)),
            AlreadyConverted: false);
    }

    // ================= Merchant orders =================

    public async Task<(IReadOnlyCollection<MerchantOrderResponse> Items, int Total)> ListMerchantOrdersAsync(
        int page, int pageSize, string? search, MerchantOrderPaymentStatus? paymentStatus,
        Guid? merchantId, Guid? salespersonId, DateTimeOffset? fromDate, DateTimeOffset? toDate,
        CancellationToken cancellationToken)
    {
        var query = MerchantOrderQuery().AsQueryable();

        if (paymentStatus.HasValue) query = query.Where(o => o.PaymentStatus == paymentStatus.Value);
        if (merchantId.HasValue) query = query.Where(o => o.MerchantId == merchantId.Value);
        if (salespersonId.HasValue) query = query.Where(o => o.SalespersonId == salespersonId.Value);
        if (fromDate.HasValue) query = query.Where(o => o.CreatedAt >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(o => o.CreatedAt <= toDate.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o =>
                o.MerchantOrderNumber.Contains(term) || o.MerchantLegalNameSnapshot.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items.Select(ToResponse).ToArray(), total);
    }

    public async Task<MerchantOrderResponse> GetMerchantOrderAsync(Guid id, CancellationToken cancellationToken) =>
        ToResponse(await RequireMerchantOrderAsync(id, cancellationToken));

    public async Task<MerchantOrderResponse> CancelMerchantOrderAsync(
        Guid? actorId, Guid id, string? concurrencyToken, CancellationToken cancellationToken)
    {
        var order = await RequireMerchantOrderAsync(id, cancellationToken, tracked: true);

        if (order.PaymentStatus == MerchantOrderPaymentStatus.Cancelled)
        {
            return ToResponse(order);
        }

        if (order.PaymentStatus != MerchantOrderPaymentStatus.AwaitingPayment)
        {
            throw Conflict("merchant_order_not_cancellable",
                "Only an order still awaiting payment can be cancelled here.");
        }

        ApplyConcurrency(order, concurrencyToken);
        var before = MerchantOrderAuditSnapshot(order);
        var now = _timeProvider.GetUtcNow();
        order.PaymentStatus = MerchantOrderPaymentStatus.Cancelled;
        order.CancelledAt = now;
        order.UpdatedAt = now;

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-order.cancelled", "MerchantOrder",
            order.Id, before, MerchantOrderAuditSnapshot(order));
        await SaveWithConcurrencyAsync(cancellationToken);

        return ToResponse(await RequireMerchantOrderAsync(id, cancellationToken));
    }

    // ================= Internals =================

    private static bool IsTransitionAllowed(MerchantQuotationStatus from, MerchantQuotationStatus to) =>
        (from, to) switch
        {
            (MerchantQuotationStatus.Draft, MerchantQuotationStatus.Sent) => true,
            (MerchantQuotationStatus.Draft, MerchantQuotationStatus.Cancelled) => true,
            (MerchantQuotationStatus.Sent, MerchantQuotationStatus.Cancelled) => true,
            (MerchantQuotationStatus.Sent, MerchantQuotationStatus.Accepted) => true,
            (MerchantQuotationStatus.Sent, MerchantQuotationStatus.Rejected) => true,
            (MerchantQuotationStatus.Sent, MerchantQuotationStatus.Expired) => true,
            _ => false,
        };

    private static string AuditActionFor(MerchantQuotationStatus status) => status switch
    {
        MerchantQuotationStatus.Sent => "quotation.sent",
        MerchantQuotationStatus.Accepted => "quotation.accepted",
        MerchantQuotationStatus.Rejected => "quotation.rejected",
        MerchantQuotationStatus.Expired => "quotation.expired",
        MerchantQuotationStatus.Cancelled => "quotation.cancelled",
        MerchantQuotationStatus.Converted => "quotation.converted",
        _ => "quotation.update",
    };

    private static string Describe(MerchantQuotationStatus status) => status switch
    {
        MerchantQuotationStatus.Draft => "draft",
        MerchantQuotationStatus.Sent => "sent",
        MerchantQuotationStatus.Accepted => "accepted",
        MerchantQuotationStatus.Rejected => "rejected",
        MerchantQuotationStatus.Expired => "expired",
        MerchantQuotationStatus.Converted => "already converted",
        MerchantQuotationStatus.Cancelled => "cancelled",
        _ => status.ToString().ToLowerInvariant(),
    };

    private async Task<MerchantOrder?> AlreadyConvertedAsync(Guid quotationId, CancellationToken cancellationToken)
    {
        // The failed attempt left tracked entities behind; read the winner on a
        // clean context state.
        _dbContext.ChangeTracker.Clear();
        return await MerchantOrderQuery()
            .FirstOrDefaultAsync(order => order.SourceQuotationId == quotationId, cancellationToken);
    }

    private async Task ApplyQuotationContentAsync(
        MerchantQuotation quotation, UpsertQuotationRequest request, CancellationToken cancellationToken)
    {
        if (request.Items is null || request.Items.Count == 0)
        {
            throw Validation("items", "Add at least one product line to the quotation.");
        }

        if (request.Items.Count > MerchantSalesConstants.MaxItemsPerQuotation)
        {
            throw Validation("items",
                $"A quotation can hold up to {MerchantSalesConstants.MaxItemsPerQuotation} lines.");
        }

        var variantIds = request.Items.Select(item => item.ProductVariantId).Distinct().ToArray();
        var variants = await _dbContext.TagProductVariants
            .AsNoTracking()
            .Include(variant => variant.TagProduct)
            .Where(variant => variantIds.Contains(variant.Id))
            .ToDictionaryAsync(variant => variant.Id, cancellationToken);

        // Replacing the lines. The deletes are flushed before the inserts so
        // the tracker never holds a removed row and its replacement at once,
        // which it reports as a phantom concurrency conflict.
        if (quotation.Items.Count > 0)
        {
            _dbContext.MerchantQuotationItems.RemoveRange(quotation.Items.ToList());
            quotation.Items.Clear();
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var sortOrder = 0;
        var rebuilt = new List<MerchantQuotationItem>();

        foreach (var line in request.Items)
        {
            if (!variants.TryGetValue(line.ProductVariantId, out var variant))
            {
                throw Validation($"items[{sortOrder}].productVariantId",
                    "That tag option no longer exists.");
            }

            if (line.Quantity < 1)
            {
                throw Validation($"items[{sortOrder}].quantity", "Quantity must be at least 1.");
            }

            if (line.WholesaleUnitPrice < 0)
            {
                throw Validation($"items[{sortOrder}].wholesaleUnitPrice",
                    "A wholesale price cannot be negative.");
            }

            if (line.LineDiscount < 0)
            {
                throw Validation($"items[{sortOrder}].lineDiscount",
                    "A line discount cannot be negative.");
            }

            var calculated = MerchantSalesTotals.CalculateLine(
                new MerchantSalesTotals.LineInput(line.Quantity, line.WholesaleUnitPrice, line.LineDiscount));

            if (calculated.LineSubtotal < 0)
            {
                throw Validation($"items[{sortOrder}].lineDiscount",
                    "A line discount cannot exceed the line amount.");
            }

            rebuilt.Add(new MerchantQuotationItem
            {
                QuotationId = quotation.Id,
                ProductId = variant.TagProductId,
                ProductVariantId = variant.Id,
                // Descriptive fields come from the catalog, never the request.
                ProductNameSnapshot = variant.TagProduct?.Name ?? "MyPetLink Tag",
                SkuCodeSnapshot = variant.Sku,
                OptionNameSnapshot = variant.DisplayName,
                SupportsQrSnapshot = variant.SupportsQr,
                SupportsNfcSnapshot = variant.SupportsNfc,
                UnitWeightGramsSnapshot = variant.WeightGrams,
                Quantity = line.Quantity,
                WholesaleUnitPrice = MerchantSalesTotals.Round(line.WholesaleUnitPrice),
                LineDiscount = MerchantSalesTotals.Round(line.LineDiscount),
                LineSubtotal = calculated.LineSubtotal,
                SortOrder = sortOrder,
            });

            sortOrder++;
        }

        if (request.DiscountTotal < 0)
        {
            throw Validation("discountTotal", "An order discount cannot be negative.");
        }

        if (request.DeliveryFee < 0)
        {
            throw Validation("deliveryFee", "A delivery fee cannot be negative.");
        }

        foreach (var item in rebuilt)
        {
            quotation.Items.Add(item);
        }

        // An existing quotation is Unchanged, and EF marks freshly discovered
        // children with a pre-set key as Modified rather than Added — which
        // then fails as an update to a row that was never inserted. Say what
        // these are explicitly.
        if (_dbContext.Entry(quotation).State != EntityState.Added)
        {
            foreach (var item in rebuilt)
            {
                _dbContext.Entry(item).State = EntityState.Added;
            }
        }

        var totals = MerchantSalesTotals.Calculate(
            quotation.Items.Select(item =>
                new MerchantSalesTotals.LineInput(item.Quantity, item.WholesaleUnitPrice, item.LineDiscount)),
            request.DiscountTotal,
            request.DeliveryFee);

        if (totals.DiscountTotal > totals.MerchandiseSubtotal)
        {
            throw Validation("discountTotal",
                "An order discount cannot exceed the merchandise subtotal.");
        }

        quotation.MerchandiseSubtotal = totals.MerchandiseSubtotal;
        quotation.DiscountTotal = totals.DiscountTotal;
        quotation.DeliveryFee = totals.DeliveryFee;
        quotation.GrandTotal = totals.GrandTotal;
        quotation.CustomerNotes = Trimmed(request.CustomerNotes);
        quotation.InternalNotes = Trimmed(request.InternalNotes);
    }

    private async Task RevalidateVariantsAsync(
        IEnumerable<MerchantQuotationItem> items, CancellationToken cancellationToken)
    {
        var ids = items.Select(item => item.ProductVariantId).Distinct().ToArray();
        var found = await _dbContext.TagProductVariants
            .AsNoTracking()
            .Where(variant => ids.Contains(variant.Id))
            .Select(variant => variant.Id)
            .ToListAsync(cancellationToken);

        if (found.Count != ids.Length)
        {
            throw Conflict("quotation_variant_missing",
                "A tag option on this quotation no longer exists. Re-quote before converting.");
        }
    }

    private IQueryable<MerchantQuotation> QuotationQuery() =>
        _dbContext.MerchantQuotations
            .AsNoTracking()
            .Include(q => q.Items)
            .Include(q => q.ConvertedMerchantOrder);

    private IQueryable<MerchantOrder> MerchantOrderQuery() =>
        _dbContext.MerchantOrders
            .AsNoTracking()
            .Include(o => o.Items)
            .Include(o => o.SourceQuotation);

    private async Task<Merchant> RequireMerchantAsync(
        Guid id, CancellationToken cancellationToken, bool tracked = false)
    {
        var query = _dbContext.Merchants.Include(m => m.AssignedSalesperson).AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        return await query.SingleOrDefaultAsync(m => m.Id == id, cancellationToken)
            ?? throw NotFound("merchant_not_found", "That merchant could not be found.");
    }

    private async Task<Salesperson> RequireSalespersonAsync(
        Guid id, CancellationToken cancellationToken, bool tracked = false)
    {
        var query = _dbContext.Salespersons.AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        return await query.SingleOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw NotFound("salesperson_not_found", "That salesperson could not be found.");
    }

    private async Task<MerchantQuotation> RequireQuotationAsync(
        Guid id, CancellationToken cancellationToken, bool tracked = false)
    {
        var query = _dbContext.MerchantQuotations
            .Include(q => q.Items)
            .Include(q => q.ConvertedMerchantOrder)
            .AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        return await query.SingleOrDefaultAsync(q => q.Id == id, cancellationToken)
            ?? throw NotFound("quotation_not_found", "That quotation could not be found.");
    }

    private async Task<MerchantOrder> RequireMerchantOrderAsync(
        Guid id, CancellationToken cancellationToken, bool tracked = false)
    {
        var query = _dbContext.MerchantOrders
            .Include(o => o.Items)
            .Include(o => o.SourceQuotation)
            .AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        return await query.SingleOrDefaultAsync(o => o.Id == id, cancellationToken)
            ?? throw NotFound("merchant_order_not_found", "That merchant order could not be found.");
    }

    /// <summary>
    /// Resolves an assignable salesperson. An inactive one may stay on records
    /// that already reference it, but cannot be attached to anything new.
    /// </summary>
    private async Task<Salesperson?> ResolveAssignableSalespersonAsync(
        Guid? salespersonId, CancellationToken cancellationToken, Guid? currentId = null)
    {
        if (!salespersonId.HasValue) return null;

        var salesperson = await RequireSalespersonAsync(salespersonId.Value, cancellationToken);

        if (!salesperson.IsActive && salespersonId != currentId)
        {
            throw Validation("salespersonId",
                "That salesperson is inactive and cannot be assigned to new sales.");
        }

        return salesperson;
    }

    private async Task GuardDuplicateRegistrationAsync(
        string? registrationNumber, Guid? excludeId, CancellationToken cancellationToken)
    {
        var normalized = NormalizeRegistration(registrationNumber);
        if (normalized is null) return;

        var duplicate = await _dbContext.Merchants
            .AsNoTracking()
            .AnyAsync(m =>
                m.NormalizedBusinessRegistrationNumber == normalized &&
                (!excludeId.HasValue || m.Id != excludeId.Value),
                cancellationToken);

        if (duplicate)
        {
            throw Conflict("merchant_registration_duplicate",
                "Another merchant already uses this business registration number.");
        }
    }

    /// <summary>
    /// Upper-cased with separators removed, so "AS 0515813-P" and "as0515813p"
    /// are recognised as the same registration whatever the column collation.
    /// </summary>
    private static string? NormalizeRegistration(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;

        var cleaned = new string(trimmed.Where(char.IsLetterOrDigit).ToArray());
        return cleaned.Length == 0 ? null : cleaned.ToUpperInvariant();
    }

    private void ValidateMerchant(UpsertMerchantRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.LegalBusinessName))
            throw Validation("legalBusinessName", "Enter the registered business name.");
        if (string.IsNullOrWhiteSpace(request.ContactPerson))
            throw Validation("contactPerson", "Enter a contact person.");
        if (!EmailPattern.IsMatch(request.ContactEmail?.Trim() ?? ""))
            throw Validation("contactEmail", "Enter a valid contact email address.");
        if (!PhonePattern.IsMatch(request.ContactPhone?.Trim() ?? ""))
            throw Validation("contactPhone", "Enter a valid contact phone number.");

        ValidateAddress(request.BillingAddress, "billingAddress");

        if (!request.DeliveryAddressSameAsBilling)
        {
            if (request.DeliveryAddress is null)
                throw Validation("deliveryAddress", "Enter a delivery address or reuse the billing address.");
            ValidateAddress(request.DeliveryAddress, "deliveryAddress");
        }
    }

    private static void ValidateAddress(MerchantAddressDto address, string field)
    {
        if (string.IsNullOrWhiteSpace(address.AddressLine1))
            throw Validation($"{field}.addressLine1", "Enter the street address.");
        if (string.IsNullOrWhiteSpace(address.Postcode))
            throw Validation($"{field}.postcode", "Enter the postcode.");
        if (string.IsNullOrWhiteSpace(address.City))
            throw Validation($"{field}.city", "Enter the city.");
        if (string.IsNullOrWhiteSpace(address.State))
            throw Validation($"{field}.state", "Enter the state.");
        if (string.IsNullOrWhiteSpace(address.Country))
            throw Validation($"{field}.country", "Enter the country.");
    }

    private static void ValidateSalesperson(UpsertSalespersonRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw Validation("name", "Enter the salesperson's name.");

        if (request.DefaultCommissionPercentage < Salesperson.MinCommissionPercentage ||
            request.DefaultCommissionPercentage > Salesperson.MaxCommissionPercentage)
        {
            throw Validation("defaultCommissionPercentage",
                "Commission must be between 0 and 100 percent.");
        }

        if (!string.IsNullOrWhiteSpace(request.Email) && !EmailPattern.IsMatch(request.Email.Trim()))
            throw Validation("email", "Enter a valid email address.");
        if (!string.IsNullOrWhiteSpace(request.Phone) && !PhonePattern.IsMatch(request.Phone.Trim()))
            throw Validation("phone", "Enter a valid phone number.");
    }

    private static void ApplyMerchant(Merchant merchant, UpsertMerchantRequest request, Salesperson? salesperson)
    {
        merchant.LegalBusinessName = request.LegalBusinessName.Trim();
        merchant.TradingName = Trimmed(request.TradingName);
        merchant.BusinessRegistrationNumber = Trimmed(request.BusinessRegistrationNumber);
        merchant.NormalizedBusinessRegistrationNumber = NormalizeRegistration(request.BusinessRegistrationNumber);
        merchant.TaxIdentificationNumber = Trimmed(request.TaxIdentificationNumber);
        merchant.SstRegistrationNumber = Trimmed(request.SstRegistrationNumber);
        merchant.ContactPerson = request.ContactPerson.Trim();
        merchant.ContactEmail = request.ContactEmail.Trim();
        merchant.ContactPhone = request.ContactPhone.Trim();

        merchant.BillingAddressLine1 = request.BillingAddress.AddressLine1.Trim();
        merchant.BillingAddressLine2 = Trimmed(request.BillingAddress.AddressLine2);
        merchant.BillingPostcode = request.BillingAddress.Postcode.Trim();
        merchant.BillingCity = request.BillingAddress.City.Trim();
        merchant.BillingState = request.BillingAddress.State.Trim();
        merchant.BillingCountry = request.BillingAddress.Country.Trim();

        // Storing the resolved delivery address, even when it mirrors billing,
        // means a later snapshot never has to re-derive it.
        var delivery = request.DeliveryAddressSameAsBilling
            ? request.BillingAddress
            : request.DeliveryAddress!;

        merchant.DeliveryAddressSameAsBilling = request.DeliveryAddressSameAsBilling;
        merchant.DeliveryAddressLine1 = delivery.AddressLine1.Trim();
        merchant.DeliveryAddressLine2 = Trimmed(delivery.AddressLine2);
        merchant.DeliveryPostcode = delivery.Postcode.Trim();
        merchant.DeliveryCity = delivery.City.Trim();
        merchant.DeliveryState = delivery.State.Trim();
        merchant.DeliveryCountry = delivery.Country.Trim();

        merchant.AssignedSalespersonId = salesperson?.Id;
        merchant.InternalNotes = Trimmed(request.InternalNotes);
        merchant.PaymentTerm = MerchantPaymentTerm.Prepaid;
    }

    private static void CaptureMerchantSnapshot(MerchantQuotation quotation, Merchant merchant)
    {
        quotation.MerchantCodeSnapshot = merchant.MerchantCode;
        quotation.MerchantLegalNameSnapshot = merchant.LegalBusinessName;
        quotation.MerchantTradingNameSnapshot = merchant.TradingName;
        quotation.MerchantRegistrationNumberSnapshot = merchant.BusinessRegistrationNumber;
        quotation.MerchantTaxIdentificationNumberSnapshot = merchant.TaxIdentificationNumber;
        quotation.MerchantSstRegistrationNumberSnapshot = merchant.SstRegistrationNumber;
        quotation.ContactPersonSnapshot = merchant.ContactPerson;
        quotation.ContactEmailSnapshot = merchant.ContactEmail;
        quotation.ContactPhoneSnapshot = merchant.ContactPhone;
        quotation.BillingAddressLine1Snapshot = merchant.BillingAddressLine1;
        quotation.BillingAddressLine2Snapshot = merchant.BillingAddressLine2;
        quotation.BillingPostcodeSnapshot = merchant.BillingPostcode;
        quotation.BillingCitySnapshot = merchant.BillingCity;
        quotation.BillingStateSnapshot = merchant.BillingState;
        quotation.BillingCountrySnapshot = merchant.BillingCountry;
        quotation.DeliveryAddressLine1Snapshot = merchant.DeliveryAddressLine1;
        quotation.DeliveryAddressLine2Snapshot = merchant.DeliveryAddressLine2;
        quotation.DeliveryPostcodeSnapshot = merchant.DeliveryPostcode;
        quotation.DeliveryCitySnapshot = merchant.DeliveryCity;
        quotation.DeliveryStateSnapshot = merchant.DeliveryState;
        quotation.DeliveryCountrySnapshot = merchant.DeliveryCountry;
    }

    private static void CaptureSalespersonSnapshot(MerchantQuotation quotation, Salesperson? salesperson)
    {
        quotation.SalespersonId = salesperson?.Id;
        quotation.SalespersonCodeSnapshot = salesperson?.SalespersonCode;
        quotation.SalespersonNameSnapshot = salesperson?.Name;
        quotation.SalespersonCommissionPercentageSnapshot = salesperson?.DefaultCommissionPercentage;
    }

    private static void CopySnapshots(MerchantQuotation quotation, MerchantOrder order)
    {
        order.MerchantCodeSnapshot = quotation.MerchantCodeSnapshot;
        order.MerchantLegalNameSnapshot = quotation.MerchantLegalNameSnapshot;
        order.MerchantTradingNameSnapshot = quotation.MerchantTradingNameSnapshot;
        order.MerchantRegistrationNumberSnapshot = quotation.MerchantRegistrationNumberSnapshot;
        order.MerchantTaxIdentificationNumberSnapshot = quotation.MerchantTaxIdentificationNumberSnapshot;
        order.MerchantSstRegistrationNumberSnapshot = quotation.MerchantSstRegistrationNumberSnapshot;
        order.ContactPersonSnapshot = quotation.ContactPersonSnapshot;
        order.ContactEmailSnapshot = quotation.ContactEmailSnapshot;
        order.ContactPhoneSnapshot = quotation.ContactPhoneSnapshot;
        order.BillingAddressLine1Snapshot = quotation.BillingAddressLine1Snapshot;
        order.BillingAddressLine2Snapshot = quotation.BillingAddressLine2Snapshot;
        order.BillingPostcodeSnapshot = quotation.BillingPostcodeSnapshot;
        order.BillingCitySnapshot = quotation.BillingCitySnapshot;
        order.BillingStateSnapshot = quotation.BillingStateSnapshot;
        order.BillingCountrySnapshot = quotation.BillingCountrySnapshot;
        order.DeliveryAddressLine1Snapshot = quotation.DeliveryAddressLine1Snapshot;
        order.DeliveryAddressLine2Snapshot = quotation.DeliveryAddressLine2Snapshot;
        order.DeliveryPostcodeSnapshot = quotation.DeliveryPostcodeSnapshot;
        order.DeliveryCitySnapshot = quotation.DeliveryCitySnapshot;
        order.DeliveryStateSnapshot = quotation.DeliveryStateSnapshot;
        order.DeliveryCountrySnapshot = quotation.DeliveryCountrySnapshot;
        order.SalespersonCodeSnapshot = quotation.SalespersonCodeSnapshot;
        order.SalespersonNameSnapshot = quotation.SalespersonNameSnapshot;
        order.SalespersonCommissionPercentageSnapshot = quotation.SalespersonCommissionPercentageSnapshot;
    }

    private void ApplyConcurrency(Merchant merchant, string? token) =>
        ApplyConcurrencyToken(merchant, merchant.RowVersion, token);

    private void ApplyConcurrency(Salesperson salesperson, string? token) =>
        ApplyConcurrencyToken(salesperson, salesperson.RowVersion, token);

    private void ApplyConcurrency(MerchantQuotation quotation, string? token) =>
        ApplyConcurrencyToken(quotation, quotation.RowVersion, token);

    private void ApplyConcurrency(MerchantOrder order, string? token) =>
        ApplyConcurrencyToken(order, order.RowVersion, token);

    private void ApplyConcurrencyToken(object entity, byte[] current, string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            // No token supplied: last write wins, matching the existing admin
            // settings services. Callers that care pass one.
            return;
        }

        byte[] expected;
        try
        {
            expected = Convert.FromBase64String(token);
        }
        catch (FormatException)
        {
            throw Validation("concurrencyToken", "That edit token is not valid. Reload and try again.");
        }

        if (!current.SequenceEqual(expected))
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed this record. Reload and try again.");
        }

        _dbContext.Entry(entity).Property("RowVersion").OriginalValue = expected;
    }

    private async Task SaveWithConcurrencyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ApiException(409, "concurrency_conflict",
                "Someone else changed this record. Reload and try again.");
        }
    }

    private static string? Trimmed(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static MerchantAddressDto BillingOf(Merchant merchant) => new(
        merchant.BillingAddressLine1, merchant.BillingAddressLine2, merchant.BillingPostcode,
        merchant.BillingCity, merchant.BillingState, merchant.BillingCountry);

    private static MerchantAddressDto DeliveryOf(Merchant merchant) => new(
        merchant.DeliveryAddressLine1, merchant.DeliveryAddressLine2, merchant.DeliveryPostcode,
        merchant.DeliveryCity, merchant.DeliveryState, merchant.DeliveryCountry);

    private static MerchantResponse ToResponse(Merchant merchant) => new(
        merchant.Id, merchant.MerchantCode, merchant.LegalBusinessName, merchant.TradingName,
        merchant.BusinessRegistrationNumber, merchant.TaxIdentificationNumber,
        merchant.SstRegistrationNumber, merchant.ContactPerson, merchant.ContactEmail,
        merchant.ContactPhone, BillingOf(merchant), merchant.DeliveryAddressSameAsBilling,
        DeliveryOf(merchant), merchant.AssignedSalespersonId, merchant.AssignedSalesperson?.Name,
        merchant.PaymentTerm, merchant.InternalNotes, merchant.IsActive, merchant.CreatedAt,
        merchant.UpdatedAt, Convert.ToBase64String(merchant.RowVersion));

    private static SalespersonResponse ToResponse(Salesperson salesperson) => new(
        salesperson.Id, salesperson.SalespersonCode, salesperson.Name, salesperson.Email,
        salesperson.Phone, salesperson.DefaultCommissionPercentage, salesperson.InternalNotes,
        salesperson.IsActive, salesperson.CreatedAt, salesperson.UpdatedAt,
        Convert.ToBase64String(salesperson.RowVersion));

    private static QuotationResponse ToResponse(MerchantQuotation quotation) => new(
        quotation.Id, quotation.QuotationNumber, quotation.MerchantId, quotation.MerchantCodeSnapshot,
        quotation.MerchantLegalNameSnapshot, quotation.MerchantTradingNameSnapshot,
        quotation.ContactPersonSnapshot, quotation.ContactEmailSnapshot, quotation.ContactPhoneSnapshot,
        new MerchantSalesAddressSnapshot(
            quotation.BillingAddressLine1Snapshot, quotation.BillingAddressLine2Snapshot,
            quotation.BillingPostcodeSnapshot, quotation.BillingCitySnapshot,
            quotation.BillingStateSnapshot, quotation.BillingCountrySnapshot),
        new MerchantSalesAddressSnapshot(
            quotation.DeliveryAddressLine1Snapshot, quotation.DeliveryAddressLine2Snapshot,
            quotation.DeliveryPostcodeSnapshot, quotation.DeliveryCitySnapshot,
            quotation.DeliveryStateSnapshot, quotation.DeliveryCountrySnapshot),
        quotation.SalespersonId, quotation.SalespersonCodeSnapshot, quotation.SalespersonNameSnapshot,
        quotation.QuotationDate, quotation.ValidUntil, quotation.Currency, quotation.PaymentTermSnapshot,
        quotation.MerchandiseSubtotal, quotation.DiscountTotal, quotation.DeliveryFee,
        quotation.GrandTotal, quotation.CustomerNotes, quotation.InternalNotes, quotation.Status,
        quotation.ConvertedMerchantOrderId, quotation.ConvertedMerchantOrder?.MerchantOrderNumber,
        quotation.CreatedAt, quotation.UpdatedAt, quotation.SentAt, quotation.AcceptedAt,
        quotation.RejectedAt, quotation.ExpiredAt, quotation.ConvertedAt, quotation.CancelledAt,
        quotation.Items.OrderBy(item => item.SortOrder).Select(item => new QuotationItemResponse(
            item.Id, item.ProductId, item.ProductVariantId, item.ProductNameSnapshot,
            item.SkuCodeSnapshot, item.OptionNameSnapshot, item.SupportsQrSnapshot,
            item.SupportsNfcSnapshot, item.UnitWeightGramsSnapshot, item.Quantity,
            item.WholesaleUnitPrice, item.LineDiscount, item.LineSubtotal, item.SortOrder)).ToArray(),
        Convert.ToBase64String(quotation.RowVersion));

    private static MerchantOrderResponse ToResponse(MerchantOrder order) => new(
        order.Id, order.MerchantOrderNumber, order.SourceQuotationId,
        order.SourceQuotation?.QuotationNumber, order.MerchantId, order.MerchantCodeSnapshot,
        order.MerchantLegalNameSnapshot, order.MerchantTradingNameSnapshot, order.ContactPersonSnapshot,
        order.ContactEmailSnapshot, order.ContactPhoneSnapshot,
        new MerchantSalesAddressSnapshot(
            order.BillingAddressLine1Snapshot, order.BillingAddressLine2Snapshot,
            order.BillingPostcodeSnapshot, order.BillingCitySnapshot,
            order.BillingStateSnapshot, order.BillingCountrySnapshot),
        new MerchantSalesAddressSnapshot(
            order.DeliveryAddressLine1Snapshot, order.DeliveryAddressLine2Snapshot,
            order.DeliveryPostcodeSnapshot, order.DeliveryCitySnapshot,
            order.DeliveryStateSnapshot, order.DeliveryCountrySnapshot),
        order.SalespersonId, order.SalespersonCodeSnapshot, order.SalespersonNameSnapshot,
        order.PaymentTermSnapshot, order.Currency, order.MerchandiseSubtotal, order.DiscountTotal,
        order.DeliveryFee, order.GrandTotal, order.PaymentStatus, order.FulfilmentStatus,
        order.InternalNotes, order.CreatedAt, order.UpdatedAt, order.PaymentConfirmedAt,
        order.CancelledAt,
        order.Items.OrderBy(item => item.SortOrder).Select(item => new MerchantOrderItemResponse(
            item.Id, item.ProductId, item.ProductVariantId, item.ProductNameSnapshot,
            item.SkuCodeSnapshot, item.OptionNameSnapshot, item.SupportsQrSnapshot,
            item.SupportsNfcSnapshot, item.UnitWeightGramsSnapshot, item.Quantity,
            item.WholesaleUnitPrice, item.LineDiscount, item.LineSubtotal, item.SortOrder)).ToArray(),
        Convert.ToBase64String(order.RowVersion));

    // Audit payloads carry identifiers and money, never notes or addresses.
    private static object MerchantAuditSnapshot(Merchant merchant) => new
    {
        merchant.MerchantCode,
        merchant.LegalBusinessName,
        merchant.AssignedSalespersonId,
        merchant.PaymentTerm,
        merchant.IsActive,
    };

    private static object SalespersonAuditSnapshot(Salesperson salesperson) => new
    {
        salesperson.SalespersonCode,
        salesperson.Name,
        salesperson.DefaultCommissionPercentage,
        salesperson.IsActive,
    };

    private static object QuotationAuditSnapshot(MerchantQuotation quotation) => new
    {
        quotation.QuotationNumber,
        quotation.MerchantId,
        quotation.SalespersonId,
        quotation.Status,
        quotation.MerchandiseSubtotal,
        quotation.DiscountTotal,
        quotation.DeliveryFee,
        quotation.GrandTotal,
        ItemCount = quotation.Items.Count,
        quotation.ConvertedMerchantOrderId,
    };

    private static object MerchantOrderAuditSnapshot(MerchantOrder order) => new
    {
        order.MerchantOrderNumber,
        order.MerchantId,
        order.SourceQuotationId,
        order.PaymentStatus,
        order.FulfilmentStatus,
        order.GrandTotal,
        ItemCount = order.Items.Count,
    };

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });

    private static ApiException Conflict(string code, string message) =>
        new(409, code, message);

    private static ApiException NotFound(string code, string message) =>
        new(404, code, message);
}
