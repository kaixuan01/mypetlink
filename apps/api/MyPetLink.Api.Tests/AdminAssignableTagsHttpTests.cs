using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// GET /api/v1/admin/orders/{id}/assignable-tags through the real HTTP pipeline
/// and the real capability policies, resolved from seeded built-in roles:
/// who may call it, which orders it serves, that it lists only inspected
/// (Passed) commercial stock of the order line's SKU, searched and paged on
/// the server, and that every tag it offers is one the assignment endpoint
/// accepts while every tag it hides is one assignment refuses. Test-only
/// authentication on an in-memory host; DevAuth stays off.
/// </summary>
public sealed class AdminAssignableTagsHttpTests
{
    private static readonly Guid Aina = Guid.Parse("c1111111-1111-1111-1111-111111111111");
    private static readonly Guid Ben = Guid.Parse("c2222222-2222-2222-2222-222222222222");
    private static readonly Guid Topu = Guid.Parse("c3111111-1111-1111-1111-111111111111");
    private static readonly Guid Bobo = Guid.Parse("c3222222-2222-2222-2222-222222222222");
    private const int PassedOfSkuA = 130;

    // Tags of SKU A that must never be offered, and why.
    private static readonly string[] HiddenOfSkuA =
    [
        "MPL-PEND-A001", // QA Pending (received, commercial: orderable, not assignable)
        "MPL-FAIL-A001", // QA Failed
        "MPL-REVW-A001", // QA Needs Review
        "MPL-NULL-A001", // never inspected
        "MPL-TEST-A001", // Passed testing sample
        "MPL-UNCL-A001", // Passed, unclassified
        "MPL-ARCH-A001", // Passed, archived
        "MPL-SENT-A001", // Passed, already sent onward
        "MPL-TAKN-A001", // Passed, assigned to another customer's order
    ];

    private static readonly Dictionary<string, Guid> Operators = new()
    {
        [AdminRoleTemplates.SuperAdminCode] = Guid.Parse("cb000001-0000-0000-0000-000000000001"),
        [AdminRoleTemplates.AdministratorCode] = Guid.Parse("cb000001-0000-0000-0000-000000000002"),
        [AdminRoleTemplates.OwnerSupportCode] = Guid.Parse("cb000001-0000-0000-0000-000000000003"),
        [AdminRoleTemplates.AuditorCode] = Guid.Parse("cb000001-0000-0000-0000-000000000004"),
        [AdminRoleTemplates.OperationsCode] = Guid.Parse("cb000001-0000-0000-0000-000000000005"),
        [AdminRoleTemplates.SalesCode] = Guid.Parse("cb000001-0000-0000-0000-000000000006"),
        [AdminRoleTemplates.MarketingCode] = Guid.Parse("cb000001-0000-0000-0000-000000000007"),
        [AdminRoleTemplates.FinanceCode] = Guid.Parse("cb000001-0000-0000-0000-000000000008"),
        [AdminRoleTemplates.SupportCode] = Guid.Parse("cb000001-0000-0000-0000-000000000009"),
    };

    private static Guid Operations => Operators[AdminRoleTemplates.OperationsCode];

    [Fact]
    public async Task OnlyOperatorsWhoCanViewOrdersAndAssignTagsMayList()
    {
        await using var world = await World.CreateAsync();
        var path = $"/api/v1/admin/orders/{world.PaidOrderId}/assignable-tags";

        using (var anonymous = world.As(null))
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
        using (var owner = world.As(Aina))
        {
            // The customer who placed the order is not an operator.
            using var response = await owner.GetAsync(path);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.DoesNotContain("MPL-PASS", await response.Content.ReadAsStringAsync());
        }

        var failures = new List<string>();
        foreach (var (role, userId) in Operators)
        {
            var template = AdminRoleTemplates.Require(role);
            var allowed = template.GrantsAllCapabilities
                || (template.Capabilities.Contains(AdminCapabilities.OrdersView)
                    && template.Capabilities.Contains(AdminCapabilities.OrdersTagsAssign));
            using var client = world.As(userId);
            using var response = await client.GetAsync(path);
            var body = await response.Content.ReadAsStringAsync();
            var expected = allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden;
            if (response.StatusCode != expected)
                failures.Add($"{role}: {(int)response.StatusCode}, expected {(int)expected}");
            if (!allowed && body.Contains("MPL-PASS", StringComparison.Ordinal))
                failures.Add($"{role}: refused response leaked tag codes");
        }
        Assert.True(failures.Count == 0, string.Join("\n", failures));
        // At least one built-in role is refused, so the 403 path is exercised.
        Assert.Contains(Operators.Keys, role =>
            !AdminRoleTemplates.Require(role).GrantsAllCapabilities
            && !AdminRoleTemplates.Require(role).Capabilities.Contains(AdminCapabilities.OrdersTagsAssign));
    }

