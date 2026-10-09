using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Regression tests for the second audit: chip identity (F1, F2), immutable
/// shipment manifests (F3) and the merchant quotation stock race (F4), all on
/// SQL Server through the real services.
/// </summary>
public sealed partial class PhysicalQaReleaseGateRelationalTests
{
    // --- F1: a missing chip ID must never pass once a chip is bound ------------------

    [RelationalFact]
    public async Task F1_AfterAnotherChipIsSeenAPassWithoutAChipIdIsRefused()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 1);
        await EnrollAsync(scope, [Code(0)]);

        // The exact audit sequence: pass on chip A, Needs Review on chip B, then
        // a pass whose NFC reading carries no chip ID.
        await PassAsync(scope, Code(0), serial: "04:A1:B2:C3:D4:E5:F6");
        await InspectAsync(scope, Code(0), PhysicalQaStatus.NeedsReview, PhysicalTagCondition.NeedsReview, "04:0B:0B:0B:0B:0B:0B", "Second package, different chip");
        foreach (var missing in new string?[] { null, "", "   " })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() =>
                InspectAsync(scope, Code(0), PhysicalQaStatus.Passed, PhysicalTagCondition.Good, missing, "Recheck"));
            Assert.Equal("physical_qa_chip_id_missing", refused.Code);
        }
        // The chip seen during the review cannot pass either.
        Assert.Equal("physical_qa_chip_mismatch", (await Assert.ThrowsAsync<ApiException>(() =>
            InspectAsync(scope, Code(0), PhysicalQaStatus.Passed, PhysicalTagCondition.Good, "04:0B:0B:0B:0B:0B:0B", "Recheck"))).Code);

        await using (var check = scope.NewContext())
        {
            var tag = await check.SmartTags.SingleAsync();
            Assert.Equal(PhysicalQaStatus.NeedsReview, tag.QaStatus);
            Assert.Equal("04A1B2C3D4E5F6", tag.QaNfcSerialNumber);
        }

        // The chip that passed originally, in any reader formatting, passes again.
        await InspectAsync(scope, Code(0), PhysicalQaStatus.Passed, PhysicalTagCondition.Good, " 04-a1-b2-c3-d4-e5-f6 ", "Original package confirmed");
        await using (var check = scope.NewContext())
        {
            Assert.Equal(PhysicalQaStatus.Passed, (await check.SmartTags.SingleAsync()).QaStatus);
            var observed = await check.AuditLogs.Where(a => a.Action == "tag-inventory.qa-inspected").Select(a => a.NewValue!).ToListAsync();
            Assert.Contains(observed, value => value.Contains("040B0B0B0B0B0B"));
        }
    }

    [RelationalFact]
    public async Task F1_AFirstPassNeedsAChipIdAndTheReviewPathStaysOpen()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 1);
        await EnrollAsync(scope, [Code(0)]);

        Assert.Equal("physical_qa_chip_id_missing", (await Assert.ThrowsAsync<ApiException>(() =>
            InspectAsync(scope, Code(0), PhysicalQaStatus.Passed, PhysicalTagCondition.Good, null, null))).Code);
        // A value that is not a chip ID is treated as no chip ID.
        Assert.Equal("physical_qa_chip_id_missing", (await Assert.ThrowsAsync<ApiException>(() =>
            InspectAsync(scope, Code(0), PhysicalQaStatus.Passed, PhysicalTagCondition.Good, "chip-A", null))).Code);
        await InspectAsync(scope, Code(0), PhysicalQaStatus.NeedsReview, PhysicalTagCondition.NeedsReview, null, "Phone reported no chip ID");

        await using var check = scope.NewContext();
        var tag = await check.SmartTags.SingleAsync();
        Assert.Equal(PhysicalQaStatus.NeedsReview, tag.QaStatus);
        Assert.Null(tag.QaNfcSerialNumber);
    }

    // --- F2: one chip, one tag code ----------------------------------------------------

    [RelationalFact]
    public async Task F2_OneChipCannotPassForTwoTagCodes()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId;
        await using (var seed = scope.NewContext()) variantId = await SeedRetailAsync(seed, tags: 2);
        await EnrollAsync(scope, [Code(0), Code(1)]);
        await PassAsync(scope, Code(0), serial: "04:AA:BB:CC:DD:EE:FF");

        var conflict = await Assert.ThrowsAsync<ApiException>(() => PassAsync(scope, Code(1), serial: "04aabbccddeeff"));
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal("physical_qa_chip_in_use", conflict.Code);
        Assert.Contains(Code(0), conflict.Message);

        await using var check = scope.NewContext();
        Assert.Equal(PhysicalQaStatus.Pending, (await check.SmartTags.SingleAsync(t => t.TagCode == Code(1))).QaStatus);
        Assert.Equal(1, await check.SmartTags.CountAsync(t => t.QaNfcSerialNumber == "04AABBCCDDEEFF"));
        Assert.Equal(1, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(variantId));
    }

    [RelationalFact]
    public async Task F2_ConcurrentPassesOfOneChipOnTwoSkusBindItExactlyOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext())
        {
            await SeedRetailAsync(seed, tags: 1);
            // A second SKU takes a different stock lock, so only the database can stop the race.
            var product = await seed.TagProducts.FirstAsync();
            var other = new TagProductVariant
            {
                TagProduct = product, PublicKey = "QAGATEVARIANT002", Sku = "MPL-QA-GATE-LW", DisplayName = "Lightweight",
                SupportsQr = true, SupportsNfc = true, TagVariant = "Lightweight", BasePrice = 39.90m, Currency = "MYR", IsActive = true,
            };
            seed.AddRange(other, new SmartTag { TagCode = Code(1), ProductVariant = other, HasNfc = true, Status = SmartTagStatus.Unclaimed });
            await seed.SaveChangesAsync();
        }
        await EnrollAsync(scope, [Code(0), Code(1)]);

        var results = await Task.WhenAll(new[] { Code(0), Code(1) }.Select(async code =>
        {
            try { await PassAsync(scope, code, serial: "04:11:22:33:44:55:66"); return "passed"; }
            catch (ApiException e) { return e.Code; }
        }));

        Assert.Single(results, r => r == "passed");
        Assert.Single(results, r => r == "physical_qa_chip_in_use");
        await using var check = scope.NewContext();
        Assert.Equal(1, await check.SmartTags.CountAsync(t => t.QaStatus == PhysicalQaStatus.Passed));
        Assert.Equal(1, await check.SmartTags.CountAsync(t => t.QaNfcSerialNumber == "04112233445566"));
    }

    // --- F3: a shipment reference names exactly one manifest -------------------------

    [RelationalFact]
    public async Task F3_A900CodeShipmentCannotGrowTo901UnderTheSameReference()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 901);
        var manifest = Enumerable.Range(0, 900).Select(Code).ToArray();
        await EnrollAsync(scope, manifest, shipment: "SHIP-900");

        // Identical membership, retried and reordered, is idempotent.
        await EnrollAsync(scope, manifest, shipment: "SHIP-900");
        await EnrollAsync(scope, manifest.Reverse().Select(c => c.ToLowerInvariant()).ToArray(), shipment: " SHIP-900 ");

        // One code replaced: refused, nothing changes.
        var replaced = manifest.Skip(1).Append(Code(900)).ToArray();
        await using (var db = scope.NewContext())
        {
            var preview = await QaService(db).PreviewAsync(new PhysicalQaCohortRequest("SHIP-900", replaced, 900), default);
            Assert.Contains(preview.Problems, p => p.Contains("different manifest"));
            var conflict = await Assert.ThrowsAsync<ApiException>(() =>
                QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-900", replaced, 900, true), default));
            Assert.Equal((409, "physical_qa_shipment_conflict"), (conflict.StatusCode, conflict.Code));
        }

        await using var check = scope.NewContext();
        Assert.Equal(900, await check.SmartTags.CountAsync(t => t.QaShipmentReference == "SHIP-900"));
        Assert.Null((await check.SmartTags.SingleAsync(t => t.TagCode == Code(900))).QaStatus);
        Assert.Equal(900, (await QaService(check).SummaryAsync(new PhysicalQaQuery { Shipment = "SHIP-900" }, default)).TotalExpected);
        Assert.Equal(900, await check.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-enrolled"));
    }

    [RelationalFact]
    public async Task F3_ADifferentExpectedCountOrASubsetIsAlsoADifferentManifest()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 4);
        await EnrollAsync(scope, [Code(0), Code(1), Code(2)], shipment: "SHIP-A");

        await using var db = scope.NewContext();
        Assert.Equal("physical_qa_shipment_conflict", (await Assert.ThrowsAsync<ApiException>(() =>
            QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-A", [Code(0), Code(1)], 2), default))).Code);
        Assert.Equal("physical_qa_shipment_conflict", (await Assert.ThrowsAsync<ApiException>(() =>
            QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-A", [Code(0), Code(1), Code(2), Code(3)], 4), default))).Code);
        Assert.Equal(3, await db.SmartTags.CountAsync(t => t.QaShipmentReference == "SHIP-A"));
    }

    [RelationalFact]
    public async Task F3_ConcurrentConflictingManifestsLeaveExactlyOneShipment()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext()) await SeedRetailAsync(seed, tags: 12);
        string[] first = Enumerable.Range(0, 6).Select(Code).ToArray();
        string[] second = Enumerable.Range(6, 6).Select(Code).ToArray();

        var results = await Task.WhenAll(new[] { first, first, second, second }.Select(async codes =>
        {
            await using var db = scope.NewContext();
            try { await QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-RACE", codes, 6), default); return "ok"; }
            catch (ApiException e) { return e.Code; }
        }));

        await using var check = scope.NewContext();
        var enrolled = await check.SmartTags.Where(t => t.QaShipmentReference == "SHIP-RACE").Select(t => t.TagCode).ToListAsync();
        Assert.Equal(6, enrolled.Count);
        var winner = enrolled.Order().SequenceEqual(first) ? first : second;
        Assert.Equal(winner.Order(), enrolled.Order());
        Assert.Equal(2, results.Count(r => r == "ok"));
        Assert.Equal(2, results.Count(r => r == "physical_qa_shipment_conflict"));
        Assert.Equal(6, await check.AuditLogs.CountAsync(a => a.Action == "tag-inventory.qa-enrolled"));
    }

    [RelationalFact]
    public async Task F3_ABlockedAttemptLeavesNothingAndACorrectedManifestCanUseTheReference()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid variantId, orderId;
        await using (var seed = scope.NewContext())
        {
            variantId = await SeedRetailAsync(seed, tags: 4);
            orderId = await SeedConfirmedOrderAsync(seed, variantId, "ORD-QA-F3");
        }
        await using (var db = scope.NewContext()) await Admin(db).AssignInventoryTagAsync(AdminId, orderId, await TagIdAsync(scope, Code(1)));

        await using (var db = scope.NewContext())
        {
            // Wrong count, then an unknown code: refused before anything is written.
            Assert.Equal("qa_cohort_blocked", (await Assert.ThrowsAsync<ApiException>(() =>
                QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-F3", [Code(0), Code(1)], 3, true), default))).Code);
            Assert.Equal("qa_cohort_blocked", (await Assert.ThrowsAsync<ApiException>(() =>
                QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("SHIP-F3", [Code(0), "MPL-ZZZZ-ZZZZ"], 2, true), default))).Code);
            Assert.False(await db.SmartTags.AnyAsync(t => t.QaStatus != null));
        }

        // The corrected manifest, with an existing customer order, enrolls.
        await EnrollAsync(scope, [Code(0), Code(1), Code(2)], acknowledge: true, shipment: "SHIP-F3");
        await EnrollAsync(scope, [Code(2), Code(0), Code(1)], acknowledge: true, shipment: "SHIP-F3");
        await using var check = scope.NewContext();
        Assert.Equal(3, await check.SmartTags.CountAsync(t => t.QaShipmentReference == "SHIP-F3"));
        Assert.Equal(orderId, (await check.SmartTags.SingleAsync(t => t.TagCode == Code(1))).OrderId);
    }

    [RelationalFact]
    public async Task F3_AReferenceAlreadyCarriedByOtherTagsCannotNameANewManifest()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var seed = scope.NewContext())
        {
            await SeedRetailAsync(seed, tags: 3);
            // Generated stock carries its batch number as its shipment reference.
            var tag = await seed.SmartTags.SingleAsync(t => t.TagCode == Code(2));
            tag.QaStatus = PhysicalQaStatus.Pending; tag.QaShipmentReference = "QA-B-0001"; tag.QaVersion = 1;
            await seed.SaveChangesAsync();
        }
        await using var db = scope.NewContext();
        Assert.Equal("physical_qa_shipment_conflict", (await Assert.ThrowsAsync<ApiException>(() =>
            QaService(db).EnrollAsync(AdminId, new PhysicalQaCohortRequest("QA-B-0001", [Code(0), Code(1)], 2), default))).Code);
        Assert.Equal(1, await db.SmartTags.CountAsync(t => t.QaShipmentReference == "QA-B-0001"));
    }

    // --- F4: quotation stock checks and QA withdrawals are serialized ------------------

    [RelationalFact]
    public async Task F4_ConversionWaitsForAQaWithdrawalInProgressAndThenRefuses()
    {
        var pause = new PauseInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var (quotationId, _) = await SeedQuotationAsync(scope, accepted: true);

        await using var qaDb = scope.NewContext();
        await using var salesDb = scope.NewContext();
        pause.ArmAfterStockLock(qaDb);
        var withdrawal = WithdrawOneAsync(qaDb);
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var conversion = Capture(() => Sales(salesDb).ConvertQuotationAsync(null, quotationId, null, default));
        await Task.Delay(1500);
        // The QA result holds the SKU lock, so the conversion must still be waiting.
        Assert.False(conversion.IsCompleted, "Conversion committed while a QA withdrawal was in progress.");
        pause.Release.SetResult();
        await withdrawal;

        var error = Assert.IsType<ApiException>((await conversion).Error);
        Assert.Equal("physical_qa_stock_unavailable", error.Code);
        await using var check = scope.NewContext();
        Assert.False(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == quotationId));
        Assert.Equal(MerchantQuotationStatus.Accepted, (await check.MerchantQuotations.SingleAsync(q => q.Id == quotationId)).Status);
    }

    [RelationalFact]
    public async Task F4_SendWaitsForAQaWithdrawalInProgressAndThenRefuses()
    {
        var pause = new PauseInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var (quotationId, _) = await SeedQuotationAsync(scope, accepted: false);

        await using var qaDb = scope.NewContext();
        await using var salesDb = scope.NewContext();
        pause.ArmAfterStockLock(qaDb);
        var withdrawal = WithdrawOneAsync(qaDb);
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var send = Capture(() => Sales(salesDb).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default));
        await Task.Delay(1500);
        Assert.False(send.IsCompleted, "Send went out while a QA withdrawal was in progress.");
        pause.Release.SetResult();
        await withdrawal;

        Assert.Equal("physical_qa_stock_unavailable", Assert.IsType<ApiException>((await send).Error).Code);
        await using var check = scope.NewContext();
        Assert.Equal(MerchantQuotationStatus.Draft, (await check.MerchantQuotations.SingleAsync(q => q.Id == quotationId)).Status);
    }

    [RelationalFact]
    public async Task F4_AQaWithdrawalWaitsForAConversionInProgress()
    {
        var pause = new PauseInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(pause, enableRetryOnFailure: true);
        var (quotationId, _) = await SeedQuotationAsync(scope, accepted: true);

        await using var salesDb = scope.NewContext();
        await using var qaDb = scope.NewContext();
        pause.ArmAfterStockCount(salesDb);
        var conversion = Capture(() => Sales(salesDb).ConvertQuotationAsync(null, quotationId, null, default));
        await pause.Reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        var withdrawal = WithdrawOneAsync(qaDb);
        await Task.Delay(1500);
        // Stock was counted under the lock; QA must wait for the order to commit.
        Assert.False(withdrawal.IsCompleted, "A QA withdrawal landed between the stock check and the order.");
        pause.Release.SetResult();

        Assert.Null((await conversion).Error);
        await withdrawal;
        await using var check = scope.NewContext();
        Assert.True(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == quotationId));
        Assert.Equal(1, await check.SmartTags.CountAsync(t => t.QaStatus == PhysicalQaStatus.Failed));
    }

    [RelationalFact]
    public async Task F4_HistoricalSkusOutsideQaStillConvertWithoutAStockCheck()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        Guid quotationId;
        await using (var db = scope.NewContext())
        {
            var variantId = await SeedSalesCatalogAsync(db);
            // No tags at all, none enrolled: the pre-QA behaviour is unchanged.
            quotationId = await CreateQuotationAsync(db, variantId, 5);
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default);
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Accepted, null, default);
            await Sales(db).ConvertQuotationAsync(null, quotationId, null, default);
        }
        await using var check = scope.NewContext();
        Assert.True(await check.MerchantOrders.AnyAsync(o => o.SourceQuotationId == quotationId));
    }

    // --- Helpers -----------------------------------------------------------------------

    private static async Task InspectAsync(RelationalScope scope, string code, PhysicalQaStatus decision,
        PhysicalTagCondition condition, string? serial, string? remarks)
    {
        await using var db = scope.NewContext();
        var qa = QaService(db);
        var item = await qa.LookupAsync(code, default);
        var qr = await qa.CaptureAsync(AdminId, new(code, item.Version, QaCaptureSource.Camera, $"{Site}/q/{code}", null), default);
        var nfc = await qa.CaptureAsync(AdminId, new(code, item.Version, QaCaptureSource.WebNfc, $"{Site}/n/{code}", serial), default);
        await qa.SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, decision, condition,
            qr.Evidence, nfc.Evidence, remarks), default);
    }

    private static async Task<(Guid QuotationId, Guid VariantId)> SeedQuotationAsync(RelationalScope scope, bool accepted)
    {
        await using var db = scope.NewContext();
        db.Users.Add(new User
        {
            Id = AdminId, Email = "qa.admin@example.com", NormalizedEmail = "QA.ADMIN@EXAMPLE.COM", DisplayName = "QA Admin",
            Status = UserStatus.Active, AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
        });
        var variantId = await SeedSalesCatalogAsync(db);
        for (var index = 0; index < 2; index++)
            db.SmartTags.Add(new SmartTag
            {
                TagCode = Code(index), ProductVariantId = variantId, HasNfc = true, Status = SmartTagStatus.Unclaimed,
                FulfilmentStatus = TagFulfilmentStatus.Printed, QaStatus = PhysicalQaStatus.Passed, QaShipmentReference = "QUOTE-SHIP", QaVersion = 1,
            });
        await db.SaveChangesAsync();
        var quotationId = await CreateQuotationAsync(db, variantId, 2);
        if (accepted)
        {
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Sent, null, default);
            await Sales(db).TransitionQuotationAsync(null, quotationId, MerchantQuotationStatus.Accepted, null, default);
        }
        return (quotationId, variantId);
    }

    private static async Task<Guid> CreateQuotationAsync(MyPetLinkDbContext db, Guid variantId, int quantity)
    {
        var sales = Sales(db);
        var merchant = await sales.CreateMerchantAsync(null, new UpsertMerchantRequest($"QA Race {Guid.NewGuid():N}"[..30], null, null, null, null,
            "Aina Rahman", "orders@example.com", "+60123456789",
            new MerchantAddressDto("12 Jalan Perdana", null, "68000", "Ampang", "Selangor", "Malaysia"), true, null, null, null), default);
        return (await sales.CreateQuotationAsync(null, new UpsertQuotationRequest(merchant.Id, null, null, 0m, 0m, null, null,
            [new UpsertQuotationItemRequest(variantId, quantity, 12.50m)]), default)).Id;
    }

    // A QA result withdrawing one of the two released tags.
    private static async Task WithdrawOneAsync(MyPetLinkDbContext db)
    {
        var qa = QaService(db);
        var item = await qa.LookupAsync(Code(0), default);
        await qa.SaveAsync(AdminId, item.Id, new SavePhysicalQaRequest(Guid.NewGuid(), item.Version, PhysicalQaStatus.Failed,
            PhysicalTagCondition.Damaged, null, null, "Cracked during recount"), default);
    }

    private static async Task<(T? Value, Exception? Error)> Capture<T>(Func<Task<T>> action)
    {
        try { return (await action(), null); }
        catch (Exception e) { return (default, e); }
    }

    /// <summary>
    /// Holds one chosen context at a precise point so a competing operation can
    /// be started deterministically: either just after it took the SKU stock
    /// lock and read the tag, or just after it counted released stock.
    /// </summary>
    private sealed class PauseInterceptor : DbCommandInterceptor
    {
        private DbContext? _target;
        private bool _afterLock;
        private bool _lockTaken;
        private int _fired;
        public TaskCompletionSource Reached { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void ArmAfterStockLock(DbContext target) { _target = target; _afterLock = true; }
        public void ArmAfterStockCount(DbContext target) { _target = target; _afterLock = false; }

        public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData, int result, CancellationToken cancellationToken = default)
        {
            if (eventData.Context == _target && command.CommandText.Contains("sp_getapplock")) _lockTaken = true;
            return ValueTask.FromResult(result);
        }

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData, DbDataReader result, CancellationToken cancellationToken = default)
        {
            await MaybePauseAsync(command, eventData);
            return result;
        }

        public override async ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData, object? result, CancellationToken cancellationToken = default)
        {
            await MaybePauseAsync(command, eventData);
            return result;
        }

        private async Task MaybePauseAsync(DbCommand command, CommandExecutedEventData eventData)
        {
            if (eventData.Context != _target || !command.CommandText.Contains("[SmartTags]")) return;
            var hit = _afterLock ? _lockTaken : command.CommandText.Contains("COUNT(");
            if (!hit || Interlocked.Exchange(ref _fired, 1) == 1) return;
            Reached.SetResult();
            await Release.Task;
        }
    }
}
