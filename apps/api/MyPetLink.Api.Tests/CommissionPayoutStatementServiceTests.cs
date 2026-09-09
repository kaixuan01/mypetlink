using System.Text;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using UglyToad.PdfPig;

namespace MyPetLink.Api.Tests;

public sealed class CommissionPayoutStatementServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-09T08:30:00Z");

    [Fact]
    public async Task PreparedStatementUsesSnapshotsAndContainsEveryCommissionGroup()
    {
        using var h = await Harness.CreateAsync();
        var payout = await h.PayoutAsync(CommissionPayoutStatus.Prepared,
            (SalesCommissionType.DirectRetailPercentage, "MPL-ORD-RETAIL", 12m),
            (SalesCommissionType.ResellerAcquisitionBonus, "MPL-B2B-ACQUIRE", 50m),
            (SalesCommissionType.ResellerRepeatPercentage, "MPL-B2B-REPEAT", 18m),
            (SalesCommissionType.MerchantOrderPercentage, "MPL-B2B-LEGACY", 20m));

        var document = await h.Service.GetStatementAsync(payout.Id);
        var text = Squash(document.Content);

        Assert.StartsWith("%PDF-", Encoding.ASCII.GetString(document.Content, 0, 5));
        Assert.Equal($"MyPetLink-Commission-Payout-Statement-{payout.PayoutNumber}.pdf", document.FileName);
        Assert.Contains(Squash("Commission Payout Statement"), text);
        Assert.Contains("PREPARED", text);
        Assert.Contains(Squash("NOT YET PAID"), text);
        Assert.Contains(Squash("GBB Software Solutions Snapshot"), text);
        Assert.Contains(Squash("Snapshot Salesperson"), text);
        Assert.Contains(Squash("Direct Retail"), text);
        Assert.Contains(Squash("Reseller Acquisition"), text);
        Assert.Contains(Squash("Reseller Repeat"), text);
        Assert.Contains(Squash("Legacy Merchant Percentage"), text);
        Assert.Contains("MPL-ORD-RETAIL", text);
        Assert.Contains("MPL-B2B-ACQUIRE", text);
        Assert.Contains(Squash("MYR 100.00"), text);
        Assert.Contains(Squash("not proof that money has been transferred"), text);
    }

    [Fact]
    public async Task LaterSellerSalespersonAndRuleChangesDoNotRewriteStatementSnapshots()
    {
        using var h = await Harness.CreateAsync();
        var payout = await h.PayoutAsync(CommissionPayoutStatus.Prepared,
            (SalesCommissionType.DirectRetailPercentage, "MPL-ORD-HISTORY", 15m));
        var before = Squash((await h.Service.GetStatementAsync(payout.Id)).Content);

        h.Salesperson.Name = "Renamed Current Salesperson";
        h.Identity.LegalBusinessName = "Renamed Current Seller";
        var commission = await h.Db.SalesCommissions.SingleAsync();
        commission.CommissionPercentageSnapshot = 99m;
        await h.Db.SaveChangesAsync();

        var after = Squash((await h.Service.GetStatementAsync(payout.Id)).Content);
        Assert.Equal(before, after);
        Assert.DoesNotContain(Squash("Renamed Current"), after);
        Assert.DoesNotContain("99%", after);
    }

    [Fact]
    public async Task PaidStatementShowsReferenceAndKeepsRecoverySeparateFromOriginalTotal()
    {
        using var h = await Harness.CreateAsync();
        var payout = await h.PayoutAsync(CommissionPayoutStatus.Paid,
            (SalesCommissionType.DirectRetailPercentage, "MPL-ORD-PAID-1", 60m),
            (SalesCommissionType.ResellerRepeatPercentage, "MPL-B2B-PAID-2", 40m));
        var reversed = await h.Db.SalesCommissions.SingleAsync(item => item.CommissionAmount == 40m);
        reversed.Status = SalesCommissionStatus.Reversed;
        reversed.ReversedAt = Now.AddDays(1);
        reversed.ReversalReason = "Merchant payment refunded";
        await h.Db.SaveChangesAsync();

        var text = Squash((await h.Service.GetStatementAsync(payout.Id)).Content);

        Assert.Contains("PAID", text);
        Assert.Contains("BANK-260909-001", text);
        Assert.Contains(Squash("Total prepared amount MYR 100.00"), text);
        Assert.Contains(Squash("Post-Payout Reversals / Recovery Required"), text);
        Assert.Contains("MPL-B2B-PAID-2", text);
        Assert.Contains(Squash("Merchant payment refunded"), text);
        Assert.Contains(Squash("Total recovery exposure MYR 40.00"), text);
    }

    [Fact]
    public async Task CancelledStatementIncludesReleasedItemsAndOriginalPreparedAmount()
    {
        using var h = await Harness.CreateAsync();
        var payout = await h.PayoutAsync(CommissionPayoutStatus.Cancelled,
            (SalesCommissionType.MerchantOrderPercentage, "MPL-B2B-CANCELLED", 75m));

        var text = Squash((await h.Service.GetStatementAsync(payout.Id)).Content);

        Assert.Contains("CANCELLED", text);
        Assert.Contains(Squash("Incorrect earning period"), text);
        Assert.Contains("MPL-B2B-CANCELLED", text);
        Assert.Contains(Squash("Total prepared amount MYR 75.00"), text);
    }

    [Fact]
    public async Task StatementFailsClosedWhenHistoricalItemsDoNotReconcile()
    {
        using var h = await Harness.CreateAsync();
        var payout = await h.PayoutAsync(CommissionPayoutStatus.Prepared,
            (SalesCommissionType.DirectRetailPercentage, "MPL-ORD-BAD", 10m));
        payout.PreparedAmount = 11m;
        await h.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.GetStatementAsync(payout.Id));

        Assert.Equal(409, error.StatusCode);
        Assert.Equal("payout_statement_reconciliation_failed", error.Code);
    }

    private static string Squash(byte[] content)
    {
        using var pdf = PdfDocument.Open(content);
        return Squash(string.Join(Environment.NewLine, pdf.GetPages().Select(page => page.Text)));
    }

    private static string Squash(string value) =>
        new(value.Where(character => !char.IsWhiteSpace(character)).ToArray());

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, CommissionPayoutStatementService service,
            Salesperson salesperson, BusinessIdentitySetting identity)
        {
            Db = db;
            Service = service;
            Salesperson = salesperson;
            Identity = identity;
        }

        public MyPetLinkDbContext Db { get; }
        public CommissionPayoutStatementService Service { get; }
        public Salesperson Salesperson { get; }
        public BusinessIdentitySetting Identity { get; }

        public static async Task<Harness> CreateAsync()
        {
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options,
                new FixedTimeProvider(Now));
            var salesperson = new Salesperson
            {
                SalespersonCode = "MPL-SALES-SNAPSHOT",
                Name = "Current Salesperson",
                Email = "rep@example.com",
                Phone = "+60123456789",
            };
            var identity = new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId,
                BrandName = "MyPetLink",
                LegalBusinessName = "Current Seller",
                BusinessRegistrationNumber = "CURRENT-REG",
                RegisteredAddressLine1 = "Current address",
                RegisteredPostcode = "57000",
                RegisteredCity = "Kuala Lumpur",
                RegisteredState = "Kuala Lumpur",
                RegisteredCountry = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
                RowVersion = [1],
            };
            db.AddRange(salesperson, identity);
            await db.SaveChangesAsync();
            return new Harness(db, new CommissionPayoutStatementService(db, new FixedTimeProvider(Now)),
                salesperson, identity);
        }

        public async Task<CommissionPayout> PayoutAsync(
            CommissionPayoutStatus status,
            params (SalesCommissionType Type, string Order, decimal Amount)[] values)
        {
            var adminUser = new User
            {
                Email = "finance@example.com",
                NormalizedEmail = "FINANCE@EXAMPLE.COM",
                DisplayName = "Finance Admin",
            };
            var admin = new AdminUser { User = adminUser, Role = AdminRole.SuperAdmin, IsActive = true };
            var payout = new CommissionPayout
            {
                PayoutNumber = $"MPL-PAYOUT-260909-{Guid.NewGuid():N}"[..26],
                SalespersonId = Salesperson.Id,
                SalespersonCodeSnapshot = "MPL-SALES-001",
                SalespersonNameSnapshot = "Snapshot Salesperson",
                Seller = new SellerIdentitySnapshot
                {
                    BrandName = "MyPetLink",
                    LegalBusinessName = "GBB Software Solutions Snapshot",
                    BusinessRegistrationNumber = "SNAPSHOT-REG",
                    AddressLine1 = "12 Snapshot Street",
                    Postcode = "57000",
                    City = "Kuala Lumpur",
                    State = "Kuala Lumpur",
                    Country = "Malaysia",
                    SupportEmail = "snapshot@mypetlink.com.my",
                },
                PeriodFrom = Now.AddMonths(-1),
                PeriodToExclusive = Now,
                Currency = "MYR",
                PreparedAmount = values.Sum(item => item.Amount),
                Status = status,
                PreparedAt = Now.AddHours(-2),
                PreparedByAdminUser = admin,
                IdempotencyKey = Guid.NewGuid().ToString("N"),
                RequestFingerprint = Guid.NewGuid().ToString("N"),
                RowVersion = [1],
            };
            if (status == CommissionPayoutStatus.Paid)
            {
                payout.PaidAt = Now;
                payout.PaidByAdminUser = admin;
                payout.PaymentMethod = CommissionPayoutPaymentMethod.BankTransfer;
                payout.PaymentReference = "BANK-260909-001";
            }
            if (status == CommissionPayoutStatus.Cancelled)
            {
                payout.CancelledAt = Now;
                payout.CancelledByAdminUser = admin;
                payout.CancellationReason = "Incorrect earning period";
            }

            foreach (var (type, order, amount) in values)
            {
                var commission = new SalesCommission
                {
                    SourceType = type == SalesCommissionType.DirectRetailPercentage
                        ? SalesCommissionSourceType.TagOrder
                        : SalesCommissionSourceType.MerchantOrder,
                    CommissionType = type,
                    SalespersonId = Salesperson.Id,
                    SalespersonCodeSnapshot = "MPL-SALES-001",
                    SalespersonNameSnapshot = "Snapshot Salesperson",
                    CommissionBaseAmount = type == SalesCommissionType.ResellerAcquisitionBonus ? 0m : amount * 10,
                    CommissionPercentageSnapshot = type == SalesCommissionType.ResellerAcquisitionBonus ? null : 10m,
                    CommissionFixedAmountSnapshot = type == SalesCommissionType.ResellerAcquisitionBonus ? amount : null,
                    CommissionAmount = amount,
                    Currency = "MYR",
                    Status = status == CommissionPayoutStatus.Paid ? SalesCommissionStatus.Paid : SalesCommissionStatus.Payable,
                    CalculatedAt = Now.AddDays(-2),
                };
                payout.Items.Add(new CommissionPayoutItem
                {
                    SalesCommission = commission,
                    SourceTypeSnapshot = commission.SourceType,
                    CommissionTypeSnapshot = type,
                    SourceOrderNumberSnapshot = order,
                    CommissionBaseAmountSnapshot = commission.CommissionBaseAmount,
                    CommissionPercentageSnapshot = commission.CommissionPercentageSnapshot,
                    CommissionFixedAmountSnapshot = commission.CommissionFixedAmountSnapshot,
                    CommissionAmountSnapshot = amount,
                    CurrencySnapshot = "MYR",
                    CalculatedAtSnapshot = commission.CalculatedAt,
                    ReleasedAt = status == CommissionPayoutStatus.Cancelled ? Now : null,
                    ReleasedByAdminUser = status == CommissionPayoutStatus.Cancelled ? admin : null,
                    ReleaseReason = status == CommissionPayoutStatus.Cancelled ? "Incorrect earning period" : null,
                });
            }
            Db.CommissionPayouts.Add(payout);
            await Db.SaveChangesAsync();
            return payout;
        }

        public void Dispose() => Db.Dispose();
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
