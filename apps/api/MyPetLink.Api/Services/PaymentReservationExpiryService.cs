using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IPaymentReservationExpiryService
{
    /// <summary>
    /// Cancels unpaid orders whose reservation deadline has passed, releasing
    /// their inventory. Returns how many orders were expired.
    /// </summary>
    Task<int> ExpireDueOrdersAsync(int batchSize, CancellationToken cancellationToken = default);
}

/// <summary>
/// Releases inventory held by abandoned unpaid orders.
///
/// Every claim re-reads the order inside the same SKU-scoped lock that order
/// creation uses, so an expiry can never race a checkout, a proof submission,
/// an approval, an owner cancellation, or a second worker instance: whichever
/// operation reaches the guarded re-check first wins and the other becomes a
/// no-op rather than a duplicate cancellation.
/// </summary>
public sealed class PaymentReservationExpiryService : IPaymentReservationExpiryService
{
    public const string AuditAction = "payment-reservation.expired";
    internal const string CustomerTimelineMessage =
        "Order expired because payment was not completed in time";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<PaymentReservationExpiryService> _logger;

    public PaymentReservationExpiryService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider,
        ILogger<PaymentReservationExpiryService> logger)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<int> ExpireDueOrdersAsync(
        int batchSize,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var dueOrderIds = await DueOrdersQuery(now)
            .OrderBy(order => order.PaymentReservationExpiresAt)
            .Take(Math.Clamp(batchSize, 1, 200))
            .Select(order => order.Id)
            .ToListAsync(cancellationToken);

        var expired = 0;
        foreach (var orderId in dueOrderIds)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            try
            {
                if (await TryExpireAsync(orderId, cancellationToken))
                {
                    expired++;
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // One poisoned order must not stop the batch. No customer data
                // is logged — only the order id and the failure itself.
                _logger.LogError(
                    exception,
                    "Failed to expire payment reservation for order {OrderId}.",
                    orderId);
            }
        }

        if (expired > 0)
        {
            _logger.LogInformation("Expired {ExpiredCount} unpaid tag order reservations.", expired);
        }

        return expired;
    }

    private async Task<bool> TryExpireAsync(Guid orderId, CancellationToken cancellationToken)
    {
        // Lock the SKUs this order reserves before re-reading it, so checkout
        // cannot consume the released stock mid-flight and a concurrent worker
        // cannot claim the same order.
        await using var inventoryLock = _dbContext.Database.IsSqlServer()
            ? await SqlServerInventoryReservationLock.AcquireForOrderAsync(
                _dbContext, orderId, cancellationToken)
            : null;

        var now = _timeProvider.GetUtcNow();
        var order = await DueOrdersQuery(now)
            .Include(item => item.AssignedTags)
            .FirstOrDefaultAsync(item => item.Id == orderId, cancellationToken);

        if (order is null)
        {
            // Paid, cancelled, proof submitted, or already expired between the
            // scan and the lock. Nothing to do — this is the safe race outcome.
            return false;
        }

        var previous = new
        {
            status = order.Status.ToString(),
            paymentStatus = order.PaymentStatus.ToString(),
            expiresAt = order.PaymentReservationExpiresAt,
        };

        order.Status = OrderStatus.Cancelled;
        order.CancelledAt ??= now;
        order.PaymentReservationExpiredAt = now;
        order.TrackingStatus = CustomerTimelineMessage;
        order.UpdatedAt = now;

        // Any tag already attached to an unshipped order returns to stock, the
        // same release the admin cancellation performs.
        foreach (var tag in order.AssignedTags.Where(tag =>
                     tag.Status is SmartTagStatus.Pending or SmartTagStatus.Preparing))
        {
            tag.OwnerUserId = null;
            tag.PetId = null;
            tag.OrderId = null;
            tag.OrderItemId = null;
            tag.Status = SmartTagStatus.Unclaimed;
            tag.UpdatedAt = now;
        }

        order.SmartTagId = null;
        order.SmartTag = null;

        _auditLogService.Append(
            null,
            ActorType.System,
            AuditAction,
            "TagOrder",
            order.Id,
            previous,
            new
            {
                status = order.Status.ToString(),
                expiredAt = now,
                reason = CustomerTimelineMessage,
            });

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// The only orders an automatic expiry may claim: still unpaid, past their
    /// snapshot deadline, and carrying no proof awaiting review.
    /// </summary>
    private IQueryable<TagOrder> DueOrdersQuery(DateTimeOffset now) => _dbContext.TagOrders
        .Where(order =>
            order.Status == OrderStatus.PendingPayment
            && order.PaymentStatus != PaymentStatus.Confirmed
            && order.CancelledAt == null
            && order.PaymentConfirmedAt == null
            && order.ShippedAt == null
            && order.PaymentReservationExpiresAt != null
            && order.PaymentReservationExpiresAt <= now
            && !order.PaymentProofs.Any(proof =>
                proof.Status == PaymentProofStatus.PendingReview
                || proof.Status == PaymentProofStatus.Approved));
}
