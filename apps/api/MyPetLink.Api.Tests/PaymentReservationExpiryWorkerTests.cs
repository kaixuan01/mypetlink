using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;
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
        var time = new FakeTimeProvider();
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
            NullLogger<PaymentReservationExpiryWorker>.Instance,
            time);

        await worker.StartAsync(default);
        // Several intervals of virtual time, in no real time at all.
        for (var i = 0; i < 4; i++)
        {
            time.Advance(TimeSpan.FromSeconds(5));
            await Task.Yield();
        }

        await worker.StopAsync(default);

        Assert.Equal(0, fake.Calls);
    }

    [Fact]
    public async Task FailedCycle_RetriesWithoutStoppingHost_AndKeepsBatchSize()
    {
        var time = new FakeTimeProvider();
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
            NullLogger<PaymentReservationExpiryWorker>.Instance,
            time);

        await worker.StartAsync(default);

        // The first cycle runs immediately and throws.
        await fake.FirstCall.Task.WaitAsync(Guard);

        // Then the worker logs, and schedules its retry a poll interval later.
        // Advancing repeatedly rather than once is deliberate: a single
        // Advance can land before the worker has registered its timer, and
        // that tick would simply be lost. Each pass is free in wall-clock
        // terms, and Guard only exists so a genuinely stuck worker fails the
        // test instead of hanging the suite - the assertion below never
        // depends on how fast the machine is.
        await AdvanceUntil(time, fake.SecondCall.Task);

        await worker.StopAsync(default);

        Assert.True(fake.SecondCall.Task.IsCompletedSuccessfully);
        Assert.Equal(2, fake.Calls);
        Assert.All(fake.BatchSizes, size => Assert.Equal(11, size));
    }

    /// <summary>
    /// A stuck-worker backstop, not a timing assumption. Nothing in these
    /// tests waits this long when the worker behaves.
    /// </summary>
    private static readonly TimeSpan Guard = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Move virtual time forward until <paramref name="signal"/> completes,
    /// so the test never races the worker to its own timer.
    /// </summary>
    private static async Task AdvanceUntil(FakeTimeProvider time, Task signal)
    {
        using var backstop = new CancellationTokenSource(Guard);

        while (!signal.IsCompleted)
        {
            backstop.Token.ThrowIfCancellationRequested();
            time.Advance(TimeSpan.FromSeconds(5));
            await Task.Yield();
        }

        await signal;
    }

    private static IServiceCollection Services(FakeExpiryService fake) => new ServiceCollection()
        .AddSingleton<IPaymentReservationExpiryService>(fake);

    private sealed class FakeExpiryService : IPaymentReservationExpiryService
    {
        private readonly bool _failFirst;
        public FakeExpiryService(bool failFirst = false) => _failFirst = failFirst;
        public int Calls { get; private set; }
        public List<int> BatchSizes { get; } = [];
        public TaskCompletionSource FirstCall { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource SecondCall { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<int> ExpireDueOrdersAsync(int batchSize, CancellationToken cancellationToken = default)
        {
            Calls++;
            BatchSizes.Add(batchSize);
            // Signalled before the throw: the test waits on this to know the
            // failing cycle is done and the retry timer is about to be set.
            if (Calls == 1) FirstCall.TrySetResult();
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
