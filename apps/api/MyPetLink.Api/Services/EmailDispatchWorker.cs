using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public sealed class EmailDispatchWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptionsMonitor<EmailOptions> _options;
    private readonly ILogger<EmailDispatchWorker> _logger;

    public EmailDispatchWorker(
        IServiceScopeFactory scopeFactory,
        IOptionsMonitor<EmailOptions> options,
        ILogger<EmailDispatchWorker> logger)
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
                if (options.Enabled)
                {
                    await DispatchOnceAsync(options, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                _logger.LogError("The email dispatch cycle failed and will be retried.");
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(Math.Clamp(
                        options.Dispatch.PollIntervalSeconds,
                        1,
                        300)),
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task DispatchOnceAsync(
        EmailOptions options,
        CancellationToken cancellationToken)
    {
        IReadOnlyCollection<ClaimedEmail> claims;
        using (var scope = _scopeFactory.CreateScope())
        {
            var dispatcher = scope.ServiceProvider.GetRequiredService<IEmailOutboxDispatcher>();
            claims = await dispatcher.ClaimBatchAsync(
                Math.Clamp(options.Dispatch.BatchSize, 1, 100),
                TimeSpan.FromSeconds(Math.Clamp(
                    options.Dispatch.VisibilityTimeoutSeconds,
                    30,
                    1800)),
                cancellationToken);
        }

        await Parallel.ForEachAsync(
            claims,
            new ParallelOptions
            {
                CancellationToken = cancellationToken,
                MaxDegreeOfParallelism = Math.Clamp(
                    options.Dispatch.MaxConcurrency,
                    1,
                    10)
            },
            async (claim, token) =>
            {
                using var scope = _scopeFactory.CreateScope();
                var dispatcher = scope.ServiceProvider.GetRequiredService<IEmailOutboxDispatcher>();
                await dispatcher.DispatchAsync(claim, token);
            });
    }
}
