using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class EmailOutboxDispatcher : IEmailOutboxDispatcher
{
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(30),
        TimeSpan.FromHours(2)
    ];

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IEmailTemplateRenderer _renderer;
    private readonly IEmailSender _sender;
    private readonly IEmailTemplateGate _gate;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<EmailOutboxDispatcher> _logger;

    public EmailOutboxDispatcher(
        MyPetLinkDbContext dbContext,
        IEmailTemplateRenderer renderer,
        IEmailSender sender,
        IEmailTemplateGate gate,
        TimeProvider timeProvider,
        ILogger<EmailOutboxDispatcher> logger)
    {
        _dbContext = dbContext;
        _renderer = renderer;
        _sender = sender;
        _gate = gate;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<IReadOnlyCollection<ClaimedEmail>> ClaimBatchAsync(
        int batchSize,
        TimeSpan visibilityTimeout,
        CancellationToken cancellationToken = default)
    {
        // Only templates that are switched on are queried at all, so a
        // disabled template's rows are never claimed, never attempted, and
        // never touched. When nothing may send we skip the query completely
        // rather than rescanning rows we must ignore.
        var eligible = await _gate.GetEligibleAsync(cancellationToken);
        if (eligible.Count == 0)
        {
            return [];
        }

        var now = _timeProvider.GetUtcNow();
        var boundedBatchSize = Math.Clamp(batchSize, 1, 100);

        // Each template is queried against its own EnabledFromUtc, so messages
        // recorded before the template was switched on stay blocked forever.
        // Enabling a template releases new events only, never a backlog.
        var candidates = new List<(Guid Id, DateTimeOffset NextAttemptAt, DateTimeOffset CreatedAt)>();
        foreach (var template in eligible)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var rows = await _dbContext.EmailOutbox
                .AsNoTracking()
                .Where(item =>
                    item.MessageType == template.MessageType
                    && item.CreatedAt >= template.EnabledFromUtc
                    && ((item.Status == EmailOutboxStatus.Pending && item.NextAttemptAt <= now)
                        || (item.Status == EmailOutboxStatus.Sending
                            && (!item.LockedUntil.HasValue || item.LockedUntil <= now))))
                .OrderBy(item => item.NextAttemptAt)
                .ThenBy(item => item.CreatedAt)
                .Select(item => new { item.Id, item.NextAttemptAt, item.CreatedAt })
                .Take(boundedBatchSize * 2)
                .ToListAsync(cancellationToken);
            candidates.AddRange(rows.Select(row => (row.Id, row.NextAttemptAt, row.CreatedAt)));
        }

        var candidateIds = candidates
            .OrderBy(row => row.NextAttemptAt)
            .ThenBy(row => row.CreatedAt)
            .Select(row => row.Id)
            .Take(boundedBatchSize * 2)
            .ToList();

        var claims = new List<ClaimedEmail>(boundedBatchSize);
        foreach (var id in candidateIds)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (claims.Count >= boundedBatchSize)
            {
                break;
            }

            var lockToken = Guid.NewGuid();
            var lockedUntil = now.Add(visibilityTimeout);
            var claimed = _dbContext.Database.IsRelational()
                ? await ClaimRelationalAsync(id, lockToken, now, lockedUntil, cancellationToken)
                : await ClaimInMemoryAsync(id, lockToken, now, lockedUntil, cancellationToken);
            if (claimed)
            {
                claims.Add(new ClaimedEmail(id, lockToken));
            }
        }

        return claims;
    }

    public async Task DispatchAsync(
        ClaimedEmail claim,
        CancellationToken cancellationToken = default)
    {
        var message = await _dbContext.EmailOutbox.SingleOrDefaultAsync(
            item => item.Id == claim.Id
                    && item.Status == EmailOutboxStatus.Sending
                    && item.LockToken == claim.LockToken,
            cancellationToken);
        if (message is null)
        {
            return;
        }

        try
        {
            var content = _renderer.Render(message);
            await _sender.SendAsync(
                new EmailMessage(
                    message.Id,
                    message.RecipientEmail,
                    message.RecipientName,
                    message.Subject,
                    content.HtmlBody,
                    content.TextBody),
                cancellationToken);

            var now = _timeProvider.GetUtcNow();
            message.Status = EmailOutboxStatus.Sent;
            message.SentAt = now;
            message.LastError = null;
            message.LockToken = null;
            message.LockedUntil = null;
            message.UpdatedAt = now;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The visibility lease safely makes the row reclaimable after a
            // graceful or forced shutdown.
            throw;
        }
        catch (EmailDeliveryException exception)
        {
            await RecordFailureAsync(message, exception.IsTransient, exception.Message, cancellationToken);
            _logger.LogWarning(
                "Email outbox message {OutboxId} failed ({FailureKind}).",
                message.Id,
                exception.IsTransient ? "transient" : "permanent");
        }
        catch (Exception)
        {
            await RecordFailureAsync(
                message,
                transient: true,
                "The email could not be delivered right now.",
                cancellationToken);
            _logger.LogWarning(
                "Email outbox message {OutboxId} failed with an unclassified delivery error.",
                message.Id);
        }
    }

    private async Task<bool> ClaimRelationalAsync(
        Guid id,
        Guid lockToken,
        DateTimeOffset now,
        DateTimeOffset lockedUntil,
        CancellationToken cancellationToken)
    {
        var affected = await _dbContext.EmailOutbox
            .Where(item => item.Id == id
                           && ((item.Status == EmailOutboxStatus.Pending && item.NextAttemptAt <= now)
                               || (item.Status == EmailOutboxStatus.Sending
                                   && (!item.LockedUntil.HasValue || item.LockedUntil <= now))))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(item => item.Status, EmailOutboxStatus.Sending)
                    .SetProperty(item => item.LockToken, lockToken)
                    .SetProperty(item => item.LockedUntil, lockedUntil)
                    .SetProperty(item => item.LastAttemptAt, now)
                    .SetProperty(item => item.AttemptCount, item => item.AttemptCount + 1)
                    .SetProperty(item => item.UpdatedAt, now),
                cancellationToken);
        return affected == 1;
    }

    private async Task<bool> ClaimInMemoryAsync(
        Guid id,
        Guid lockToken,
        DateTimeOffset now,
        DateTimeOffset lockedUntil,
        CancellationToken cancellationToken)
    {
        var message = await _dbContext.EmailOutbox.SingleOrDefaultAsync(
            item => item.Id == id,
            cancellationToken);
        if (message is null
            || (message.Status == EmailOutboxStatus.Pending && message.NextAttemptAt > now)
            || (message.Status == EmailOutboxStatus.Sending
                && message.LockedUntil.HasValue
                && message.LockedUntil > now)
            || message.Status is EmailOutboxStatus.Sent or EmailOutboxStatus.Failed)
        {
            return false;
        }

        message.Status = EmailOutboxStatus.Sending;
        message.LockToken = lockToken;
        message.LockedUntil = lockedUntil;
        message.LastAttemptAt = now;
        message.AttemptCount += 1;
        message.UpdatedAt = now;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task RecordFailureAsync(
        EmailOutbox message,
        bool transient,
        string safeError,
        CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var exhausted = message.AttemptCount >= message.MaxAttempts;
        message.Status = !transient || exhausted
            ? EmailOutboxStatus.Failed
            : EmailOutboxStatus.Pending;
        message.NextAttemptAt = message.Status == EmailOutboxStatus.Pending
            ? now.Add(RetryDelayAfter(message.AttemptCount))
            : now;
        message.LastError = LimitError(safeError);
        message.LockToken = null;
        message.LockedUntil = null;
        message.UpdatedAt = now;
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static TimeSpan RetryDelayAfter(int attemptCount)
    {
        var index = Math.Clamp(attemptCount - 1, 0, RetryDelays.Length - 1);
        return RetryDelays[index];
    }

    private static string LimitError(string value)
    {
        var normalized = value.Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
        return normalized.Length <= 600 ? normalized : normalized[..600];
    }
}
