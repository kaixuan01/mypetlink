using System.Data.Common;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Stock receipts recorded exactly as an operator records the first commercial
/// shipment: SQL Server with the production retry strategy, a 300-tag
/// production batch generated before physical QA existed, RM3.1728 a tag and
/// no supplier details. Covers the amounts, duplicate and ambiguous
/// submissions, refusals that must write nothing, and the guarantee that a
/// receipt never changes physical QA or what is sellable.
/// </summary>
public sealed class InventoryReceiptProductionShapeRelationalTests
{
    private static readonly Guid AdminUserId = Guid.Parse("d1111111-1111-1111-1111-111111111111");
    private static readonly Guid VariantId = Guid.Parse("d3333333-3333-3333-3333-333333333333");
    private static readonly Guid BatchId = Guid.Parse("d4444444-4444-4444-4444-444444444444");
    private static readonly Guid OtherVariantId = Guid.Parse("d5555555-5555-5555-5555-555555555555");
    private static readonly Guid OtherBatchId = Guid.Parse("d6666666-6666-6666-6666-666666666666");
    private const string BatchNo = "MPL-BAT-260911002857-1515";
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-11T08:00:00Z");

    [RelationalFact]
    public async Task AThreeHundredTagReceiptAtRm3_1728WithNoSupplierIsRecorded()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);

        InventoryReceiptResponse created;
        await using (var db = scope.NewContext())
            created = await Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m));

        Assert.Equal((300, 951.84m, 3.1728m), (created.QuantityReceived, created.TotalLandedCostMyr, created.UnitLandedCostMyr));
        Assert.Equal((BatchNo, (string?)null, (string?)null), (created.BatchNumber, created.SupplierName, created.SupplierReference));
        await using var check = scope.NewContext();
        Assert.Equal(300, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == created.Id));
        Assert.Equal(1, await check.AuditLogs.CountAsync(entry => entry.Action == "inventory-receipt.create"));

        // What the screen reloads straight after a save.
        await using var reload = scope.NewContext();
        var (items, total) = await Service(reload).ListAsync(new InventoryReceiptQuery { Page = 1, PageSize = 50 });
        Assert.Equal(1, total);
        Assert.Equal(created.ReceiptNumber, Assert.Single(items).ReceiptNumber);
        var options = await Service(reload).GetOptionsAsync();
        Assert.Equal(0, options.Single(o => o.Id == VariantId).Batches.Single().UnreceivedEligibleQuantity);
    }

    [RelationalTheory]
    [InlineData(null, null, null, null)]
    [InlineData("", "", null, null)]
    [InlineData("   ", "  ", null, null)]
    [InlineData("  Tag Maker Sdn Bhd ", " PO-2026-0911 ", "Tag Maker Sdn Bhd", "PO-2026-0911")]
    public async Task SupplierDetailsAreOptionalAndStoredTrimmed(string? supplier, string? reference, string? storedSupplier, string? storedReference)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 5);

        await using (var db = scope.NewContext())
            await Service(db).CreateAsync(AdminUserId, Request(5, 3.1728m) with { SupplierName = supplier, SupplierReference = reference });

        await using var check = scope.NewContext();
        var stored = await check.InventoryReceipts.SingleAsync();
        Assert.Equal((storedSupplier, storedReference), (stored.SupplierName, stored.SupplierReference));
    }

    [RelationalTheory]
    [InlineData(300, "3.1728", "951.84", "3.1728")]
    [InlineData(300, "3.17285", "951.86", "3.172867")]
    [InlineData(3, "0.333333", "1.00", "0.333333")]
    [InlineData(7, "2.005", "14.04", "2.005714")]
    public async Task AmountsAreRoundedOnceAndStoredAtTheirColumnPrecision(int quantity, string unit, string total, string storedUnit)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, quantity);

        await using (var db = scope.NewContext())
            await Service(db).CreateAsync(AdminUserId, Request(quantity, decimal.Parse(unit)));

        // Read back from the database, not the response: the column precision
        // is what accounting reads.
        await using var check = scope.NewContext();
        var stored = await check.InventoryReceipts.SingleAsync();
        Assert.Equal((decimal.Parse(total), decimal.Parse(storedUnit)), (stored.TotalLandedCostMyr, stored.UnitLandedCostMyr));
        Assert.Equal((0m, 0m, 0m, 0m), (stored.GoodsCost, stored.FreightCost, stored.CustomsTaxCost, stored.OtherLandedCost));
    }

    [RelationalFact]
    public async Task SavingTheSameBatchAgainIsRefusedAndNothingIsCountedTwice()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);
        await using (var db = scope.NewContext())
            await Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m));

        // The operator saw an error and pressed Save again.
        ApiException repeat;
        await using (var db = scope.NewContext())
            repeat = await Assert.ThrowsAsync<ApiException>(() => Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m)));

        Assert.Equal((409, "receipt_inventory_shortfall"), (repeat.StatusCode, repeat.Code));
        Assert.Contains($"Only 0 tag(s) in batch {BatchNo} are still without a stock receipt", repeat.Message);
        await AssertOneReceiptOwnsTheBatchAsync(scope);
    }

    [RelationalFact]
    public async Task DuplicateSubmissionsRacingEachOtherRecordExactlyOneReceipt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 3).Select(async _ =>
        {
            await using var db = scope.NewContext();
            try { return (await Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m))).ReceiptNumber; }
            catch (ApiException failure) { return failure.Code; }
        }));

        Assert.Single(outcomes, outcome => outcome.StartsWith("MPL-STK-", StringComparison.Ordinal));
        Assert.Equal(2, outcomes.Count(outcome => outcome == "receipt_inventory_shortfall"));
        await AssertOneReceiptOwnsTheBatchAsync(scope);
    }

    [RelationalTheory]
    [InlineData("zero-quantity", 400, "validation_failed")]
    [InlineData("more-than-the-batch", 409, "receipt_inventory_shortfall")]
    [InlineData("batch-of-another-sku", 400, "validation_failed")]
    [InlineData("unknown-batch", 400, "validation_failed")]
    [InlineData("no-unit-cost", 400, "validation_failed")]
    public async Task InvalidReceiptsAreRefusedAndWriteNothing(string invalid, int status, string code)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);
        var request = invalid switch
        {
            "zero-quantity" => Request(0, 3.1728m),
            "more-than-the-batch" => Request(301, 3.1728m),
            "batch-of-another-sku" => Request(300, 3.1728m) with { SmartTagBatchId = OtherBatchId },
            "unknown-batch" => Request(300, 3.1728m) with { SmartTagBatchId = Guid.NewGuid() },
            "no-unit-cost" => Request(300, 0m),
            _ => throw new ArgumentOutOfRangeException(nameof(invalid)),
        };

        ApiException failure;
        await using (var db = scope.NewContext())
            failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).CreateAsync(AdminUserId, request));

        Assert.Equal((status, code), (failure.StatusCode, failure.Code));
        await using var check = scope.NewContext();
        Assert.False(await check.InventoryReceipts.AnyAsync());
        Assert.False(await check.SmartTags.AnyAsync(tag => tag.InventoryReceiptId != null));
        Assert.False(await check.AuditLogs.AnyAsync(entry => entry.Action == "inventory-receipt.create"));
    }

    [RelationalFact]
    public async Task ATagChangedWhileTheReceiptIsSavingIsAClearConflictAndNothingIsRecorded()
    {
        var interference = new ChangeATagBeforeTheUpdate("MPL-PWLW-0000");
        await using var scope = await RelationalDatabase.CreateAsync(interference, enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);

        ApiException failure;
        await using (var db = scope.NewContext())
        {
            interference.Target = db;
            failure = await Assert.ThrowsAsync<ApiException>(() => Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m)));
        }

        Assert.True(interference.Fired);
        Assert.Equal((409, "receipt_inventory_changed"), (failure.StatusCode, failure.Code));
        Assert.Contains("Nothing was recorded", failure.Message);
        await using var check = scope.NewContext();
        Assert.False(await check.InventoryReceipts.AnyAsync());
        Assert.False(await check.SmartTags.AnyAsync(tag => tag.InventoryReceiptId != null));
    }

    [RelationalFact]
    public async Task AReceiptNeverChangesPhysicalQaFulfilmentOrWhatIsSellable()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext())
        {
            await SeedAsync(setup, 300);
            // The shapes the shipment can be in when it is received: never
            // inspected, enrolled and waiting, passed, failed, and printed.
            var tags = await setup.SmartTags.Where(tag => tag.BatchId == BatchId).OrderBy(tag => tag.TagCode).ToListAsync();
            for (var index = 0; index < tags.Count; index++)
            {
                var (qa, fulfilment) = (index % 5) switch
                {
                    0 => ((PhysicalQaStatus?)null, TagFulfilmentStatus.Generated),
                    1 => (PhysicalQaStatus.Pending, TagFulfilmentStatus.Generated),
                    2 => (PhysicalQaStatus.Passed, TagFulfilmentStatus.Printed),
                    3 => (PhysicalQaStatus.Failed, TagFulfilmentStatus.Printed),
                    _ => ((PhysicalQaStatus?)null, TagFulfilmentStatus.Printed),
                };
                tags[index].QaStatus = qa;
                tags[index].QaShipmentReference = qa is null ? null : BatchNo;
                tags[index].QaVersion = qa is null ? 0 : 1;
                tags[index].FulfilmentStatus = fulfilment;
            }
            await setup.SaveChangesAsync();
        }
        var before = await StateAsync(scope);
        int sellableBefore;
        await using (var db = scope.NewContext())
            sellableBefore = await new TagOrderInventoryAvailabilityService(db).GetAvailableUnitsAsync(VariantId);

        await using (var db = scope.NewContext())
            await Service(db).CreateAsync(AdminUserId, Request(300, 3.1728m));

        Assert.Equal(before, await StateAsync(scope));
        await using var check = scope.NewContext();
        Assert.Equal(sellableBefore, await new TagOrderInventoryAvailabilityService(check).GetAvailableUnitsAsync(VariantId));
        Assert.Equal(300, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId != null));
    }

    [RelationalFact]
    public async Task TheBrowsersExactRequestIsRecordedOverHttpAndARepeatIsExplained()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using (var setup = scope.NewContext()) await SeedAsync(setup, 300);
        string connectionString;
        await using (var db = scope.NewContext()) connectionString = db.Database.GetConnectionString()!;
        await using var factory = new ReceiptApiFactory(connectionString);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.Header, AdminUserId.ToString());
        // The built-in roles exist once the API has started.
        await using (var setup = scope.NewContext())
        {
            var admin = await setup.AdminUsers.SingleAsync(row => row.UserId == AdminUserId);
            setup.AdminUserRoles.Add(new AdminUserRoleAssignment
            {
                AdminUserId = admin.Id,
                AdminRoleId = (await setup.AdminRoles.SingleAsync(role => role.Code == AdminRoleTemplates.SuperAdminCode)).Id,
            });
            await setup.SaveChangesAsync();
        }

        // Byte for byte what AdminInventoryCostingPanel sends: undefined fields
        // are dropped by JSON.stringify, and the date is midnight UTC.
        var body = $$"""
            {"productVariantId":"{{VariantId}}","smartTagBatchId":"{{BatchId}}","quantityReceived":300,"receivedAt":"2026-10-11T00:00:00Z","purchaseCurrency":"MYR","exchangeRateToMyr":1,"costMode":"Simple","unitLandedCostMyr":3.1728}
            """;
        Task<HttpResponseMessage> PostAsync() => client.PostAsync("/api/v1/admin/tag-inventory/receipts",
            new StringContent(body, Encoding.UTF8, "application/json"));

        using (var created = await PostAsync())
        {
            Assert.True(HttpStatusCode.Created == created.StatusCode,
                $"{created.StatusCode}: {await created.Content.ReadAsStringAsync()} | {string.Join(" | ", factory.Errors)}");
            using var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var data = json.RootElement.GetProperty("data");
            Assert.StartsWith("MPL-STK-", data.GetProperty("receiptNumber").GetString());
            Assert.Equal(951.84m, data.GetProperty("totalLandedCostMyr").GetDecimal());
            Assert.Equal(3.1728m, data.GetProperty("unitLandedCostMyr").GetDecimal());
            Assert.Equal(DateTimeOffset.Parse("2026-10-11T00:00:00Z"), data.GetProperty("receivedAt").GetDateTimeOffset());
        }

        using (var repeat = await PostAsync())
        {
            Assert.Equal(HttpStatusCode.Conflict, repeat.StatusCode);
            using var json = JsonDocument.Parse(await repeat.Content.ReadAsStringAsync());
            var error = json.RootElement.GetProperty("error");
            Assert.Equal("receipt_inventory_shortfall", error.GetProperty("code").GetString());
            Assert.Contains("already received", error.GetProperty("message").GetString());
        }

        // Field validation now answers with a 400 the screen can show,
        // instead of failing the whole request.
        using (var invalid = await client.PostAsync("/api/v1/admin/tag-inventory/receipts",
                   new StringContent(body.Replace("\"quantityReceived\":300", "\"quantityReceived\":0"), Encoding.UTF8, "application/json")))
        {
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
            var text = await invalid.Content.ReadAsStringAsync();
            Assert.Contains("Enter a quantity from 1 to 100,000.", text);
        }

        await AssertOneReceiptOwnsTheBatchAsync(scope);
    }

    // --- Helpers -------------------------------------------------------------

    private static async Task AssertOneReceiptOwnsTheBatchAsync(RelationalScope scope)
    {
        await using var check = scope.NewContext();
        var receipt = await check.InventoryReceipts.SingleAsync();
        Assert.Equal((300, 951.84m), (receipt.QuantityReceived, receipt.TotalLandedCostMyr));
        Assert.Equal(300, await check.SmartTags.CountAsync(tag => tag.InventoryReceiptId == receipt.Id));
        Assert.Equal(951.84m, await check.InventoryReceipts.Where(InventoryReceiptRules.IsActive).SumAsync(row => row.TotalLandedCostMyr));
        Assert.Equal(1, await check.AuditLogs.CountAsync(entry => entry.Action == "inventory-receipt.create"));
    }

    private static async Task<List<string>> StateAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        return await db.SmartTags.AsNoTracking().OrderBy(tag => tag.TagCode)
            .Select(tag => tag.TagCode + "|" + tag.Status + "|" + tag.FulfilmentStatus + "|" + tag.QaStatus + "|"
                + tag.QaVersion + "|" + tag.QaShipmentReference + "|" + tag.OwnerUserId + "|" + tag.OrderId + "|" + tag.PrintedAt)
            .ToListAsync();
    }

    private static CreateInventoryReceiptRequest Request(int quantity, decimal unitCost) =>
        new(VariantId, BatchId, quantity, DateTimeOffset.Parse("2026-10-11T00:00:00Z"), null, null, null, "MYR", 1m,
            InventoryReceiptCostMode.Simple, unitCost, null, null, null, null, null, null);

    private static InventoryReceiptService Service(MyPetLinkDbContext db) => new(
        db,
        new AuditLogService(db, new HttpContextAccessor()),
        new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
        new FixedTimeProvider(Now));

    private static async Task SeedAsync(MyPetLinkDbContext db, int tagCount)
    {
        db.Users.Add(new User
        {
            Id = AdminUserId, Email = "receipts@example.com", NormalizedEmail = "RECEIPTS@EXAMPLE.COM",
            DisplayName = "Receipts Admin", Status = UserStatus.Active,
            AdminUser = new AdminUser { UserId = AdminUserId, Role = AdminRole.Admin, IsActive = true },
        });
        var product = new TagProduct { Name = "MyPetLink Pawsome Pet Tag", Slug = "pawsome", IsPublished = true };
        var variant = new TagProductVariant
        {
            Id = VariantId, TagProduct = product, Sku = "PAWSOME-LW-QR-NFC", PublicKey = "PAWSOMELWVARIANT",
            DisplayName = "Lightweight", SupportsQr = true, SupportsNfc = true, TagVariant = "Lightweight",
            BasePrice = 39.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
        };
        var other = new TagProductVariant
        {
            Id = OtherVariantId, TagProduct = product, Sku = "PAWSOME-SD-QR-NFC", PublicKey = "PAWSOMESDVARIANT",
            DisplayName = "Standard", SupportsQr = true, SupportsNfc = true, TagVariant = "Standard",
            BasePrice = 39.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
        };
        var batch = new SmartTagBatch
        {
            Id = BatchId, BatchNo = BatchNo, Quantity = tagCount, HasNfc = true,
            Variant = "Lightweight", ProductVariant = variant, GeneratedAt = Now.AddDays(-30),
        };
        var otherBatch = new SmartTagBatch
        {
            Id = OtherBatchId, BatchNo = "MPL-BAT-260911002959-6486", Quantity = 1, HasNfc = true,
            Variant = "Standard", ProductVariant = other, GeneratedAt = Now.AddDays(-30),
        };
        db.TagProducts.Add(product);
        db.SmartTagBatches.AddRange(batch, otherBatch);
        for (var index = 0; index < tagCount; index++)
            db.SmartTags.Add(new SmartTag
            {
                TagCode = $"MPL-PWLW-{index:0000}", ProductVariant = variant, Batch = batch, HasNfc = true,
                Variant = "Lightweight", Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Generated,
            });
        db.SmartTags.Add(new SmartTag
        {
            TagCode = "MPL-PWSD-0000", ProductVariant = other, Batch = otherBatch, HasNfc = true,
            Variant = "Standard", Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Generated,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Changes one tag from another connection just before the receipt's
    /// update reaches it, as a concurrent assignment or QA result would.
    /// </summary>
    private sealed class ChangeATagBeforeTheUpdate(string tagCode) : DbCommandInterceptor
    {
        public DbContext? Target { get; set; }
        public bool Fired { get; private set; }

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            await InterfereAsync(command, eventData);
            return result;
        }

        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            await InterfereAsync(command, eventData);
            return result;
        }

        private async Task InterfereAsync(DbCommand command, CommandEventData eventData)
        {
            if (Fired || eventData.Context != Target || !command.CommandText.Contains("UPDATE [SmartTags]")) return;
            Fired = true;
            await using var other = new SqlConnection(command.Connection!.ConnectionString);
            await other.OpenAsync();
            await using var touch = other.CreateCommand();
            touch.CommandText = "UPDATE dbo.SmartTags SET UpdatedAt = SYSDATETIMEOFFSET() WHERE TagCode = @code";
            touch.Parameters.Add(new SqlParameter("@code", tagCode));
            await touch.ExecuteNonQueryAsync();
        }
    }

    private sealed class ReceiptApiFactory(string connectionString) : WebApplicationFactory<Program>
    {
        // Errors the API logged, so a failing request explains itself.
        public List<string> Errors { get; } = [];

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureLogging(logging => logging.AddProvider(new CapturingLoggerProvider(Errors)));
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:MyPetLinkDb"] = connectionString,
                    ["Jwt:Issuer"] = "MyPetLink.Receipts.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Receipts.Client",
                    ["Jwt:SigningKey"] = "inventory-receipt-http-test-signing-key-long-enough",
                    ["DevAuth:Enabled"] = "false",
                }));
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                    {
                        options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                        options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                        options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                    })
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            });
        }
    }

    private sealed class CapturingLoggerProvider(List<string> errors) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName) => new CapturingLogger(errors);
        public void Dispose() { }

        private sealed class CapturingLogger(List<string> errors) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (logLevel < LogLevel.Error) return;
                lock (errors) errors.Add($"{formatter(state, exception)} {exception}");
            }
        }
    }

    private sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "InventoryReceiptHttpTest";
        public const string Header = "X-Test-User";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(Header, out var value) || !Guid.TryParse(value.ToString(), out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
