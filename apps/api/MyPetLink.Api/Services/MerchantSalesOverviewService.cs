using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Read models the Merchant Sales workspace needs and no existing endpoint
/// provides: the overview counters, and the delivery state of the emails
/// belonging to a set of documents.
///
/// Both are deliberately read-only projections. The counters are computed here
/// rather than in the browser so the numbers an administrator acts on come
/// from the database, and the email states are fetched for a whole page at
/// once so a list never issues one request per row.
/// </summary>
public interface IMerchantSalesOverviewService
{
    Task<MerchantSalesOverviewResponse> GetOverviewAsync(
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<MerchantDocumentEmailStatusResponse>> GetEmailStatusesAsync(
        IReadOnlyCollection<Guid> quotationIds,
        IReadOnlyCollection<Guid> invoiceIds,
        CancellationToken cancellationToken = default);
}

public sealed class MerchantSalesOverviewService : IMerchantSalesOverviewService
{
    /// <summary>Guards the id lists so one request cannot ask for everything.</summary>
    private const int MaxIdsPerRequest = 200;

    private readonly MyPetLinkDbContext _dbContext;

    public MerchantSalesOverviewService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<MerchantSalesOverviewResponse> GetOverviewAsync(
        CancellationToken cancellationToken = default)
    {
        var quotations = await _dbContext.MerchantQuotations
            .AsNoTracking()
            .GroupBy(item => item.Status)
            .Select(group => new StatusCount<MerchantQuotationStatus>(group.Key, group.Count()))
            .ToListAsync(cancellationToken);

        var orders = await _dbContext.MerchantOrders
            .AsNoTracking()
            .GroupBy(item => item.PaymentStatus)
            .Select(group => new StatusCount<MerchantOrderPaymentStatus>(group.Key, group.Count()))
            .ToListAsync(cancellationToken);

        // An order is awaiting its invoice while it is unpaid and has no live
        // invoice; once one exists the work moves to the invoice.
        var invoicedOrderIds = _dbContext.MerchantInvoices
            .AsNoTracking()
            .Where(invoice => invoice.Status != MerchantInvoiceStatus.Cancelled)
            .Select(invoice => invoice.MerchantOrderId);

        var awaitingInvoice = await _dbContext.MerchantOrders
            .AsNoTracking()
            .CountAsync(
                order => order.PaymentStatus == MerchantOrderPaymentStatus.AwaitingPayment
                    && !invoicedOrderIds.Contains(order.Id),
                cancellationToken);

        var unpaidInvoices = await _dbContext.MerchantInvoices
            .AsNoTracking()
            .Where(invoice => invoice.Status == MerchantInvoiceStatus.Issued)
            .Select(invoice => invoice.GrandTotal)
            .ToListAsync(cancellationToken);

        var payableCommission = await _dbContext.SalesCommissions
            .AsNoTracking()
            .Where(item => item.Status == SalesCommissionStatus.Payable)
            .Select(item => item.CommissionAmount)
            .ToListAsync(cancellationToken);

        return new MerchantSalesOverviewResponse(
            ActiveMerchants: await _dbContext.Merchants
                .AsNoTracking().CountAsync(item => item.IsActive, cancellationToken),
            ActiveSalespersons: await _dbContext.Salespersons
                .AsNoTracking().CountAsync(item => item.IsActive, cancellationToken),
            DraftQuotations: Count(quotations, MerchantQuotationStatus.Draft),
            SentQuotations: Count(quotations, MerchantQuotationStatus.Sent),
            AcceptedQuotationsAwaitingConversion: Count(quotations, MerchantQuotationStatus.Accepted),
            OrdersAwaitingInvoice: awaitingInvoice,
            InvoicesAwaitingPayment: unpaidInvoices.Count,
            // Paid but not yet allocated. Allocation is the next phase, so
            // every confirmed order is currently waiting for it.
            PaidOrdersAwaitingAllocation: Count(
                orders, MerchantOrderPaymentStatus.PaymentConfirmed),
            OutstandingInvoiceTotal: unpaidInvoices.Sum(),
            PayableCommissionTotal: payableCommission.Sum(),
            Currency: MerchantSalesConstants.Currency);
    }

    public async Task<IReadOnlyCollection<MerchantDocumentEmailStatusResponse>> GetEmailStatusesAsync(
        IReadOnlyCollection<Guid> quotationIds,
        IReadOnlyCollection<Guid> invoiceIds,
        CancellationToken cancellationToken = default)
    {
        var quotations = quotationIds.Distinct().Take(MaxIdsPerRequest).ToArray();
        var invoices = invoiceIds.Distinct().Take(MaxIdsPerRequest).ToArray();

        if (quotations.Length == 0 && invoices.Length == 0)
        {
            return [];
        }

        var rows = await _dbContext.EmailOutbox
            .AsNoTracking()
            .Where(item =>
                (item.RelatedMerchantQuotationId != null
                    && quotations.Contains(item.RelatedMerchantQuotationId.Value))
                || (item.RelatedMerchantInvoiceId != null
                    && invoices.Contains(item.RelatedMerchantInvoiceId.Value)))
            .Select(item => new
            {
                item.RelatedMerchantQuotationId,
                item.RelatedMerchantInvoiceId,
                item.MessageType,
                item.Status,
                item.SuppressionReason,
                item.RecipientEmail,
                item.SentAt,
                item.AttemptCount,
                item.MaxAttempts,
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new MerchantDocumentEmailStatusResponse(
                row.RelatedMerchantQuotationId ?? row.RelatedMerchantInvoiceId ?? Guid.Empty,
                row.MessageType.ToString(),
                row.Status.ToString(),
                row.SuppressionReason,
                row.RecipientEmail,
                row.SentAt,
                // Only a failure with attempts left is worth offering a retry
                // for; anything else would invite a pointless click.
                row.Status == EmailOutboxStatus.Failed && row.AttemptCount < row.MaxAttempts))
            .ToArray();
    }

    private sealed record StatusCount<T>(T Status, int Count);

    private static int Count<T>(IEnumerable<StatusCount<T>> rows, T status) =>
        rows.FirstOrDefault(row => EqualityComparer<T>.Default.Equals(row.Status, status))?.Count ?? 0;
}