    [Fact]
    public async Task ListsOnlyInspectedCommercialStockOfTheOrderLineSkuNewestFirst()
    {
        await using var world = await World.CreateAsync();
        using var client = world.As(Operations);

        var first = await world.ListAsync(client, world.PaidOrderId, world.LineA, pageSize: 50);
        Assert.Equal(PassedOfSkuA, first.Total);
        Assert.Equal(1, first.AwaitingInspection); // the received Pending unit
        Assert.Equal(50, first.Codes.Count);
        Assert.Equal("MPL-PASS-A130", first.Codes[0]); // most recently inspected first
        Assert.All(first.Items, item =>
        {
            Assert.Equal(world.VariantA, item.GetProperty("productVariantId").GetGuid());
            Assert.Equal("MPL-HTTP-LWA", item.GetProperty("sku").GetString());
            Assert.NotEqual(JsonValueKind.Null, item.GetProperty("qaInspectedAt").ValueKind);
        });

        // Every page together covers every Passed tag exactly once, none hidden.
        var all = new List<string>(first.Codes);
        for (var page = 2; page <= 3; page++)
            all.AddRange((await world.ListAsync(client, world.PaidOrderId, world.LineA, page: page, pageSize: 50)).Codes);
        Assert.Equal(PassedOfSkuA, all.Count);
        Assert.Equal(PassedOfSkuA, all.Distinct().Count());
        Assert.All(all, code => Assert.StartsWith("MPL-PASS-A", code));
        Assert.Empty(all.Intersect(HiddenOfSkuA));
        Assert.Empty((await world.ListAsync(client, world.PaidOrderId, world.LineA, page: 4, pageSize: 50)).Codes);

        // The other line lists only its own SKU.
        var lineB = await world.ListAsync(client, world.PaidOrderId, world.LineB);
        Assert.Equal(["MPL-PASS-B001"], lineB.Codes);
        Assert.Equal(0, lineB.AwaitingInspection);

        // Without a line, the first line still needing a tag is used.
        Assert.Equal(PassedOfSkuA, (await world.ListAsync(client, world.PaidOrderId, null)).Total);
    }

    [Fact]
    public async Task SearchesEveryInspectedTagOnTheServerNotJustTheFirstPage()
    {
        await using var world = await World.CreateAsync();
        using var client = world.As(Operations);

        // The oldest inspection is far beyond the first hundred.
        var exact = await world.ListAsync(client, world.PaidOrderId, world.LineA, search: "mpl-pass-a001");
        Assert.Equal(["MPL-PASS-A001"], exact.Codes);

        var partial = await world.ListAsync(client, world.PaidOrderId, world.LineA, search: "A12", pageSize: 5);
        Assert.Equal(10, partial.Total); // A120..A129
        Assert.Equal(5, partial.Codes.Count);
        Assert.All(partial.Codes, code => Assert.Contains("A12", code));

        var byBatch = await world.ListAsync(client, world.PaidOrderId, world.LineA, search: "BATCH-HTTP-A2");
        Assert.Equal(30, byBatch.Total); // A101..A130 are in the second batch

        foreach (var hidden in HiddenOfSkuA)
            Assert.Equal(0, (await world.ListAsync(client, world.PaidOrderId, world.LineA, search: hidden)).Total);
        // Another SKU's tag never matches this line, even by exact code.
        Assert.Equal(0, (await world.ListAsync(client, world.PaidOrderId, world.LineA, search: "MPL-PASS-B001")).Total);
    }

