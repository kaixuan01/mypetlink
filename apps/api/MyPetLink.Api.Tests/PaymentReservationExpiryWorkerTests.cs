using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class PaymentReservationExpiryWorkerTests
{
    [Fact]
    public void OptionsValidator_AcceptsBoundariesAndRejectsUnsafeTuning()
    {
        var validator = new OrderReservationOptionsValidator();
        Assert.True(validator.Validate(null, new OrderReservationOptions
        {
            PollIntervalSeconds = 5,
            BatchSize = 1,
        }).Succeeded);
        Assert.True(validator.Validate(null, new OrderReservationOptions
        {
            PollIntervalSeconds = 3600,
            BatchSize = 200,
        }).Succeeded);
        Assert.False(validator.Validate(null, new OrderReservationOptions
        {
            PollIntervalSeconds = 4,
            BatchSize = 201,
        }).Succeeded);
    }

    [Fact]
    public async Task DisabledWorker_PerformsNoExpiryCycle()
    {
        var fake = new FakeExpiryService();
        await using var provider = Services(fake).BuildServiceProvider();
        var worker = new PaymentReservationExpiryWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new StaticOptionsMonitor(new OrderReservationOptions
            {
                ExpiryEnabled = false,
                PollIntervalSeconds = 5,
                BatchSize = 9,
            }),
            NullLogger<PaymentReservationExpiryWorker>.Instance);

        await worker.StartAsync(default);
        await Task.Delay(100);
        await worker.StopAsync(default);

        Assert.Equal(0, fake.Calls);
    }

    [Fact]
    public async Task FailedCycle_RetriesWithoutStoppingHost_AndKeepsBatchSize()
    {
        var fake = new FakeExpiryService(failFirst: true);
        await using var provider = Services(fake).BuildServiceProvider();
        var worker = new PaymentReservationExpiryWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            new StaticOptionsMonitor(new OrderReservationOptions
            {
                ExpiryEnabled = true,
                PollIntervalSeconds = 5,
                BatchSize = 11,
            }),
            NullLogger<PaymentReservationExpiryWorker>.Instance);

        await worker.StartAsync(default);
        var completed = await Task.WhenAny(fake.SecondCall.Task, Task.Delay(TimeSpan.FromSeconds(8)));
        await worker.StopAsync(default);

        Assert.Same(fake.SecondCall.Task, completed);
        Assert.Equal(2, fake.Calls);
        Assert.All(fake.BatchSizes, size => Assert.Equal(11, size));
    }

    private static IServiceCollection Services(FakeExpiryService fake) => new ServiceCollection()
        .AddSingleton<IPaymentReservationExpiryService>(fake);

    private sealed class FakeExpiryService : IPaymentReservationExpiryService
    {
        private readonly bool _failFirst;
        public FakeExpiryService(bool failFirst = false) => _failFirst = failFirst;
        public int Calls { get; private set; }
        public List<int> BatchSizes { get; } = [];
        public TaskCompletionSource SecondCall { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<int> ExpireDueOrdersAsync(int batchSize, CancellationToken cancellationToken = default)
        {
            Calls++;
            BatchSizes.Add(batchSize);
            if (_failFirst && Calls == 1) throw new InvalidOperationException("Synthetic cycle failure");
            if (Calls >= 2) SecondCall.TrySetResult();
            return Task.FromResult(0);
        }
    }

    private sealed class StaticOptionsMonitor(OrderReservationOptions value)
        : IOptionsMonitor<OrderReservationOptions>
    {
        public OrderReservationOptions CurrentValue => value;
        public OrderReservationOptions Get(string? name) => value;
        public IDisposable? OnChange(Action<OrderReservationOptions, string?> listener) => null;
    }
}
