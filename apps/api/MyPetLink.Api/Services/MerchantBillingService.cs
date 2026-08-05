using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Billing for merchant orders: issue the invoice, record the money, issue the
/// receipt, and record what the salesperson earned.
///
/// Everything a merchant will ever see is snapshotted at issue time. The
/// invoice copies the order's totals rather than recalculating them, because a
/// catalog price change must not silently alter a bill somebody already has.
/// </summary>
public interface IMerchantBillingService
{
    Task<(IReadOnlyCollection<MerchantInvoiceResponse> Items, int Total)> ListInvoicesAsync(
        int page, int pageSize, string? search, MerchantInvoiceStatus? status,
        Guid? merchantId, DateTimeOffset? fromDate, DateTimeOffset? toDate,
        CancellationToken cancellationToken);

    Task<MerchantInvoiceResponse> GetInvoiceAsync(Guid id, CancellationToken cancellationToken);

    Task<MerchantInvoiceResponse> IssueInvoiceAsync(
        Guid? actorId, Guid merchantOrderId, IssueMerchantInvoiceRequest request,
        CancellationToken cancellationToken);

    Task<MerchantInvoiceResponse> CancelInvoiceAsync(
        Guid? actorId, Guid invoiceId, string? concurrencyToken, CancellationToken cancellationToken);

    Task<RecordMerchantPaymentResult> RecordPaymentAsync(
        Guid? actorId, Guid invoiceId, RecordMerchantPaymentRequest request,
        CancellationToken cancellationToken);

    Task<(IReadOnlyCollection<SalesCommissionResponse> Items, int Total)> ListCommissionsAsync(
        int page, int pageSize, Guid? salespersonId, SalesCommissionStatus? status,
        CancellationToken cancellationToken);

    Task<SalesCommissionResponse> MarkCommissionPaidAsync(
        Guid? actorId, Guid commissionId, string? concurrencyToken, CancellationToken cancellationToken);
}