    [Fact]
    public async Task RejectsUnknownOrdersForeignLinesUnpaidOrdersAndBadPaging()
    {
        await using var world = await World.CreateAsync();
        using var client = world.As(Operations);

        await AssertRejectedAsync(client, $"/api/v1/admin/orders/{Guid.NewGuid()}/assignable-tags", HttpStatusCode.NotFound);
        await AssertRejectedAsync(client, "/api/v1/admin/orders/not-a-guid/assignable-tags", HttpStatusCode.NotFound);
        // A line from another customer's order is not part of this order.
        await AssertRejectedAsync(client,
            $"/api/v1/admin/orders/{world.PaidOrderId}/assignable-tags?orderItemId={world.OtherLine}", HttpStatusCode.BadRequest);
        await AssertRejectedAsync(client,
            $"/api/v1/admin/orders/{world.PendingOrderId}/assignable-tags", HttpStatusCode.UnprocessableEntity);
        await AssertRejectedAsync(client,
            $"/api/v1/admin/orders/{world.CancelledOrderId}/assignable-tags", HttpStatusCode.UnprocessableEntity);
        await AssertRejectedAsync(client,
            $"/api/v1/admin/orders/{world.PaidOrderId}/assignable-tags?search={new string('A', 81)}", HttpStatusCode.BadRequest);

        // Out-of-range paging is clamped, never an error or an unbounded page.
        var clamped = await world.ListAsync(client, world.PaidOrderId, world.LineA, page: 0, pageSize: 500);
        Assert.Equal(1, clamped.Page);
        Assert.Equal(50, clamped.PageSize);
        Assert.Equal(50, clamped.Codes.Count);
    }

    [Fact]
    public async Task EveryOfferedTagIsAcceptedByAssignmentAndEveryHiddenTagIsRefused()
    {
        await using var world = await World.CreateAsync();
        using var client = world.As(Operations);
        var assign = $"/api/v1/admin/orders/{world.PaidOrderId}/assign-tag";

        foreach (var hidden in HiddenOfSkuA)
        {
            using var refused = await client.PostAsJsonAsync(assign, new { tagId = await world.TagIdAsync(hidden), orderItemId = world.LineA });
            Assert.True(!refused.IsSuccessStatusCode, $"{hidden} was assigned: {(int)refused.StatusCode}");
        }
        // The right kind of tag on the wrong line is refused too.
        using (var wrongLine = await client.PostAsJsonAsync(assign, new { tagId = await world.TagIdAsync("MPL-PASS-B001"), orderItemId = world.LineA }))
            Assert.False(wrongLine.IsSuccessStatusCode);

        // The first two offered tags fill line A; each then leaves the list.
        for (var unit = 0; unit < 2; unit++)
        {
            var offered = await world.ListAsync(client, world.PaidOrderId, world.LineA, pageSize: 1);
            var tagId = offered.Items[0].GetProperty("id").GetGuid();
            using var accepted = await client.PostAsJsonAsync(assign, new { tagId, orderItemId = world.LineA });
            Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync());
            Assert.Equal(PassedOfSkuA - unit - 1, (await world.ListAsync(client, world.PaidOrderId, world.LineA)).Total);
        }

        var offeredB = await world.ListAsync(client, world.PaidOrderId, world.LineB);
        using (var acceptedB = await client.PostAsJsonAsync(assign, new { tagId = offeredB.Items[0].GetProperty("id").GetGuid(), orderItemId = world.LineB }))
            Assert.True(acceptedB.IsSuccessStatusCode, await acceptedB.Content.ReadAsStringAsync());

