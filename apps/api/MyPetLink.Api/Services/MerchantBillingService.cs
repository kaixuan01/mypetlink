using System.Data;
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
        IReadOnlyCollection<Guid>? merchantOrderIds,
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

    Task<SalesCommissionResponse> MarkCommissionPaidAsync(
        Guid? actorId, Guid commissionId, string? concurrencyToken, CancellationToken cancellationToken);

    Task<SalesCommissionResponse> ReverseCommissionAsync(
        Guid? actorId, Guid commissionId, ReverseSalesCommissionRequest request,
        CancellationToken cancellationToken);
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
    private readonly IMerchantEmailService _merchantEmail;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public MerchantBillingService(
        MyPetLinkDbContext dbContext,
        IDocumentNumberService numbers,
        IBusinessIdentityService businessIdentity,
        IMerchantEmailService merchantEmail,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _numbers = numbers;
        _businessIdentity = businessIdentity;
        _merchantEmail = merchantEmail;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    // --- Reading -----------------------------------------------------------

    public async Task<(IReadOnlyCollection<MerchantInvoiceResponse> Items, int Total)> ListInvoicesAsync(
        int page, int pageSize, string? search, MerchantInvoiceStatus? status,
        Guid? merchantId, DateTimeOffset? fromDate, DateTimeOffset? toDate,
        IReadOnlyCollection<Guid>? merchantOrderIds,
        CancellationToken cancellationToken)
    {
        var query = InvoiceQuery().AsNoTracking();

        if (status.HasValue) query = query.Where(item => item.Status == status.Value);
        if (merchantId.HasValue) query = query.Where(item => item.MerchantId == merchantId.Value);

        // Scopes the list to a known set of orders so a caller showing one page
        // of orders can fetch exactly their invoices in one request, instead of
        // reading the newest invoices globally and hoping they overlap.
        if (merchantOrderIds is { Count: > 0 })
        {
            var ids = merchantOrderIds.Distinct().ToArray();
            query = query.Where(item => ids.Contains(item.MerchantOrderId));
        }

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

        ApplyConcurrency(invoice, invoice.RowVersion, concurrencyToken);

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
        // Resolve the immutable relationship key before opening the transaction.
        // Every payment for one merchant can then take the same lock first. If
        // invoice/order rows are read first, two transactions can retain locks
        // on different documents and deadlock while converging on the merchant
        // acquisition row.
        var merchantId = await _dbContext.MerchantInvoices
            .AsNoTracking()
            .Where(item => item.Id == invoiceId)
            .Select(item => (Guid?)item.MerchantId)
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new ApiException(404, "merchant_invoice_not_found",
                "That invoice no longer exists.");

        var strategy = _dbContext.Database.CreateExecutionStrategy();
        try
        {
            return await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = _dbContext.Database.IsRelational()
                    ? await _dbContext.Database.BeginTransactionAsync(
                        IsolationLevel.Serializable, cancellationToken)
                    : null;
                if (_dbContext.Database.IsSqlServer())
                {
                    await _dbContext.Database.ExecuteSqlInterpolatedAsync(
                        $"SELECT 1 FROM [Merchants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {merchantId}",
                        cancellationToken);
                }
                var result = await RecordPaymentCoreAsync(
                    actorId, invoiceId, request, cancellationToken);
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return result;
            });
        }
        catch (DbUpdateConcurrencyException exception)
        {
            return await ResolveConcurrentPaymentAsync(invoiceId, exception, cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            return await ResolveConcurrentPaymentAsync(invoiceId, exception, cancellationToken);
        }
    }

    private async Task<RecordMerchantPaymentResult> RecordPaymentCoreAsync(
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

        ApplyConcurrency(invoice, invoice.RowVersion, request.ConcurrencyToken);
        ValidatePayment(request, invoice);

        var order = await _dbContext.MerchantOrders
            .SingleOrDefaultAsync(item => item.Id == invoice.MerchantOrderId, cancellationToken)
            ?? throw new ApiException(404, "merchant_order_not_found", "That order no longer exists.");

        var merchant = await _dbContext.Merchants
            .Include(item => item.AcquiredBySalesperson)
            .SingleOrDefaultAsync(item => item.Id == order.MerchantId, cancellationToken)
            ?? throw new ApiException(404, "merchant_not_found", "That merchant no longer exists.");

        if (order.PaymentStatus != MerchantOrderPaymentStatus.AwaitingPayment)
        {
            throw Conflict("merchant_order_not_payable",
                "This order is no longer awaiting payment.");
        }

        var expectedTypes = merchant.CommissionPlan == MerchantCommissionPlan.LegacyPercentage
            ? new[] { SalesCommissionType.MerchantOrderPercentage }
            : new[]
            {
                SalesCommissionType.ResellerAcquisitionBonus,
                SalesCommissionType.ResellerRepeatPercentage,
            };
        if (await _dbContext.SalesCommissions.AnyAsync(
                item => item.MerchantOrderId == order.Id
                    && expectedTypes.Contains(item.CommissionType)
                    && item.Status != SalesCommissionStatus.Reversed,
                cancellationToken))
        {
            throw Conflict("merchant_order_commission_exists",
                "This order already has a valid commission. Review that commission before recording another payment.");
        }

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
            PaymentDate = request.PaymentDate.ToUniversalTime(),
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

        var acquisitionBefore = MerchantAcquisitionAuditSnapshot(merchant);
        var commission = await BuildCommissionAsync(
            invoice, order, payment, merchant, now, cancellationToken);
        var activated = merchant.FirstQualifyingMerchantOrderId == order.Id
            && acquisitionBefore.FirstQualifyingMerchantOrderId is null;

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
        if (activated)
        {
            _auditLogService.Append(actorId, ActorType.Admin,
                "merchant.acquisition-activated", "Merchant", merchant.Id,
                acquisitionBefore, MerchantAcquisitionAuditSnapshot(merchant));
        }

        // Queued inside the same unit of work, so a merchant is never told
        // their payment arrived by an email that outlived a rolled-back save.
        await _merchantEmail.EnqueuePaymentConfirmationAsync(
            invoice, receipt, payment, cancellationToken);

        // Payment, receipt, commission, acquisition terms, email and both
        // status changes land together.
        await _dbContext.SaveChangesAsync(cancellationToken);

        var stored = await RequireInvoiceAsync(invoice.Id, tracked: false, cancellationToken);
        return new RecordMerchantPaymentResult(
            await ToResponseAsync(stored, cancellationToken),
            ToResponse(payment, admin?.User?.DisplayName),
            ToSummary(receipt),
            commission is null ? null : ToResponse(commission),
            AlreadyRecorded: false);
    }

    // --- Commission --------------------------------------------------------

    public async Task<SalesCommissionResponse> MarkCommissionPaidAsync(
        Guid? actorId, Guid commissionId, string? concurrencyToken,
        CancellationToken cancellationToken)
    {
        var commission = await _dbContext.SalesCommissions
            .Include(item => item.MerchantOrder)
            .Include(item => item.TagOrder)
            .Include(item => item.Merchant)
            .SingleOrDefaultAsync(item => item.Id == commissionId, cancellationToken)
            ?? throw new ApiException(404, "commission_not_found",
                "That commission record no longer exists.");

        // Marking a commission paid twice is a double-click, not a second payout.
        if (commission.Status == SalesCommissionStatus.Paid)
        {
            return ToResponse(commission);
        }

        if (commission.Status == SalesCommissionStatus.Reversed)
        {
            throw Conflict("commission_reversed",
                "This commission was reversed and cannot be marked paid.");
        }

        ApplyConcurrency(commission, commission.RowVersion, concurrencyToken);

        var before = CommissionAuditSnapshot(commission);
        var admin = await FindAdminAsync(actorId, cancellationToken);
        var now = _timeProvider.GetUtcNow();
        commission.Status = SalesCommissionStatus.Paid;
        commission.PaidAt = now;
        commission.PaidByAdminUserId = admin?.Id;
        commission.UpdatedAt = now;

        _auditLogService.Append(actorId, ActorType.Admin,
            commission.SourceType == SalesCommissionSourceType.MerchantOrder
                ? "merchant-commission.paid"
                : "sales-commission.paid",
            "SalesCommission", commission.Id, before, CommissionAuditSnapshot(commission));

        await SaveAsync(cancellationToken);
        return ToResponse(commission);
    }

    public async Task<SalesCommissionResponse> ReverseCommissionAsync(
        Guid? actorId, Guid commissionId, ReverseSalesCommissionRequest request,
        CancellationToken cancellationToken)
    {
        var reason = Trimmed(request.Reason);
        if (reason is null)
            throw Validation("reason", "Enter why this commission is being reversed.");
        if (reason.Length > 1000)
            throw Validation("reason", "Keep the reversal reason to 1,000 characters or fewer.");

        var commission = await _dbContext.SalesCommissions
            .Include(item => item.MerchantOrder)
            .Include(item => item.TagOrder)
            .Include(item => item.Merchant)
            .SingleOrDefaultAsync(item => item.Id == commissionId, cancellationToken)
            ?? throw new ApiException(404, "commission_not_found",
                "That commission record no longer exists.");

        if (commission.Status == SalesCommissionStatus.Reversed)
            return ToResponse(commission);

        ApplyConcurrency(commission, commission.RowVersion, request.ConcurrencyToken);

        var before = CommissionAuditSnapshot(commission);
        var admin = await FindAdminAsync(actorId, cancellationToken);
        var now = _timeProvider.GetUtcNow();
        commission.Status = SalesCommissionStatus.Reversed;
        commission.ReversedAt = now;
        commission.ReversedByAdminUserId = admin?.Id;
        commission.ReversalReason = reason;
        commission.UpdatedAt = now;

        _auditLogService.Append(actorId, ActorType.Admin,
            commission.SourceType == SalesCommissionSourceType.MerchantOrder
                ? "merchant-commission.reversed"
                : "sales-commission.reversed",
            "SalesCommission", commission.Id, before, CommissionAuditSnapshot(commission));

        await SaveAsync(cancellationToken);
        return ToResponse(commission);
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
    private async Task<SalesCommission?> BuildCommissionAsync(
        MerchantInvoice invoice,
        MerchantOrder order,
        MerchantPayment payment,
        Merchant merchant,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (merchant.CommissionPlan == MerchantCommissionPlan.LegacyPercentage)
            return BuildLegacyCommission(invoice, order, payment, merchant.Id, now);

        if (merchant.FirstQualifyingMerchantOrderId.HasValue)
            return BuildRepeatCommission(invoice, order, payment, merchant, now);

        var acquiredBy = merchant.AcquiredBySalesperson;
        if (acquiredBy is null || !acquiredBy.IsActive) return null;

        var quantity = invoice.Items.Sum(item => item.Quantity);
        var acquisitionRule = await ResolveRuleAsync(
            SalesCommissionType.ResellerAcquisitionBonus,
            acquiredBy.Id,
            payment.PaymentDate,
            invoice.Currency,
            quantity,
            cancellationToken);
        // A below-tier order is valid, but it neither earns a bonus nor starts
        // the repeat window.
        if (acquisitionRule is null) return null;

        var repeatRule = await ResolveRuleAsync(
            SalesCommissionType.ResellerRepeatPercentage,
            acquiredBy.Id,
            payment.PaymentDate,
            invoice.Currency,
            null,
            cancellationToken)
            ?? throw Conflict("reseller_repeat_rule_missing",
                "Payment cannot be confirmed because the reseller repeat commission terms are not configured for this date.");
        if (!acquisitionRule.FixedAmount.HasValue
            || !repeatRule.Percentage.HasValue
            || repeatRule.EligibilityMonths is not (> 0))
        {
            throw Conflict("reseller_commission_rule_invalid",
                "Payment cannot be confirmed because the reseller commission terms are incomplete.");
        }

        merchant.FirstQualifyingPaidOrderAt = payment.PaymentDate;
        merchant.FirstQualifyingMerchantOrderId = order.Id;
        merchant.AcquiredBySalespersonCodeSnapshot = acquiredBy.SalespersonCode;
        merchant.AcquiredBySalespersonNameSnapshot = acquiredBy.Name;
        merchant.RepeatCommissionPercentageSnapshot = repeatRule.Percentage.Value;
        merchant.RepeatCommissionEligibilityMonthsSnapshot = repeatRule.EligibilityMonths.Value;
        merchant.RepeatCommissionEligibleUntil =
            payment.PaymentDate.AddMonths(repeatRule.EligibilityMonths.Value);
        merchant.RepeatCommissionRuleIdSnapshot = repeatRule.Id;
        merchant.RepeatCommissionRuleEffectiveFromSnapshot = repeatRule.EffectiveFrom;
        merchant.UpdatedAt = now;

        var calculation = MerchantCommissionCalculator.CalculateFixed(
            invoice.MerchandiseSubtotal,
            invoice.DiscountTotal,
            acquisitionRule.FixedAmount.Value);
        return NewMerchantCommission(
            merchant.Id,
            order,
            payment,
            acquiredBy.Id,
            acquiredBy.SalespersonCode,
            acquiredBy.Name,
            SalesCommissionType.ResellerAcquisitionBonus,
            calculation,
            null,
            acquisitionRule.FixedAmount.Value,
            acquisitionRule.Id,
            acquisitionRule.EffectiveFrom,
            invoice.Currency,
            now);
    }

    private static SalesCommission? BuildLegacyCommission(
        MerchantInvoice invoice,
        MerchantOrder order,
        MerchantPayment payment,
        Guid merchantId,
        DateTimeOffset now)
    {
        if (order.SalespersonId is null) return null;

        var percentage = order.SalespersonCommissionPercentageSnapshot ?? 0m;
        var calculation = MerchantCommissionCalculator.Calculate(
            invoice.MerchandiseSubtotal, invoice.DiscountTotal, percentage);

        return NewMerchantCommission(
            merchantId,
            order,
            payment,
            order.SalespersonId.Value,
            order.SalespersonCodeSnapshot ?? "",
            order.SalespersonNameSnapshot ?? "",
            SalesCommissionType.MerchantOrderPercentage,
            calculation,
            percentage,
            null,
            null,
            null,
            invoice.Currency,
            now);
    }

    private static SalesCommission? BuildRepeatCommission(
        MerchantInvoice invoice,
        MerchantOrder order,
        MerchantPayment payment,
        Merchant merchant,
        DateTimeOffset now)
    {
        if (merchant.FirstQualifyingMerchantOrderId == order.Id
            || !merchant.FirstQualifyingPaidOrderAt.HasValue
            || !merchant.RepeatCommissionEligibleUntil.HasValue
            || payment.PaymentDate < merchant.FirstQualifyingPaidOrderAt.Value
            || payment.PaymentDate >= merchant.RepeatCommissionEligibleUntil.Value)
        {
            return null;
        }

        if (!merchant.AcquiredBySalespersonId.HasValue
            || !merchant.RepeatCommissionPercentageSnapshot.HasValue)
        {
            throw Conflict("reseller_acquisition_history_invalid",
                "Payment cannot be confirmed because this reseller's acquisition history is incomplete.");
        }

        var calculation = MerchantCommissionCalculator.Calculate(
            invoice.MerchandiseSubtotal,
            invoice.DiscountTotal,
            merchant.RepeatCommissionPercentageSnapshot.Value);

        return NewMerchantCommission(
            merchant.Id,
            order,
            payment,
            merchant.AcquiredBySalespersonId.Value,
            merchant.AcquiredBySalespersonCodeSnapshot ?? "",
            merchant.AcquiredBySalespersonNameSnapshot ?? "",
            SalesCommissionType.ResellerRepeatPercentage,
            calculation,
            merchant.RepeatCommissionPercentageSnapshot,
            null,
            merchant.RepeatCommissionRuleIdSnapshot,
            merchant.RepeatCommissionRuleEffectiveFromSnapshot,
            invoice.Currency,
            now);
    }

    private static SalesCommission NewMerchantCommission(
        Guid merchantId,
        MerchantOrder order,
        MerchantPayment payment,
        Guid salespersonId,
        string salespersonCode,
        string salespersonName,
        SalesCommissionType type,
        MerchantCommissionCalculation calculation,
        decimal? percentage,
        decimal? fixedAmount,
        Guid? ruleId,
        DateTimeOffset? ruleEffectiveFrom,
        string currency,
        DateTimeOffset now)
    {

        return new SalesCommission
        {
            SourceType = SalesCommissionSourceType.MerchantOrder,
            CommissionType = type,
            MerchantId = merchantId,
            MerchantOrderId = order.Id,
            MerchantPaymentId = payment.Id,
            SalespersonId = salespersonId,
            SalespersonCodeSnapshot = salespersonCode,
            SalespersonNameSnapshot = salespersonName,
            CommissionPercentageSnapshot = percentage,
            CommissionFixedAmountSnapshot = fixedAmount,
            CommissionRuleId = ruleId,
            CommissionRuleEffectiveFromSnapshot = ruleEffectiveFrom,
            CommissionBaseAmount = calculation.BaseAmount,
            CommissionAmount = calculation.Amount,
            Currency = currency,
            Status = SalesCommissionStatus.Payable,
            CalculatedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private async Task<CommissionRule?> ResolveRuleAsync(
        SalesCommissionType type,
        Guid salespersonId,
        DateTimeOffset effectiveAt,
        string currency,
        int? quantity,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.CommissionRules
            .AsNoTracking()
            .Where(rule => rule.CommissionType == type
                && rule.IsActive
                && (rule.SalespersonId == null || rule.SalespersonId == salespersonId)
                && rule.Currency == currency
                && rule.EffectiveFrom <= effectiveAt
                && (rule.EffectiveTo == null || effectiveAt < rule.EffectiveTo));
        if (quantity.HasValue)
        {
            query = query.Where(rule =>
                (rule.MinQuantity == null || rule.MinQuantity <= quantity.Value)
                && (rule.MaxQuantity == null || quantity.Value <= rule.MaxQuantity));
        }
        else
        {
            query = query.Where(rule => rule.MinQuantity == null && rule.MaxQuantity == null);
        }

        return await query
            .OrderByDescending(rule => rule.SalespersonId.HasValue)
            .ThenByDescending(rule => rule.EffectiveFrom)
            .FirstOrDefaultAsync(cancellationToken);
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

        var commissions = await _dbContext.SalesCommissions
            .AsNoTracking()
            .Include(item => item.MerchantOrder)
            .Where(item => item.MerchantPaymentId == payment.Id)
            .ToListAsync(cancellationToken);
        if (commissions.Count > 1)
            throw Conflict("merchant_payment_commission_conflict",
                "This payment has conflicting commission records and needs review.");
        var commission = commissions.SingleOrDefault();

        return new RecordMerchantPaymentResult(
            await ToResponseAsync(invoice, cancellationToken),
            ToResponse(payment, payment.RecordedByAdminUser?.User?.DisplayName),
            ToSummary(receipt),
            commission is null
                ? null
                : ToResponse(commission),
            AlreadyRecorded: true);
    }

    private async Task<RecordMerchantPaymentResult> ResolveConcurrentPaymentAsync(
        Guid invoiceId,
        Exception original,
        CancellationToken cancellationToken)
    {
        _dbContext.ChangeTracker.Clear();
        var settled = await RequireInvoiceAsync(invoiceId, tracked: false, cancellationToken);
        if (settled.Status == MerchantInvoiceStatus.Paid)
            return await AlreadyRecordedAsync(settled, cancellationToken);

        System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(original).Throw();
        throw new InvalidOperationException("Unreachable.");
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

    private void ApplyConcurrency(object entity, byte[] current, string? token)
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
        _dbContext.Entry(entity).Property("RowVersion").OriginalValue = expected;
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

    private static SalesCommissionResponse ToResponse(SalesCommission commission) =>
        new(
            commission.Id,
            commission.SourceType.ToString(),
            commission.CommissionType.ToString(),
            commission.MerchantOrderId,
            commission.MerchantPaymentId,
            commission.TagOrderId,
            commission.MerchantId,
            commission.Merchant?.TradingName ?? commission.Merchant?.LegalBusinessName,
            commission.SourceType == SalesCommissionSourceType.MerchantOrder
                ? commission.MerchantOrder?.MerchantOrderNumber ?? ""
                : commission.TagOrder?.OrderNumber ?? "",
            commission.SalespersonId,
            commission.SalespersonCodeSnapshot,
            commission.SalespersonNameSnapshot,
            commission.CommissionPercentageSnapshot,
            commission.CommissionFixedAmountSnapshot,
            commission.CommissionBaseAmount,
            commission.CommissionAmount,
            commission.Currency,
            commission.CommissionRuleId,
            commission.CommissionRuleEffectiveFromSnapshot,
            commission.Status.ToString(),
            commission.CalculatedAt,
            commission.PaidAt,
            commission.PaidByAdminUserId,
            commission.ReversedAt,
            commission.ReversedByAdminUserId,
            commission.ReversalReason,
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
        SourceType = commission.SourceType.ToString(),
        CommissionType = commission.CommissionType.ToString(),
        commission.MerchantOrderId,
        commission.MerchantPaymentId,
        commission.TagOrderId,
        commission.SalespersonCodeSnapshot,
        commission.CommissionPercentageSnapshot,
        commission.CommissionFixedAmountSnapshot,
        commission.CommissionBaseAmount,
        commission.CommissionAmount,
        commission.CommissionRuleId,
        commission.CommissionRuleEffectiveFromSnapshot,
        Status = commission.Status.ToString(),
        commission.PaidAt,
        commission.PaidByAdminUserId,
        commission.ReversedAt,
        commission.ReversedByAdminUserId,
        commission.ReversalReason,
    };

    private static MerchantAcquisitionSnapshot MerchantAcquisitionAuditSnapshot(Merchant merchant) => new(
        merchant.AcquiredBySalespersonId,
        merchant.FirstQualifyingMerchantOrderId,
        merchant.FirstQualifyingPaidOrderAt,
        merchant.RepeatCommissionPercentageSnapshot,
        merchant.RepeatCommissionEligibilityMonthsSnapshot,
        merchant.RepeatCommissionEligibleUntil,
        merchant.RepeatCommissionRuleIdSnapshot);

    private sealed record MerchantAcquisitionSnapshot(
        Guid? AcquiredBySalespersonId,
        Guid? FirstQualifyingMerchantOrderId,
        DateTimeOffset? FirstQualifyingPaidOrderAt,
        decimal? RepeatCommissionPercentageSnapshot,
        int? RepeatCommissionEligibilityMonthsSnapshot,
        DateTimeOffset? RepeatCommissionEligibleUntil,
        Guid? RepeatCommissionRuleIdSnapshot);

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
