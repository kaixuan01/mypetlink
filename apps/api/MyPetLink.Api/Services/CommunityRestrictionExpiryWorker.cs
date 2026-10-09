namespace MyPetLink.Api.Services;

/// <summary>
/// Ends timed Community restrictions about once a minute. Mirrors the payment
/// reservation expiry worker: one scoped cycle at a time, cancellation aware,
/// and a failed cycle is logged and retried rather than stopping the host.
///
/// The interval is fixed, not configuration: it only bounds how long past its
/// end a restriction can stand — never more than a minute or so — and the
/// restricted household is shown that end, not the worker's timing.
/// </summary>
public sealed class CommunityRestrictionExpiryWorker : BackgroundService
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);
    private const int BatchSize = 50;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CommunityRestrictionExpiryWorker> _logger;
    private readonly TimeProvider _timeProvider;

    public CommunityRestrictionExpiryWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<CommunityRestrictionExpiryWorker> logger,
        TimeProvider? timeProvider = null)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Concurrent hosts are serialised by the household lock and the
                // re-check inside the service, so overlapping cycles end each
                // restriction once.
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<ICommunityRestrictionExpiryService>();
                await service.ExpireDueRestrictionsAsync(BatchSize, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                _logger.LogError("The Community restriction expiry cycle failed and will be retried.");
            }

            try
            {
                await Task.Delay(PollInterval, _timeProvider, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
