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

    public PaymentReservationExpiryWorker(
        IServiceScopeFactory scopeFactory,
        IOptionsMonitor<OrderReservationOptions> options,
        ILogger<PaymentReservationExpiryWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options;
        _logger = logger;
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
                await Task.Delay(
                    TimeSpan.FromSeconds(Math.Clamp(options.PollIntervalSeconds, 5, 3600)),
                    stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
