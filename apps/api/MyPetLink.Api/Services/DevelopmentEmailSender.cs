namespace MyPetLink.Api.Services;

// Local delivery sink. It deliberately performs no network I/O and records no
// message body or recipient address in logs.
public sealed class DevelopmentEmailSender : IEmailSender
{
    private readonly ILogger<DevelopmentEmailSender> _logger;

    public DevelopmentEmailSender(ILogger<DevelopmentEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _logger.LogInformation(
            "Development email accepted for outbox message {OutboxId}.",
            message.OutboxId);
        return Task.CompletedTask;
    }
}
