using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The third audit's F4 races, on SQL Server through the real services:
/// F4-A, a draft edit changing the quotation's SKUs around Send or Convert; and
/// F4-B, a lost SQL session or an ambiguous commit during Send or Convert.
/// </summary>
public sealed partial class PhysicalQaReleaseGateRelationalTests
{
    // --- F4-A: draft edits cannot change the SKUs a Send or Convert is protecting -------

    [RelationalFact]
    public async Task F4A_AnEditToAnotherSkuWaitsForSendAndSendNeverCommitsAgainstWithdrawnStock()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        var lockHeld = race.PauseAfterStockLock();
        var send = CaptureOutcome(() => Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default));
        await lockHeld.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        // Another admin moves the draft from SKU A to SKU B — without a concurrency token.
        var edit = EditToAsync(scope, seed, seed.SkuB);
        await Task.Delay(1500);
        Assert.False(edit.IsCompleted, "The draft changed while Send held its locks.");

        // QA withdraws SKU B stock while Send is between its stock check and its save.
        var counted = race.PauseAfterStockCount();
        lockHeld.Release.SetResult();
        await counted.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await WithdrawAsync(scope, seed.SkuBCodes[0]);
        counted.Release.SetResult();

        Assert.Null((await send).Error);
        Assert.Equal("quotation_not_editable", Assert.IsType<ApiException>((await edit).Error).Code);
        await using var check = scope.NewContext();
        var quotation = await check.MerchantQuotations.Include(q => q.Items).SingleAsync(q => q.Id == seed.QuotationId);
        Assert.Equal(MerchantQuotationStatus.Sent, quotation.Status);
        // What was sent is exactly what was validated: SKU A, whose stock is intact.
        Assert.All(quotation.Items, item => Assert.Equal(seed.SkuA, item.ProductVariantId));
    }

    [RelationalFact]
    public async Task F4A_AnEditAfterTheProtectedStockCheckWaitsUntilSendCommits()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        var counted = race.PauseAfterStockCount();
        var send = CaptureOutcome(() => Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default));
        await counted.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var edit = EditToAsync(scope, seed, seed.SkuB);
        await Task.Delay(1500);
        Assert.False(edit.IsCompleted, "The draft changed after Send's stock check and before its commit.");
        counted.Release.SetResult();

        Assert.Null((await send).Error);
        Assert.Equal("quotation_not_editable", Assert.IsType<ApiException>((await edit).Error).Code);
        await using var check = scope.NewContext();
        Assert.All(await check.MerchantQuotationItems.Where(i => i.QuotationId == seed.QuotationId).ToListAsync(),
            item => Assert.Equal(seed.SkuA, item.ProductVariantId));
    }

    [RelationalFact]
    public async Task F4A_AnEditDuringConvertWaitsAndTheOrderUsesTheValidatedLines()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        var lockHeld = race.PauseAfterStockLock();
        var convert = CaptureOutcome(() => Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default));
        await lockHeld.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var edit = EditToAsync(scope, seed, seed.SkuB);
        await Task.Delay(1500);
        Assert.False(edit.IsCompleted, "A quotation edit ran while Convert held its locks.");
        lockHeld.Release.SetResult();

        Assert.Null((await convert).Error);
        Assert.Equal("quotation_not_editable", Assert.IsType<ApiException>((await edit).Error).Code);
        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.Include(o => o.Items).SingleAsync(o => o.SourceQuotationId == seed.QuotationId);
        Assert.All(order.Items, item => Assert.Equal(seed.SkuA, item.ProductVariantId));
    }

    // --- F4-B: a lost session or an ambiguous commit ------------------------------------

    [RelationalTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task F4B_AConnectionLostAfterLockingRetriesFromScratchAndRefusesWithdrawnStock(bool convert)
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, convert ? MerchantQuotationStatus.Accepted : MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        // The commercial write is about to run: the session dies (taking its
        // locks with it), and QA withdraws stock before the operation retries.
        race.BeforeWrite(convert ? "INSERT INTO [MerchantOrders]" : "UPDATE [MerchantQuotations]", async command =>
        {
            await KillSessionAsync(command);
            await WithdrawAsync(scope, seed.SkuACodes[0]);
            throw new TimeoutException("Simulated transport failure after the locks were taken.");
        });

        var outcome = await CaptureOutcome(() => convert
            ? (Task)Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default)
            : Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default));

        Assert.Equal("physical_qa_stock_unavailable", Assert.IsType<ApiException>(outcome.Error).Code);
        // The retry took its locks again and counted stock again.
        Assert.True(race.StockLocks >= 2, $"Stock locks taken: {race.StockLocks}");
        Assert.True(race.StockCounts >= 2, $"Stock counts: {race.StockCounts}");
        await using var check = scope.NewContext();
        Assert.Equal(convert ? MerchantQuotationStatus.Accepted : MerchantQuotationStatus.Draft,
            (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status);
        Assert.False(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == seed.QuotationId));
    }

    [RelationalTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task F4B_AConnectionLostWithStockStillAvailableCommitsExactlyOnce(bool convert)
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, convert ? MerchantQuotationStatus.Accepted : MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        race.BeforeWrite(convert ? "INSERT INTO [MerchantOrders]" : "UPDATE [MerchantQuotations]", async command =>
        {
            await KillSessionAsync(command);
            throw new TimeoutException("Simulated transport failure after the locks were taken.");
        });

        var outcome = await CaptureOutcome(() => convert
            ? (Task)Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default)
            : Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default));

        Assert.Null(outcome.Error);
        await using var check = scope.NewContext();
        Assert.Equal(convert ? MerchantQuotationStatus.Converted : MerchantQuotationStatus.Sent,
            (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status);
        Assert.Equal(convert ? 1 : 0, await check.MerchantOrders.CountAsync(o => o.SourceQuotationId == seed.QuotationId));
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == (convert ? "merchant-order.created" : "quotation.sent")));
    }

    [RelationalTheory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task F4B_ACommitWhoseResponseIsLostIsReportedAsTheSuccessItWas(bool convert)
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, convert ? MerchantQuotationStatus.Accepted : MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        race.FailAfterNextCommit = true;

        var outcome = await CaptureOutcome(async () => convert
            ? (object)await Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default)
            : await Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default));

        Assert.Null(outcome.Error);
        if (convert) Assert.False(Assert.IsType<ConvertQuotationResult>(outcome.Value).AlreadyConverted);
        await using var check = scope.NewContext();
        Assert.Equal(convert ? MerchantQuotationStatus.Converted : MerchantQuotationStatus.Sent,
            (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status);
        Assert.Equal(convert ? 1 : 0, await check.MerchantOrders.CountAsync(o => o.SourceQuotationId == seed.QuotationId));
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == (convert ? "merchant-order.created" : "quotation.sent")));
    }

    // --- Normal behaviour, ordering, repetition and cancellation -------------------------

    [RelationalFact]
    public async Task F4_MultiSkuSendAndConcurrentQaResultsFinishWithoutDeadlockAndStayConsistent()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Draft, bothSkus: true);

        var send = CaptureOutcome(async () =>
        {
            await using var db = scope.NewContext();
            return await Sales(db).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default);
        });
        var withdrawals = Task.WhenAll(WithdrawAsync(scope, seed.SkuBCodes[0]), WithdrawAsync(scope, seed.SkuACodes[0]));
        var all = Task.WhenAll(send, withdrawals);
        Assert.Same(all, await Task.WhenAny(all, Task.Delay(TimeSpan.FromSeconds(45))));

        await using var check = scope.NewContext();
        var status = (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status;
        // Either Send counted both SKUs before the withdrawals, or it saw them and refused.
        if ((await send).Error is { } error) Assert.Equal("physical_qa_stock_unavailable", Assert.IsType<ApiException>(error).Code);
        else Assert.Equal(MerchantQuotationStatus.Sent, status);
    }

    [RelationalFact]
    public async Task F4_RepeatedSendAndConvertAreIdempotentAndHistoricalSkusAreUnchanged()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Draft);
        await using (var db = scope.NewContext())
        {
            await Sales(db).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default);
            await Sales(db).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default);
            await Sales(db).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Accepted, null, default);
            Assert.False((await Sales(db).ConvertQuotationAsync(null, seed.QuotationId, null, default)).AlreadyConverted);
        }
        await using (var db = scope.NewContext())
            Assert.True((await Sales(db).ConvertQuotationAsync(null, seed.QuotationId, null, default)).AlreadyConverted);
        await using var check = scope.NewContext();
        Assert.Equal(1, await check.MerchantOrders.CountAsync(o => o.SourceQuotationId == seed.QuotationId));
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == "quotation.sent"));
    }

    [RelationalFact]
    public async Task F4_ACancelledSendReleasesEverythingItHeld()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Draft);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        var lockHeld = race.PauseAfterStockLock();
        using var cancel = new CancellationTokenSource();
        var send = CaptureOutcome(() => Sales(salesDb).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, cancel.Token));
        await lockHeld.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));
        cancel.Cancel();
        lockHeld.Release.SetResult();
        Assert.IsAssignableFrom<OperationCanceledException>((await send).Error);

        // Nothing is left locked: QA and a fresh Send both proceed immediately.
        await WithdrawAsync(scope, seed.SkuBCodes[0]).WaitAsync(TimeSpan.FromSeconds(10));
        await using (var db = scope.NewContext())
            await Sales(db).TransitionQuotationAsync(null, seed.QuotationId, MerchantQuotationStatus.Sent, null, default).WaitAsync(TimeSpan.FromSeconds(10));
        await using var check = scope.NewContext();
        Assert.Equal(MerchantQuotationStatus.Sent, (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status);
    }

    // --- F4-B: an ambiguous Convert commit is attributed to the right order -----------

    [RelationalFact]
    public async Task F4B_ScenarioA_OwnCommitWithALostResponseReturnsItsOwnOrder()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        race.FailAfterNextCommit = true;
        var result = await Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default);

        Assert.False(result.AlreadyConverted);
        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.SingleAsync(o => o.SourceQuotationId == seed.QuotationId);
        Assert.Equal(order.Id, result.Order.Id);
        Assert.Equal(order.Id, (await check.AuditLogs.SingleAsync(a => a.Action == "merchant-order.created")).EntityId);
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == "quotation.converted"));
    }

    [RelationalFact]
    public async Task F4B_ScenarioB_AnotherRequestsOrderIsReturnedAsAlreadyConvertedNotAsOurs()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        // Request A's commit fails and rolls back; before A finds out what
        // happened, request B converts the same quotation.
        race.FailBeforeNextCommit = true;
        ConvertQuotationResult? requestB = null;
        race.OnVerification(async () =>
        {
            await using var other = scope.NewContext();
            requestB = await Sales(other).ConvertQuotationAsync(null, seed.QuotationId, null, default);
        });

        var requestA = await CaptureOutcome(() => Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default));

        Assert.Null(requestA.Error);
        var resultA = Assert.IsType<ConvertQuotationResult>(requestA.Value);
        Assert.NotNull(requestB);
        Assert.False(requestB!.AlreadyConverted);
        Assert.True(resultA.AlreadyConverted);
        Assert.Equal(requestB.Order.Id, resultA.Order.Id);
        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.SingleAsync(o => o.SourceQuotationId == seed.QuotationId);
        Assert.Equal(requestB.Order.Id, order.Id);
        var quotation = await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId);
        Assert.Equal((MerchantQuotationStatus.Converted, order.Id), (quotation.Status, quotation.ConvertedMerchantOrderId!.Value));
        // Only request B's records exist; nothing of A's rolled-back attempt.
        Assert.Equal(order.Id, (await check.AuditLogs.SingleAsync(a => a.Action == "merchant-order.created")).EntityId);
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == "quotation.converted"));
    }

    [RelationalFact]
    public async Task F4B_ScenarioC_ARolledBackCommitWithNoOtherOrderRetriesFromScratch()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        race.FailBeforeNextCommit = true;
        var result = await Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default);

        Assert.False(result.AlreadyConverted);
        Assert.True(race.StockLocks >= 2, $"Stock locks taken: {race.StockLocks}");
        Assert.True(race.StockCounts >= 2, $"Stock counts: {race.StockCounts}");
        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.SingleAsync(o => o.SourceQuotationId == seed.QuotationId);
        Assert.Equal(order.Id, result.Order.Id);
        Assert.Equal(order.Id, (await check.AuditLogs.SingleAsync(a => a.Action == "merchant-order.created")).EntityId);
    }

    [RelationalFact]
    public async Task F4B_ScenarioE_StockWithdrawnBeforeTheRetryIsRefused()
    {
        var race = new QuotationRaceInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(race, enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        await using var salesDb = scope.NewContext();
        race.Target = salesDb;
        race.FailBeforeNextCommit = true;
        race.OnVerification(() => WithdrawAsync(scope, seed.SkuACodes[0]));
        var outcome = await CaptureOutcome(() => Sales(salesDb).ConvertQuotationAsync(null, seed.QuotationId, null, default));

        Assert.Equal("physical_qa_stock_unavailable", Assert.IsType<ApiException>(outcome.Error).Code);
        await using var check = scope.NewContext();
        Assert.False(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == seed.QuotationId));
        Assert.Equal(MerchantQuotationStatus.Accepted, (await check.MerchantQuotations.SingleAsync(q => q.Id == seed.QuotationId)).Status);
        Assert.False(await check.AuditLogs.AnyAsync(a => a.Action == "merchant-order.created"));
    }

    [RelationalFact]
    public async Task F4B_ScenarioD_ConcurrentConvertsShareOneOrderAndReleaseTheirLocks()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var seed = await SeedTwoSkuQuotationAsync(scope, MerchantQuotationStatus.Accepted);

        var results = await Task.WhenAll(Enumerable.Range(0, 3).Select(async _ =>
        {
            await using var db = scope.NewContext();
            return await Sales(db).ConvertQuotationAsync(null, seed.QuotationId, null, default);
        }));

        Assert.Single(results, r => !r.AlreadyConverted);
        Assert.Equal(2, results.Count(r => r.AlreadyConverted));
        Assert.Single(results.Select(r => r.Order.Id).Distinct());
        await using var check = scope.NewContext();
        var order = await check.MerchantOrders.SingleAsync(o => o.SourceQuotationId == seed.QuotationId);
        Assert.Equal(order.Id, results[0].Order.Id);
        Assert.Equal(order.Id, (await check.AuditLogs.SingleAsync(a => a.Action == "merchant-order.created")).EntityId);
        Assert.Equal(1, await check.AuditLogs.CountAsync(a => a.Action == "quotation.converted"));
        // Every lock ended with its transaction: QA proceeds at once.
        await WithdrawAsync(scope, seed.SkuACodes[0]).WaitAsync(TimeSpan.FromSeconds(10));
    }

    // --- Helpers -----------------------------------------------------------------------

    private sealed record TwoSkuQuotation(Guid QuotationId, Guid MerchantId, Guid SkuA, Guid SkuB, string[] SkuACodes, string[] SkuBCodes);

    // Two SKUs with two released (Passed) tags each, and a quotation for two
    // units of SKU A (or of both SKUs), in the requested state.
    private static async Task<TwoSkuQuotation> SeedTwoSkuQuotationAsync(RelationalScope scope, MerchantQuotationStatus state, bool bothSkus = false)
    {
        await using var db = scope.NewContext();
        db.Users.Add(new User
        {
            Id = AdminId, Email = "qa.admin@example.com", NormalizedEmail = "QA.ADMIN@EXAMPLE.COM", DisplayName = "QA Admin",
            Status = UserStatus.Active, AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
        });
        var skuA = await SeedSalesCatalogAsync(db);
        var product = await db.TagProducts.SingleAsync();
        var variantB = new TagProductVariant
        {
            TagProduct = product, PublicKey = "QAWHOLESALE00002", Sku = "WS-QA-0002", DisplayName = "Standard",
            SupportsQr = true, SupportsNfc = true, TagVariant = "Standard", BasePrice = 19.90m, Currency = "MYR",
            IsActive = true, IsPurchasable = true,
        };
        db.Add(variantB);
        await db.SaveChangesAsync();
        string[] codesA = [Code(0), Code(1)], codesB = [Code(2), Code(3)];
        foreach (var (codes, variantId) in new[] { (codesA, skuA), (codesB, variantB.Id) })
            foreach (var code in codes)
                db.SmartTags.Add(new SmartTag
                {
                    TagCode = code, ProductVariantId = variantId, HasNfc = true, Status = SmartTagStatus.Unclaimed,
                    FulfilmentStatus = TagFulfilmentStatus.Printed, QaStatus = PhysicalQaStatus.Passed, QaShipmentReference = "QUOTE-SHIP", QaVersion = 1,
                });
        await db.SaveChangesAsync();

        var sales = Sales(db);
        var merchant = await sales.CreateMerchantAsync(null, MerchantFor(), default);
        UpsertQuotationItemRequest[] items = bothSkus
            ? [new(skuA, 2, 12.50m), new(variantB.Id, 2, 12.50m)]
            : [new(skuA, 2, 12.50m)];
        var quotationId = (await sales.CreateQuotationAsync(null,
            new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null, items), default)).Id;
        if (state is MerchantQuotationStatus.Accepted)
        {
            await sales.TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default);
            await sales.TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Accepted, null, default);
        }
        return new TwoSkuQuotation(quotationId, merchant.Id, skuA, variantB.Id, codesA, codesB);
    }

    private static UpsertMerchantRequest MerchantFor() =>
        new($"QA Lines {Guid.NewGuid():N}"[..30], null, null, null, null, "Aina Rahman", "orders@example.com", "+60123456789",
            new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"), true, null, null, null);

    // A draft edit with no concurrency token, in its own context.
    private static Task<(object? Value, Exception? Error)> EditToAsync(RelationalScope scope, TwoSkuQuotation seed, Guid variantId) =>
        CaptureOutcome(async () =>
        {
            await using var db = scope.NewContext();
            return (object)await Sales(db).UpdateQuotationAsync(null, seed.QuotationId,
                new UpsertQuotationRequest(seed.MerchantId, null, null, 0m, 0m, null, null, [new(variantId, 2, 12.50m)]), default);
        });

    private static async Task WithdrawAsync(RelationalScope scope, string code)
    {
        await using var db = scope.NewContext();
        var qa = QaService(db);
        var item = await qa.LookupAsync(code, default);
        await qa.SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, PhysicalQaStatus.Failed,
            PhysicalTagCondition.Damaged, null, null, "Cracked during recount"), default);
    }

    // Ends the SQL Server session behind this command, as a dropped connection
    // would: its transaction rolls back and its application locks are released.
    private static async Task KillSessionAsync(DbCommand command)
    {
        await using (var spid = command.Connection!.CreateCommand())
        {
            spid.Transaction = command.Transaction;
            spid.CommandText = "SELECT @@SPID";
            var session = Convert.ToInt32(await spid.ExecuteScalarAsync());
            await using var admin = new SqlConnection(command.Connection.ConnectionString);
            await admin.OpenAsync();
            await using var kill = admin.CreateCommand();
            kill.CommandText = $"KILL {session}";
            await kill.ExecuteNonQueryAsync();
        }
        await command.Connection.CloseAsync();
    }

    private static async Task<(object? Value, Exception? Error)> CaptureOutcome(Func<Task> action)
    {
        try { await action(); return (null, null); }
        catch (Exception e) { return (null, e); }
    }

    private static async Task<(object? Value, Exception? Error)> CaptureOutcome<T>(Func<Task<T>> action)
    {
        try { return (await action(), null); }
        catch (Exception e) { return (null, e); }
    }

    /// <summary>
    /// Scripted faults for one chosen context: pause after it takes a SKU stock
    /// lock or counts released stock, run an action just before a commercial
    /// write, or fail the client after a commit that did succeed.
    /// </summary>
    private sealed class QuotationRaceInterceptor : DbCommandInterceptor, IDbTransactionInterceptor
    {
        public DbContext? Target { get; set; }
        public int StockLocks;
        public int StockCounts;
        public bool FailAfterNextCommit { get; set; }
        public bool FailBeforeNextCommit { get; set; }
        private bool _commitFailed;
        private Func<Task>? _onVerification;
        private Gate? _afterStockLock;
        private Gate? _afterStockCount;
        private (string Text, Func<DbCommand, Task> Action)? _beforeWrite;

        public sealed class Gate
        {
            public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
            public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        }

        public Gate PauseAfterStockLock() => _afterStockLock = new Gate();
        public Gate PauseAfterStockCount() => _afterStockCount = new Gate();
        public void BeforeWrite(string text, Func<DbCommand, Task> action) => _beforeWrite = (text, action);
        // Runs once, when the failed commit's outcome is first looked up.
        public void OnVerification(Func<Task> action) => _onVerification = action;

        public override async ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context == Target && command.CommandText.Contains("sp_getapplock")
                && command.Parameters.Cast<DbParameter>().Any(p => p.Value is string s && s.Contains("TagOrderInventory")))
            {
                Interlocked.Increment(ref StockLocks);
                await PassAsync(Interlocked.Exchange(ref _afterStockLock, null));
            }
            return result;
        }

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context == Target && _beforeWrite is { } hook && command.CommandText.Contains(hook.Text))
            {
                _beforeWrite = null;
                await hook.Action(command);
            }
            if (eventData.Context == Target && _commitFailed && command.CommandText.Contains("FROM [MerchantOrders]"))
            {
                _commitFailed = false;
                if (Interlocked.Exchange(ref _onVerification, null) is { } verifying) await verifying();
            }
            return result;
        }

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
        {
            await CountedAsync(command, eventData);
            return result;
        }

        public override async ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData, object? result, CancellationToken cancellationToken = default)
        {
            await CountedAsync(command, eventData);
            return result;
        }

        // The commit never reaches the server: the attempt rolls back, but the
        // client cannot tell that from a commit whose response was lost.
        public ValueTask<InterceptionResult> TransactionCommittingAsync(DbTransaction transaction, TransactionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context == Target && FailBeforeNextCommit)
            {
                FailBeforeNextCommit = false;
                _commitFailed = true;
                throw new TimeoutException("Simulated failure while committing; the transaction rolls back.");
            }
            return ValueTask.FromResult(result);
        }

        public Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default)
        {
            if (eventData.Context == Target && FailAfterNextCommit)
            {
                FailAfterNextCommit = false;
                throw new TimeoutException("Simulated lost response after a successful commit.");
            }
            return Task.CompletedTask;
        }

        private async Task CountedAsync(DbCommand command, CommandExecutedEventData eventData)
        {
            if (eventData.Context != Target || !command.CommandText.Contains("[SmartTags]") || !command.CommandText.Contains("COUNT(")) return;
            Interlocked.Increment(ref StockCounts);
            await PassAsync(Interlocked.Exchange(ref _afterStockCount, null));
        }

        private static async Task PassAsync(Gate? gate)
        {
            if (gate is null) return;
            gate.Reached.SetResult();
            await gate.Release.Task;
        }
    }
}