        await using var db = world.Db();
        var assigned = await db.SmartTags.AsNoTracking().Where(tag => tag.OrderId == world.PaidOrderId).ToListAsync();
        Assert.Equal(3, assigned.Count);
        Assert.All(assigned, tag => Assert.Equal(PhysicalQaStatus.Passed, tag.QaStatus));
        Assert.All(HiddenOfSkuA.Where(code => code != "MPL-TAKN-A001"),
            code => Assert.Null(db.SmartTags.AsNoTracking().Single(tag => tag.TagCode == code).OrderId));
    }

    [Fact]
    public async Task AnotherCustomersOrderListsTheSameStockButNeverTheirAssignedTags()
    {
        await using var world = await World.CreateAsync();
        using var client = world.As(Operations);

        // Ben's order already holds MPL-TAKN-A001; it is not offered back to
        // Ben's own line or to anyone else, and the response names no customer.
        using var response = await client.GetAsync(
            $"/api/v1/admin/orders/{world.OtherOrderId}/assignable-tags?orderItemId={world.OtherLine}&search=MPL-TAKN");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("MPL-TAKN-A001", body);
        foreach (var personal in new[] { "aina@", "ben@", "Aina", "Ben", "Topu", "Bobo", "Jalan" })
            Assert.DoesNotContain(personal, body);
        var page = await world.ListAsync(client, world.OtherOrderId, world.OtherLine);
        Assert.Equal(PassedOfSkuA, page.Total);
    }

    private static async Task AssertRejectedAsync(HttpClient client, string path, HttpStatusCode expected)
    {
        using var response = await client.GetAsync(path);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(expected == response.StatusCode, $"{path}: {(int)response.StatusCode} {body}");
        Assert.DoesNotContain("MPL-PASS", body);
    }

    private sealed record Listing(List<JsonElement> Items, int Total, int Page, int PageSize, int AwaitingInspection)
    {
        public List<string> Codes => Items.Select(item => item.GetProperty("tagCode").GetString()!).ToList();
    }

    private sealed class World : IAsyncDisposable
    {
        private readonly AdminFactory _factory;

        private World(AdminFactory factory) => _factory = factory;

        public Guid VariantA { get; private set; }
        public Guid PaidOrderId { get; private set; }
        public Guid LineA { get; private set; }
        public Guid LineB { get; private set; }
        public Guid OtherOrderId { get; private set; }
        public Guid OtherLine { get; private set; }
        public Guid PendingOrderId { get; private set; }
        public Guid CancelledOrderId { get; private set; }

        public static async Task<World> CreateAsync()
        {
            var factory = new AdminFactory();
            _ = factory.Server; // start the host, which seeds the built-in roles
            var world = new World(factory);
            await using var db = world.Db();

            foreach (var (code, userId) in Operators)
            {
                var user = new User
                {
                    Id = userId, Email = $"{code}@mypetlink.test", NormalizedEmail = $"{code}@mypetlink.test".ToUpperInvariant(),
                    DisplayName = code, Status = UserStatus.Active,
                };
                var admin = new AdminUser { UserId = userId, User = user, Role = AdminRole.OwnerSupport, IsActive = true };
                db.Add(user);
                db.Add(admin);
                db.AdminUserRoles.Add(new AdminUserRoleAssignment
                {
                    AdminUserId = admin.Id,
                    AdminRoleId = (await db.AdminRoles.SingleAsync(role => role.Code == code)).Id,
                });
            }
            foreach (var (id, email, name, petId, petName) in new[] { (Aina, "aina@example.com", "Aina Owner", Topu, "Topu"), (Ben, "ben@example.com", "Ben Owner", Bobo, "Bobo") })
            {
                db.Users.Add(new User { Id = id, Email = email, NormalizedEmail = email.ToUpperInvariant(), DisplayName = name, Status = UserStatus.Active });
                db.Pets.Add(new Pet { Id = petId, OwnerUserId = id, Slug = $"{petName.ToLowerInvariant()}-code", Name = petName, Species = "Cat", LifecycleStatus = PetLifecycleStatus.Active });
            }

            var variantA = Variant(db, "LWA", "Lightweight");
            var variantB = Variant(db, "SDB", "Standard");
            await db.SaveChangesAsync();
            world.VariantA = variantA.Id;

            var batchA1 = new SmartTagBatch { BatchNo = "BATCH-HTTP-A1", Quantity = 100, HasNfc = true, Variant = "Lightweight", ProductVariantId = variantA.Id };
            var batchA2 = new SmartTagBatch { BatchNo = "BATCH-HTTP-A2", Quantity = 39, HasNfc = true, Variant = "Lightweight", ProductVariantId = variantA.Id };
            db.SmartTagBatches.AddRange(batchA1, batchA2);
            var receiptA = ReceivedStockFixture.Receipt(db, variantA.Id);
            var receiptB = ReceivedStockFixture.Receipt(db, variantB.Id);
            var inspectedFrom = DateTimeOffset.UtcNow.AddDays(-10);
            for (var n = 1; n <= PassedOfSkuA; n++)
            {
                db.SmartTags.Add(Tag($"MPL-PASS-A{n:000}", variantA, n <= 100 ? batchA1 : batchA2, receiptA, PhysicalQaStatus.Passed,
                    tag => tag.QaInspectedAt = inspectedFrom.AddMinutes(n)));
            }
            db.SmartTags.Add(Tag("MPL-PASS-B001", variantB, null, receiptB, PhysicalQaStatus.Passed, tag => tag.QaInspectedAt = inspectedFrom));
            db.SmartTags.AddRange(
                Tag("MPL-PEND-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Pending),
                Tag("MPL-FAIL-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Failed),
                Tag("MPL-REVW-A001", variantA, batchA2, receiptA, PhysicalQaStatus.NeedsReview),
                Tag("MPL-NULL-A001", variantA, batchA2, receiptA, null),
                Tag("MPL-TEST-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Passed, tag => tag.StockPurpose = SmartTagStockPurpose.Test),
                Tag("MPL-UNCL-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Passed, tag => tag.StockPurpose = SmartTagStockPurpose.Unclassified),
                Tag("MPL-ARCH-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Passed, tag => tag.ArchivedAt = DateTimeOffset.UtcNow),
                Tag("MPL-SENT-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Passed, tag => tag.FulfilmentStatus = TagFulfilmentStatus.SentToReseller));

            var paid = Order(Aina, Topu, OrderStatus.PaymentConfirmed, (variantA, 2), (variantB, 1));
            var other = Order(Ben, Bobo, OrderStatus.PaymentConfirmed, (variantA, 2));
            var pending = Order(Aina, Topu, OrderStatus.PendingPayment, (variantA, 1));
            var cancelled = Order(Aina, Topu, OrderStatus.Cancelled, (variantA, 1));
            db.TagOrders.AddRange(paid, other, pending, cancelled);
            var taken = Tag("MPL-TAKN-A001", variantA, batchA2, receiptA, PhysicalQaStatus.Passed);
            taken.Status = SmartTagStatus.Pending;
            taken.OrderId = other.Id;
            taken.OrderItemId = other.Items.Single().Id;
            taken.PetId = Bobo;
            taken.OwnerUserId = Ben;
            db.SmartTags.Add(taken);
            await db.SaveChangesAsync();

            world.PaidOrderId = paid.Id;
            world.LineA = paid.Items.Single(item => item.ProductVariantId == variantA.Id).Id;
            world.LineB = paid.Items.Single(item => item.ProductVariantId == variantB.Id).Id;
            world.OtherOrderId = other.Id;
            world.OtherLine = other.Items.Single().Id;
            world.PendingOrderId = pending.Id;
            world.CancelledOrderId = cancelled.Id;
            return world;
        }

        private static TagProductVariant Variant(MyPetLinkDbContext db, string key, string tagVariant)
        {
            var product = new TagProduct { Name = $"Smart Tag {key}", Slug = $"http-{key.ToLowerInvariant()}", IsPublished = true };
            var variant = new TagProductVariant
            {
                TagProduct = product, PublicKey = $"HTTP{key}VARIANT".PadRight(16, '0')[..16], Sku = $"MPL-HTTP-{key}",
                DisplayName = $"{tagVariant}, QR + NFC", SupportsQr = true, SupportsNfc = true, TagVariant = tagVariant,
                BasePrice = 39.90m, Currency = "MYR", IsActive = true, IsPurchasable = true,
            };
            db.AddRange(product, variant);
            return variant;
        }

        private static SmartTag Tag(string code, TagProductVariant variant, SmartTagBatch? batch, InventoryReceipt receipt,
            PhysicalQaStatus? qa, Action<SmartTag>? configure = null)
        {
            var tag = new SmartTag
            {
                TagCode = code, ProductVariantId = variant.Id, Batch = batch, HasNfc = true, Variant = variant.TagVariant,
                Status = SmartTagStatus.Unclaimed, FulfilmentStatus = TagFulfilmentStatus.Printed, QaStatus = qa,
                QaVersion = qa is null ? 0 : 1, StockPurpose = SmartTagStockPurpose.Sale, InventoryReceipt = receipt,
            };
            configure?.Invoke(tag);
            return tag;
        }

        private static TagOrder Order(Guid ownerId, Guid petId, OrderStatus status, params (TagProductVariant Variant, int Quantity)[] lines)
        {
            var order = new TagOrder
            {
                OrderNumber = $"MPL-ORD-{Guid.NewGuid():N}"[..20], OwnerUserId = ownerId, PetId = petId, TagType = TagType.QrNfcSmartTag,
                Variant = lines[0].Variant.TagVariant, Amount = 39.90m * lines.Sum(line => line.Quantity), Currency = "MYR", Status = status,
                PaymentStatus = status is OrderStatus.PendingPayment or OrderStatus.Cancelled ? PaymentStatus.Pending : PaymentStatus.Confirmed,
                PaymentConfirmedAt = status == OrderStatus.PaymentConfirmed ? DateTimeOffset.UtcNow.AddHours(-1) : null,
                RecipientName = "Recipient", DeliveryPhoneE164 = "+60123456789", AddressLine1 = "1 Jalan Pet", Postcode = "50000",
                City = "Kuala Lumpur", State = "WP",
                PaymentReservationExpiresAt = status == OrderStatus.PendingPayment ? DateTimeOffset.UtcNow.AddHours(2) : null,
                CancelledAt = status == OrderStatus.Cancelled ? DateTimeOffset.UtcNow : null,
            };
            foreach (var (variant, quantity) in lines)
            {
                order.Items.Add(new TagOrderItem
                {
                    Id = Guid.NewGuid(), PetId = petId, ProductVariantId = variant.Id, SkuSnapshot = variant.Sku,
                    ProductNameSnapshot = "Smart Tag", VariantNameSnapshot = variant.DisplayName, SupportsNfcSnapshot = true,
                    UnitBasePrice = 39.90m, Quantity = quantity, Subtotal = 39.90m * quantity, FinalUnitPrice = 39.90m,
                    FinalAmount = 39.90m * quantity, Currency = "MYR",
                });
            }
            return order;
        }

        public MyPetLinkDbContext Db() =>
            _factory.Services.CreateScope().ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

        public async Task<Guid> TagIdAsync(string code)
        {
            await using var db = Db();
            return await db.SmartTags.Where(tag => tag.TagCode == code).Select(tag => tag.Id).SingleAsync();
        }

        public async Task<Listing> ListAsync(HttpClient client, Guid orderId, Guid? orderItemId,
            string? search = null, int page = 1, int pageSize = 20)
        {
            var query = $"page={page}&pageSize={pageSize}"
                + (orderItemId is { } line ? $"&orderItemId={line}" : "")
                + (search is null ? "" : $"&search={Uri.EscapeDataString(search)}");
            using var response = await client.GetAsync($"/api/v1/admin/orders/{orderId}/assignable-tags?{query}");
            var body = await response.Content.ReadAsStringAsync();
            Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
            using var json = JsonDocument.Parse(body);
            var data = json.RootElement.GetProperty("data");
            return new Listing(
                data.GetProperty("items").EnumerateArray().Select(item => item.Clone()).ToList(),
                data.GetProperty("total").GetInt32(),
                data.GetProperty("page").GetInt32(),
                data.GetProperty("pageSize").GetInt32(),
                data.GetProperty("awaitingInspection").GetInt32());
        }

        public HttpClient As(Guid? userId)
        {
            var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            if (userId.HasValue)
                client.DefaultRequestHeaders.Add(TestAuthHandler.Header, userId.Value.ToString());
            return client;
        }

        public ValueTask DisposeAsync() => _factory.DisposeAsync();
    }

    private sealed class AdminFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"admin-assignable-tags-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.AssignableTags.Tests",
                    ["Jwt:Audience"] = "MyPetLink.AssignableTags.Client",
                    ["Jwt:SigningKey"] = "assignable-tags-http-test-signing-key-long-enough",
                    ["DevAuth:Enabled"] = "false",
                }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>();
                services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(options => options.UseInMemoryDatabase(_database));
            });
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

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "AssignableTagsHttpTest";
        public const string Header = "X-Test-User";

        public TestAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(Header, out var value) || !Guid.TryParse(value.ToString(), out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());

            // No role claim at all: Admin access must come from the database.
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], SchemeName);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