public sealed class MerchantBillingService : IMerchantBillingService
{
    /// <summary>
    /// A payment dated further ahead than this is a typo, not a plan. One day
    /// of slack covers an administrator in a different timezone.
    /// </summary>
    private static readonly TimeSpan MaxFuturePaymentDate = TimeSpan.FromDays(1);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IDocumentNumberService _numbers;
    private readonly IBusinessIdentityService _businessIdentity;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public MerchantBillingService(
        MyPetLinkDbContext dbContext,
        IDocumentNumberService numbers,
        IBusinessIdentityService businessIdentity,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _numbers = numbers;
        _businessIdentity = businessIdentity;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    // --- Reading -----------------------------------------------------------

    public async Task<(IReadOnlyCollection<MerchantInvoiceResponse> Items, int Total)> ListInvoicesAsync(
        int page, int pageSize, string? search, MerchantInvoiceStatus? status,
        Guid? merchantId, DateTimeOffset? fromDate, DateTimeOffset? toDate,
        CancellationToken cancellationToken)
    {
        var query = InvoiceQuery().AsNoTracking();

        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        if (merchantId.HasValue) query = query.Where(item => item.MerchantId == merchantId.Value);
        if (fromDate.HasValue) query = query.Where(item => item.InvoiceDate >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(item => item.InvoiceDate <= toDate.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(item =>
                item.InvoiceNumber.Contains(term)
                || item.MerchantOrderNumberSnapshot.Contains(term)
                || (item.SourceQuotationNumberSnapshot != null
                    && item.SourceQuotationNumberSnapshot.Contains(term))
                || item.MerchantLegalNameSnapshot.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(item => item.InvoiceDate)
            .ThenByDescending(item => item.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var responses = new List<MerchantInvoiceResponse>(items.Count);
        foreach (var invoice in items)
        {
            responses.Add(await ToResponseAsync(invoice, cancellationToken));
        }

        return (responses, total);
    }

    public async Task<MerchantInvoiceResponse> GetInvoiceAsync(
        Guid id, CancellationToken cancellationToken) =>
        await ToResponseAsync(
            await RequireInvoiceAsync(id, tracked: false, cancellationToken), cancellationToken);

    // --- Issuing -----------------------------------------------------------

    public async Task<MerchantInvoiceResponse> IssueInvoiceAsync(
        Guid? actorId, Guid merchantOrderId, IssueMerchantInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        // Issuing twice is a double-click, not an error. Return what already
        // exists rather than putting a second bill in front of the merchant.
        var existing = await FindLiveInvoiceAsync(merchantOrderId, cancellationToken);
        if (existing is not null)
        {
            return await ToResponseAsync(existing, cancellationToken);
        }

        var order = await _dbContext.MerchantOrders
            .Include(item => item.Items)
            .Include(item => item.SourceQuotation)
            .SingleOrDefaultAsync(item => item.Id == merchantOrderId, cancellationToken)
            ?? throw new ApiException(404, "merchant_order_not_found", "That order no longer exists.");

        if (order.PaymentStatus == MerchantOrderPaymentStatus.Cancelled)
        {
            throw Conflict("merchant_order_cancelled",
                "This order was cancelled and cannot be invoiced.");
        }

        if (order.PaymentStatus != MerchantOrderPaymentStatus.AwaitingPayment)
        {
            throw Conflict("merchant_order_not_invoiceable",
                "This order has already been paid, so a new invoice cannot be issued.");
        }

        if (order.Items.Count == 0)
        {
            throw Conflict("merchant_order_empty", "This order has no items to invoice.");
        }

        if (order.GrandTotal <= 0m)
        {
            throw Conflict("merchant_order_total_invalid",
                "This order has no amount to invoice.");
        }

        // Fails closed: an invoice without a registered address is not a
        // document anyone should be sending to a business.
        var identity = await _businessIdentity.RequireForDocumentAsync(
            BusinessDocumentKind.MerchantInvoice, cancellationToken);

        var now = _timeProvider.GetUtcNow();
        var invoice = new MerchantInvoice
        {
            InvoiceNumber = await _numbers.NextMerchantInvoiceNumberAsync(now, cancellationToken),
            MerchantOrderId = order.Id,
            MerchantId = order.MerchantId,
            Seller = SellerIdentitySnapshot.From(identity),
            MerchantOrderNumberSnapshot = order.MerchantOrderNumber,
            SourceQuotationNumberSnapshot = order.SourceQuotation?.QuotationNumber,
            InvoiceDate = now,
            // Prepaid and due on receipt, so the due date is the invoice date.
            DueDate = now,
            PaymentTermSnapshot = order.PaymentTermSnapshot,
            Currency = order.Currency,
            MerchandiseSubtotal = order.MerchandiseSubtotal,
            DiscountTotal = order.DiscountTotal,
            DeliveryFee = order.DeliveryFee,
            GrandTotal = order.GrandTotal,
            Status = MerchantInvoiceStatus.Issued,
            IssuedAt = now,
            InternalNotes = Trimmed(request.InternalNotes),
            CreatedAt = now,
            UpdatedAt = now,
        };

        CopyMerchantSnapshot(order, invoice);

        foreach (var line in order.Items.OrderBy(item => item.SortOrder))
        {
            invoice.Items.Add(new MerchantInvoiceItem
            {
                ProductId = line.ProductId,
                ProductVariantId = line.ProductVariantId,
                ProductNameSnapshot = line.ProductNameSnapshot,
                SkuCodeSnapshot = line.SkuCodeSnapshot,
                OptionNameSnapshot = line.OptionNameSnapshot,
                SupportsQrSnapshot = line.SupportsQrSnapshot,
                SupportsNfcSnapshot = line.SupportsNfcSnapshot,
                Quantity = line.Quantity,
                WholesaleUnitPrice = line.WholesaleUnitPrice,
                LineDiscount = line.LineDiscount,
                LineSubtotal = line.LineSubtotal,
                SortOrder = line.SortOrder,
            });
        }

        _dbContext.MerchantInvoices.Add(invoice);
        _auditLogService.Append(actorId, ActorType.Admin, "merchant-invoice.issued",
            "MerchantInvoice", invoice.Id, null, InvoiceAuditSnapshot(invoice));

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A parallel request may have won the unique index. If so its
            // invoice is the answer; otherwise the failure is real.
            _dbContext.ChangeTracker.Clear();
            var winner = await FindLiveInvoiceAsync(merchantOrderId, cancellationToken);
            if (winner is null) throw;
            return await ToResponseAsync(winner, cancellationToken);
        }

        return await ToResponseAsync(
            await RequireInvoiceAsync(invoice.Id, tracked: false, cancellationToken),
            cancellationToken);
    }

    public async Task<MerchantInvoiceResponse> CancelInvoiceAsync(
        Guid? actorId, Guid invoiceId, string? concurrencyToken, CancellationToken cancellationToken)
    {
        var invoice = await RequireInvoiceAsync(invoiceId, tracked: true, cancellationToken);

        if (invoice.Status == MerchantInvoiceStatus.Paid)
        {
            throw Conflict("merchant_invoice_paid",
                "This invoice has been paid and cannot be cancelled.");
        }

        if (invoice.Status == MerchantInvoiceStatus.Cancelled)
        {
            return await ToResponseAsync(invoice, cancellationToken);
        }

        ApplyConcurrency(invoice.RowVersion, concurrencyToken);

        var before = InvoiceAuditSnapshot(invoice);
        var now = _timeProvider.GetUtcNow();
        invoice.Status = MerchantInvoiceStatus.Cancelled;
        invoice.CancelledAt = now;
        invoice.UpdatedAt = now;

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-invoice.cancelled",
            "MerchantInvoice", invoice.Id, before, InvoiceAuditSnapshot(invoice));

        await SaveAsync(cancellationToken);
        return await ToResponseAsync(invoice, cancellationToken);
    }

    // --- Payment -----------------------------------------------------------

    public async Task<RecordMerchantPaymentResult> RecordPaymentAsync(
        Guid? actorId, Guid invoiceId, RecordMerchantPaymentRequest request,
        CancellationToken cancellationToken)
    {
        var method = MerchantBillingParsing.ParsePaymentMethod(request.Method);
        var invoice = await RequireInvoiceAsync(invoiceId, tracked: true, cancellationToken);

        // A repeated submission must not take the money twice. The invoice is
        // already paid, so return what that payment produced.
        if (invoice.Status == MerchantInvoiceStatus.Paid)
        {
            return await AlreadyRecordedAsync(invoice, cancellationToken);
        }

        if (invoice.Status == MerchantInvoiceStatus.Cancelled)
        {
            throw Conflict("merchant_invoice_cancelled",
                "This invoice was cancelled, so a payment cannot be recorded against it.");
        }

        if (invoice.Status != MerchantInvoiceStatus.Issued)
        {
            throw Conflict("merchant_invoice_not_payable",
                "This invoice has not been issued yet.");
        }

        ApplyConcurrency(invoice.RowVersion, request.ConcurrencyToken);
        ValidatePayment(request, invoice);

        var order = await _dbContext.MerchantOrders
            .SingleOrDefaultAsync(item => item.Id == invoice.MerchantOrderId, cancellationToken)
            ?? throw new ApiException(404, "merchant_order_not_found", "That order no longer exists.");

        if (request.PaymentProofMediaFileId.HasValue)
        {
            var proofExists = await _dbContext.MediaFiles.AnyAsync(
                item => item.Id == request.PaymentProofMediaFileId.Value, cancellationToken);
            if (!proofExists)
            {
                throw Validation("paymentProofMediaFileId",
                    "That payment proof could not be found. Upload it again.");
            }
        }

        var admin = await FindAdminAsync(actorId, cancellationToken);
        var now = _timeProvider.GetUtcNow();

        var payment = new MerchantPayment
        {
            MerchantInvoiceId = invoice.Id,
            MerchantOrderId = invoice.MerchantOrderId,
            PaymentDate = request.PaymentDate,
            AmountReceived = MerchantSalesTotals.Round(request.AmountReceived),
            Currency = invoice.Currency,
            Method = method,
            TransactionReference = Trimmed(request.TransactionReference),
            InternalNote = Trimmed(request.InternalNote),
            PaymentProofMediaFileId = request.PaymentProofMediaFileId,
            RecordedByAdminUserId = admin?.Id,
            RecordedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var receipt = BuildReceipt(invoice, payment, order,
            await _numbers.NextMerchantReceiptNumberAsync(now, cancellationToken), now);

        var commission = BuildCommission(invoice, order, payment, now);

        var invoiceBefore = InvoiceAuditSnapshot(invoice);
        invoice.Status = MerchantInvoiceStatus.Paid;
        invoice.PaidAt = now;
        invoice.UpdatedAt = now;

        var orderBefore = new { order.PaymentStatus, order.PaymentConfirmedAt };
        order.PaymentStatus = MerchantOrderPaymentStatus.PaymentConfirmed;
        order.PaymentConfirmedAt = now;
        order.UpdatedAt = now;

        _dbContext.MerchantPayments.Add(payment);
        _dbContext.MerchantReceipts.Add(receipt);
        if (commission is not null) _dbContext.SalesCommissions.Add(commission);

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-payment.recorded",
            "MerchantPayment", payment.Id, null, PaymentAuditSnapshot(payment));
        _auditLogService.Append(actorId, ActorType.Admin, "merchant-invoice.paid",
            "MerchantInvoice", invoice.Id, invoiceBefore, InvoiceAuditSnapshot(invoice));
        _auditLogService.Append(actorId, ActorType.Admin, "merchant-receipt.issued",
            "MerchantReceipt", receipt.Id, null,
            new { receipt.ReceiptNumber, receipt.AmountPaid, receipt.Currency });
        _auditLogService.Append(actorId, ActorType.Admin, "merchant-order.payment-confirmed",
            "MerchantOrder", order.Id, orderBefore,
            new { order.PaymentStatus, order.PaymentConfirmedAt });
        if (commission is not null)
        {
            _auditLogService.Append(actorId, ActorType.Admin, "merchant-commission.created",
                "SalesCommission", commission.Id, null, CommissionAuditSnapshot(commission));
        }

        try
        {
            // Payment, receipt, commission and both status changes land
            // together: a merchant must never hold a receipt for an invoice
            // the system still thinks is unpaid.
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw Conflict("concurrency_conflict",
                "This invoice changed while you were recording the payment. Reload and try again.");
        }
        catch (DbUpdateException)
        {
            // The unique index on the payment's invoice is what makes a
            // duplicate impossible rather than unlikely.
            _dbContext.ChangeTracker.Clear();
            var settled = await RequireInvoiceAsync(invoiceId, tracked: false, cancellationToken);
            if (settled.Status != MerchantInvoiceStatus.Paid) throw;
            return await AlreadyRecordedAsync(settled, cancellationToken);
        }

        var stored = await RequireInvoiceAsync(invoice.Id, tracked: false, cancellationToken);
        return new RecordMerchantPaymentResult(
            await ToResponseAsync(stored, cancellationToken),
            ToResponse(payment, admin?.User?.DisplayName),
            ToSummary(receipt),
            commission is null ? null : ToResponse(commission, order.MerchantOrderNumber),
            AlreadyRecorded: false);
    }

    // --- Commission --------------------------------------------------------

    public async Task<(IReadOnlyCollection<SalesCommissionResponse> Items, int Total)> ListCommissionsAsync(
        int page, int pageSize, Guid? salespersonId, SalesCommissionStatus? status,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.SalesCommissions
            .AsNoTracking()
            .Include(item => item.MerchantOrder)
            .AsQueryable();

        if (salespersonId.HasValue)
            query = query.Where(item => item.SalespersonId == salespersonId.Value);
        if (status.HasValue)
            query = query.Where(item => item.Status == status.Value);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(item => item.CalculatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (
            items
                .Select(item => ToResponse(item, item.MerchantOrder?.MerchantOrderNumber ?? ""))
                .ToList(),
            total);
    }

    public async Task<SalesCommissionResponse> MarkCommissionPaidAsync(
        Guid? actorId, Guid commissionId, string? concurrencyToken,
        CancellationToken cancellationToken)
    {
        var commission = await _dbContext.SalesCommissions
            .Include(item => item.MerchantOrder)
            .SingleOrDefaultAsync(item => item.Id == commissionId, cancellationToken)
            ?? throw new ApiException(404, "commission_not_found",
                "That commission record no longer exists.");

        // Marking a commission paid twice is a double-click, not a second payout.
        if (commission.Status == SalesCommissionStatus.Paid)
        {
            return ToResponse(commission, commission.MerchantOrder?.MerchantOrderNumber ?? "");
        }

        if (commission.Status == SalesCommissionStatus.Reversed)
        {
            throw Conflict("commission_reversed",
                "This commission was reversed and cannot be marked paid.");
        }

        ApplyConcurrency(commission.RowVersion, concurrencyToken);

        var before = CommissionAuditSnapshot(commission);
        var now = _timeProvider.GetUtcNow();
        commission.Status = SalesCommissionStatus.Paid;
        commission.PaidAt = now;
        commission.UpdatedAt = now;

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-commission.paid",
            "SalesCommission", commission.Id, before, CommissionAuditSnapshot(commission));

        await SaveAsync(cancellationToken);
        return ToResponse(commission, commission.MerchantOrder?.MerchantOrderNumber ?? "");
    }

    // --- Building ----------------------------------------------------------

    private static MerchantReceipt BuildReceipt(
        MerchantInvoice invoice, MerchantPayment payment, MerchantOrder order,
        string receiptNumber, DateTimeOffset now)
    {
        var receipt = new MerchantReceipt
        {
            ReceiptNumber = receiptNumber,
            MerchantInvoiceId = invoice.Id,
            MerchantPaymentId = payment.Id,
            MerchantOrderId = invoice.MerchantOrderId,
            MerchantId = invoice.MerchantId,
            // Copied from the invoice, not re-read from settings: the receipt
            // must agree with the bill it settles.
            Seller = CopySeller(invoice.Seller),
            MerchantLegalNameSnapshot = invoice.MerchantLegalNameSnapshot,
            MerchantTradingNameSnapshot = invoice.MerchantTradingNameSnapshot,
            MerchantRegistrationNumberSnapshot = invoice.MerchantRegistrationNumberSnapshot,
            MerchantTaxIdentificationNumberSnapshot = invoice.MerchantTaxIdentificationNumberSnapshot,
            ContactPersonSnapshot = invoice.ContactPersonSnapshot,
            ContactEmailSnapshot = invoice.ContactEmailSnapshot,
            BillingAddressLine1Snapshot = invoice.BillingAddressLine1Snapshot,
            BillingAddressLine2Snapshot = invoice.BillingAddressLine2Snapshot,
            BillingPostcodeSnapshot = invoice.BillingPostcodeSnapshot,
            BillingCitySnapshot = invoice.BillingCitySnapshot,
            BillingStateSnapshot = invoice.BillingStateSnapshot,
            BillingCountrySnapshot = invoice.BillingCountrySnapshot,
            InvoiceNumberSnapshot = invoice.InvoiceNumber,
            MerchantOrderNumberSnapshot = order.MerchantOrderNumber,
            PaymentDate = payment.PaymentDate,
            PaymentMethod = payment.Method,
            TransactionReference = payment.TransactionReference,
            Currency = invoice.Currency,
            MerchandiseSubtotal = invoice.MerchandiseSubtotal,
            DiscountTotal = invoice.DiscountTotal,
            DeliveryFee = invoice.DeliveryFee,
            AmountPaid = payment.AmountReceived,
            IssuedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var line in invoice.Items.OrderBy(item => item.SortOrder))
        {
            receipt.Items.Add(new MerchantReceiptItem
            {
                ProductNameSnapshot = line.ProductNameSnapshot,
                SkuCodeSnapshot = line.SkuCodeSnapshot,
                OptionNameSnapshot = line.OptionNameSnapshot,
                Quantity = line.Quantity,
                WholesaleUnitPrice = line.WholesaleUnitPrice,
                LineDiscount = line.LineDiscount,
                LineSubtotal = line.LineSubtotal,
                SortOrder = line.SortOrder,
            });
        }

        return receipt;
    }

    /// <summary>
    /// Commission is earned on what was sold, so the base is the merchandise
    /// subtotal less the order discount. Delivery is excluded: passing a
    /// courier charge through is not selling.
    /// </summary>
    private static SalesCommission? BuildCommission(
        MerchantInvoice invoice, MerchantOrder order, MerchantPayment payment, DateTimeOffset now)
    {
        if (order.SalespersonId is null) return null;

        var percentage = order.SalespersonCommissionPercentageSnapshot ?? 0m;
        var baseAmount = MerchantSalesTotals.Round(
            invoice.MerchandiseSubtotal - invoice.DiscountTotal);

        return new SalesCommission
        {
            MerchantOrderId = order.Id,
            MerchantPaymentId = payment.Id,
            SalespersonId = order.SalespersonId.Value,
            SalespersonCodeSnapshot = order.SalespersonCodeSnapshot ?? "",
            SalespersonNameSnapshot = order.SalespersonNameSnapshot ?? "",
            CommissionPercentageSnapshot = percentage,
            CommissionBaseAmount = baseAmount,
            CommissionAmount = MerchantSalesTotals.Round(baseAmount * percentage / 100m),
            Currency = invoice.Currency,
            Status = SalesCommissionStatus.Payable,
            CalculatedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private static void CopyMerchantSnapshot(MerchantOrder order, MerchantInvoice invoice)
    {
        invoice.MerchantCodeSnapshot = order.MerchantCodeSnapshot;
        invoice.MerchantLegalNameSnapshot = order.MerchantLegalNameSnapshot;
        invoice.MerchantTradingNameSnapshot = order.MerchantTradingNameSnapshot;
        invoice.MerchantRegistrationNumberSnapshot = order.MerchantRegistrationNumberSnapshot;
        invoice.MerchantTaxIdentificationNumberSnapshot = order.MerchantTaxIdentificationNumberSnapshot;
        invoice.MerchantSstRegistrationNumberSnapshot = order.MerchantSstRegistrationNumberSnapshot;
        invoice.ContactPersonSnapshot = order.ContactPersonSnapshot;
        invoice.ContactEmailSnapshot = order.ContactEmailSnapshot;
        invoice.ContactPhoneSnapshot = order.ContactPhoneSnapshot;
        invoice.BillingAddressLine1Snapshot = order.BillingAddressLine1Snapshot;
        invoice.BillingAddressLine2Snapshot = order.BillingAddressLine2Snapshot;
        invoice.BillingPostcodeSnapshot = order.BillingPostcodeSnapshot;
        invoice.BillingCitySnapshot = order.BillingCitySnapshot;
        invoice.BillingStateSnapshot = order.BillingStateSnapshot;
        invoice.BillingCountrySnapshot = order.BillingCountrySnapshot;
    }

    private static SellerIdentitySnapshot CopySeller(SellerIdentitySnapshot source) => new()
    {
        BrandName = source.BrandName,
        LegalBusinessName = source.LegalBusinessName,
        BusinessRegistrationNumber = source.BusinessRegistrationNumber,
        TaxIdentificationNumber = source.TaxIdentificationNumber,
        SstRegistrationNumber = source.SstRegistrationNumber,
        AddressLine1 = source.AddressLine1,
        AddressLine2 = source.AddressLine2,
        Postcode = source.Postcode,
        City = source.City,
        State = source.State,
        Country = source.Country,
        SupportEmail = source.SupportEmail,
        BusinessPhone = source.BusinessPhone,
        BusinessWebsite = source.BusinessWebsite,
        PaymentInstructions = source.PaymentInstructions,
        BankAccountName = source.BankAccountName,
        BankName = source.BankName,
        BankAccountNumber = source.BankAccountNumber,
        DuitNowDisplayName = source.DuitNowDisplayName,
    };

    // --- Validation --------------------------------------------------------

    private void ValidatePayment(RecordMerchantPaymentRequest request, MerchantInvoice invoice)
    {
        if (request.AmountReceived <= 0m)
        {
            throw Validation("amountReceived", "Enter the amount that was received.");
        }

        if (decimal.Round(request.AmountReceived, 2) != request.AmountReceived)
        {
            throw Validation("amountReceived", "Enter an amount with at most two decimal places.");
        }

        // Full payment only. A short payment is a conversation with the
        // merchant, not a record to file.
        if (request.AmountReceived != invoice.GrandTotal)
        {
            throw Validation("amountReceived",
                request.AmountReceived < invoice.GrandTotal
                    ? $"This invoice must be settled in full. The outstanding amount is {invoice.Currency} {invoice.GrandTotal:0.00}."
                    : $"The amount is more than the invoice total of {invoice.Currency} {invoice.GrandTotal:0.00}. Record the exact amount due.");
        }

        var now = _timeProvider.GetUtcNow();
        if (request.PaymentDate > now + MaxFuturePaymentDate)
        {
            throw Validation("paymentDate", "The payment date cannot be in the future.");
        }

        if (request.PaymentDate < invoice.InvoiceDate.AddDays(-1))
        {
            throw Validation("paymentDate",
                "The payment date is before the invoice was issued. Check the date.");
        }
    }

    // --- Plumbing ----------------------------------------------------------

    private IQueryable<MerchantInvoice> InvoiceQuery() =>
        _dbContext.MerchantInvoices
            .Include(item => item.Items)
            .Include(item => item.Payments);

    private async Task<MerchantInvoice> RequireInvoiceAsync(
        Guid id, bool tracked, CancellationToken cancellationToken)
    {
        var query = InvoiceQuery();
        if (!tracked) query = query.AsNoTracking();

        return await query.SingleOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new ApiException(404, "merchant_invoice_not_found",
                "That invoice no longer exists.");
    }

    private Task<MerchantInvoice?> FindLiveInvoiceAsync(
        Guid merchantOrderId, CancellationToken cancellationToken) =>
        InvoiceQuery()
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.MerchantOrderId == merchantOrderId
                    && item.Status != MerchantInvoiceStatus.Cancelled,
                cancellationToken);

    private async Task<RecordMerchantPaymentResult> AlreadyRecordedAsync(
        MerchantInvoice invoice, CancellationToken cancellationToken)
    {
        var payment = await _dbContext.MerchantPayments
            .AsNoTracking()
            .Include(item => item.RecordedByAdminUser)
                .ThenInclude(admin => admin!.User)
            .SingleOrDefaultAsync(item => item.MerchantInvoiceId == invoice.Id, cancellationToken)
            ?? throw Conflict("merchant_invoice_paid",
                "This invoice is already marked paid, but its payment record is missing.");

        var receipt = await _dbContext.MerchantReceipts
            .AsNoTracking()
            .SingleOrDefaultAsync(item => item.MerchantInvoiceId == invoice.Id, cancellationToken)
            ?? throw Conflict("merchant_receipt_missing",
                "This invoice is already paid, but its receipt is missing.");

        var commission = await _dbContext.SalesCommissions
            .AsNoTracking()
            .Include(item => item.MerchantOrder)
            .SingleOrDefaultAsync(item => item.MerchantPaymentId == payment.Id, cancellationToken);

        return new RecordMerchantPaymentResult(
            await ToResponseAsync(invoice, cancellationToken),
            ToResponse(payment, payment.RecordedByAdminUser?.User?.DisplayName),
            ToSummary(receipt),
            commission is null
                ? null
                : ToResponse(commission, commission.MerchantOrder?.MerchantOrderNumber ?? ""),
            AlreadyRecorded: true);
    }

    private Task<AdminUser?> FindAdminAsync(Guid? actorId, CancellationToken cancellationToken)
    {
        if (!actorId.HasValue) return Task.FromResult<AdminUser?>(null);

        return _dbContext.AdminUsers
            .Include(item => item.User)
            .SingleOrDefaultAsync(item => item.UserId == actorId.Value, cancellationToken);
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw Conflict("concurrency_conflict",
                "Someone else changed this record. Reload and try again.");
        }
    }

    private void ApplyConcurrency(byte[] current, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return;

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
            throw Conflict("concurrency_conflict",
                "Someone else changed this record. Reload and try again.");
        }
    }

    // --- Mapping -----------------------------------------------------------

    private async Task<MerchantInvoiceResponse> ToResponseAsync(
        MerchantInvoice invoice, CancellationToken cancellationToken)
    {
        var payment = invoice.Payments.FirstOrDefault();
        var receipt = invoice.Status == MerchantInvoiceStatus.Paid
            ? await _dbContext.MerchantReceipts
                .AsNoTracking()
                .SingleOrDefaultAsync(item => item.MerchantInvoiceId == invoice.Id, cancellationToken)
            : null;

        return new MerchantInvoiceResponse(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.MerchantOrderId,
            invoice.MerchantOrderNumberSnapshot,
            invoice.SourceQuotationNumberSnapshot,
            invoice.MerchantId,
            invoice.MerchantCodeSnapshot,
            invoice.MerchantLegalNameSnapshot,
            invoice.MerchantTradingNameSnapshot,
            invoice.ContactPersonSnapshot,
            invoice.ContactEmailSnapshot,
            invoice.InvoiceDate,
            invoice.DueDate,
            "Due on receipt",
            invoice.Currency,
            invoice.MerchandiseSubtotal,
            invoice.DiscountTotal,
            invoice.DeliveryFee,
            invoice.GrandTotal,
            invoice.Status.ToString(),
            invoice.IssuedAt,
            invoice.PaidAt,
            invoice.CancelledAt,
            invoice.InternalNotes,
            invoice.Items
                .OrderBy(item => item.SortOrder)
                .Select(item => new MerchantInvoiceItemResponse(
                    item.Id,
                    item.ProductNameSnapshot,
                    item.SkuCodeSnapshot,
                    item.OptionNameSnapshot,
                    item.SupportsQrSnapshot,
                    item.SupportsNfcSnapshot,
                    item.Quantity,
                    item.WholesaleUnitPrice,
                    MerchantSalesTotals.Round(item.WholesaleUnitPrice * item.Quantity),
                    item.LineDiscount,
                    item.LineSubtotal,
                    item.SortOrder))
                .ToList(),
            payment is null ? null : ToResponse(payment, null),
            receipt is null ? null : ToSummary(receipt),
            Convert.ToBase64String(invoice.RowVersion));
    }

    private static MerchantPaymentResponse ToResponse(MerchantPayment payment, string? recordedBy) =>
        new(
            payment.Id,
            payment.MerchantInvoiceId,
            payment.MerchantOrderId,
            payment.PaymentDate,
            payment.AmountReceived,
            payment.Currency,
            MerchantBillingParsing.Describe(payment.Method),
            payment.TransactionReference,
            payment.InternalNote,
            payment.PaymentProofMediaFileId,
            recordedBy,
            payment.RecordedAt);

    private static MerchantReceiptSummaryResponse ToSummary(MerchantReceipt receipt) =>
        new(
            receipt.Id,
            receipt.ReceiptNumber,
            receipt.PaymentDate,
            MerchantBillingParsing.Describe(receipt.PaymentMethod),
            receipt.TransactionReference,
            receipt.AmountPaid,
            receipt.Currency,
            receipt.IssuedAt);

    private static SalesCommissionResponse ToResponse(
        SalesCommission commission, string merchantOrderNumber) =>
        new(
            commission.Id,
            commission.MerchantOrderId,
            merchantOrderNumber,
            commission.SalespersonId,
            commission.SalespersonCodeSnapshot,
            commission.SalespersonNameSnapshot,
            commission.CommissionPercentageSnapshot,
            commission.CommissionBaseAmount,
            commission.CommissionAmount,
            commission.Currency,
            commission.Status.ToString(),
            commission.CalculatedAt,
            commission.PaidAt,
            commission.ReversedAt,
            commission.InternalNote,
            Convert.ToBase64String(commission.RowVersion));

    // --- Auditing ----------------------------------------------------------
    //
    // Audit entries carry references and amounts. They never carry a billing
    // address, an internal note, a bank account or a payment proof.

    private static object InvoiceAuditSnapshot(MerchantInvoice invoice) => new
    {
        invoice.InvoiceNumber,
        invoice.MerchantOrderNumberSnapshot,
        Status = invoice.Status.ToString(),
        invoice.GrandTotal,
        invoice.Currency,
    };

    private static object PaymentAuditSnapshot(MerchantPayment payment) => new
    {
        payment.MerchantInvoiceId,
        payment.AmountReceived,
        payment.Currency,
        Method = payment.Method.ToString(),
        HasTransactionReference = !string.IsNullOrWhiteSpace(payment.TransactionReference),
        HasPaymentProof = payment.PaymentProofMediaFileId.HasValue,
        payment.PaymentDate,
    };

    private static object CommissionAuditSnapshot(SalesCommission commission) => new
    {
        commission.SalespersonCodeSnapshot,
        commission.CommissionPercentageSnapshot,
        commission.CommissionBaseAmount,
        commission.CommissionAmount,
        Status = commission.Status.ToString(),
    };

    private static string? Trimmed(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static ApiException Conflict(string code, string message) => new(409, code, message);

    private static ApiException Validation(string field, string message) =>
        new(400, "validation_failed", "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
}
