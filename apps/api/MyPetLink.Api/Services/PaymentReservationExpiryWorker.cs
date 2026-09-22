using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

/// <summary>
/// Periodically releases inventory held by abandoned unpaid orders. Mirrors the
/// email dispatch worker: one scoped cycle at a time, cancellation aware, and a
/// failed cycle is logged and retried rather than stopping the host.
/// </summary>
public sealed class PaymentReservationExpiryWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptionsMonitor<OrderReservationOptions> _options;
    private readonly ILogger<PaymentReservationExpiryWorker> _logger;

    /// <summary>
    /// Wall clock in production, virtual time in tests. Without this the only
    /// way to observe a retry was to wait out a real poll interval, which made
    /// the retry test a race against a stopwatch on a loaded CI runner.
    /// Optional and defaulting to the system clock, so DI and every existing
    /// caller are unaffected - the same shape as AdminAccessManagementService.
    /// </summary>
    private readonly TimeProvider _timeProvider;

    public PaymentReservationExpiryWorker(
        IServiceScopeFactory scopeFactory,
        IOptionsMonitor<OrderReservationOptions> options,
        ILogger<PaymentReservationExpiryWorker> logger,
        TimeProvider? timeProvider = null)
    {
        _scopeFactory = scopeFactory;
        _options = options;
        _logger = logger;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var options = _options.CurrentValue;
            try
            {
                if (options.ExpiryEnabled)
                {
                    // A single sequential cycle per instance; overlapping runs
                    // are impossible because the next delay starts after this
                    // one completes, and concurrent hosts are serialised by the
                    // SKU lock plus the guarded re-check inside the service.
                    using var scope = _scopeFactory.CreateScope();
                    var service = scope.ServiceProvider
                        .GetRequiredService<IPaymentReservationExpiryService>();
                    await service.ExpireDueOrdersAsync(options.BatchSize, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                _logger.LogError("The reservation expiry cycle failed and will be retried.");
            }

            try
            {
                // The five-second floor is a production guard against
                // hammering the database and is deliberately not relaxed for
                // tests; they move the clock instead.
                await Task.Delay(
                    TimeSpan.FromSeconds(Math.Clamp(options.PollIntervalSeconds, 5, 3600)),
                    _timeProvider,
                    stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
