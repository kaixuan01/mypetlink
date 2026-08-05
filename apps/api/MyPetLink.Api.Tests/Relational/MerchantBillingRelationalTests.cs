using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Number allocation under real contention. The in-memory provider has no
/// locking, so the seeding race — two connections opening the same brand new
/// daily series at once — can only be demonstrated here.
/// </summary>
public sealed class MerchantBillingRelationalTests
{
    [RelationalFact]
    public async Task OpeningABrandNewInvoiceSeriesConcurrentlyDoesNotFail()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var issuedAt = new DateTimeOffset(2026, 8, 5, 2, 0, 0, TimeSpan.Zero);

        // Every worker starts at the same instant on a counter key that does
        // not exist yet, which is the only moment the row can be inserted twice.
        const int workers = 16;
        using var gate = new SemaphoreSlim(0, workers);
        var numbers = new string[workers];

        var running = Enumerable.Range(0, workers).Select(async index =>
        {
            await gate.WaitAsync();
            await using var db = scope.NewContext();
            numbers[index] = await new DocumentNumberService(db)
                .NextMerchantInvoiceNumberAsync(issuedAt, default);
        }).ToArray();

        gate.Release(workers);
        await Task.WhenAll(running);

        Assert.Equal(workers, numbers.Distinct().Count());
        Assert.All(numbers, number => Assert.StartsWith("MPL-INV-260805-", number));
        Assert.Contains("MPL-INV-260805-0001", numbers);
    }

    [RelationalFact]
    public async Task MerchantReceiptNumbersUseTheirOwnSeries()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var issuedAt = new DateTimeOffset(2026, 8, 5, 2, 0, 0, TimeSpan.Zero);

        const int workers = 16;
        using var gate = new SemaphoreSlim(0, workers);
        var numbers = new string[workers];

        var running = Enumerable.Range(0, workers).Select(async index =>
        {
            await gate.WaitAsync();
            await using var db = scope.NewContext();
            numbers[index] = await new DocumentNumberService(db)
                .NextMerchantReceiptNumberAsync(issuedAt, default);
        }).ToArray();

        gate.Release(workers);
        await Task.WhenAll(running);

        Assert.Equal(workers, numbers.Distinct().Count());
        Assert.All(numbers, number => Assert.StartsWith("MPL-RCP-B2B-260805-", number));
    }

    /// <summary>
    /// Invoice and receipt numbers must not share a counter: a receipt series
    /// that borrowed the invoice sequence would skip numbers an auditor counts.
    /// </summary>
    [RelationalFact]
    public async Task InvoiceAndReceiptSeriesAreCountedIndependently()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var issuedAt = new DateTimeOffset(2026, 8, 5, 2, 0, 0, TimeSpan.Zero);

        await using var db = scope.NewContext();
        var numbers = new DocumentNumberService(db);

        var invoice = await numbers.NextMerchantInvoiceNumberAsync(issuedAt, default);
        var receipt = await numbers.NextMerchantReceiptNumberAsync(issuedAt, default);
        var secondInvoice = await numbers.NextMerchantInvoiceNumberAsync(issuedAt, default);

        Assert.Equal("MPL-INV-260805-0001", invoice);
        Assert.Equal("MPL-RCP-B2B-260805-0001", receipt);
        Assert.Equal("MPL-INV-260805-0002", secondInvoice);
    }
}
