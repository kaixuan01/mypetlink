using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class SalesReportingServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 10, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Performance_SeparatesAttributedAndEligible_AndUsesHalfOpenSourceDates()
    {
        await using var h = await Harness.CreateAsync();
        var report = await h.Service.GetPerformanceAsync(new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            SalespersonId = h.Seller.Id
        }, default);

        Assert.Equal(2, report.Retail.AttributedPaidOrders);
        Assert.Equal(3, report.Retail.UnitsSold);
        Assert.Equal(120m, report.Retail.AttributedRevenue);
        Assert.Equal(1, report.Retail.CommissionEligibleOrders);
        Assert.Equal(2, report.Retail.CommissionEligibleUnits);
        Assert.Equal(80m, report.Retail.CommissionEligibleRevenue);
        Assert.Equal(1, report.Merchant.PaidOrders);
        Assert.Equal(180m, report.Merchant.NetWholesaleRevenue);
        Assert.Equal(1, report.Merchant.NewResellerActivations);
        Assert.Equal(80m, Assert.Single(report.DirectRevenueRanking).Value);
    }

    [Fact]
    public async Task Financial_UsesEarnedPaidAndReversalEventDatesIndependently()
    {
        await using var h = await Harness.CreateAsync();
        var june = await h.Service.GetFinancialAsync(new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            SalespersonId = h.Seller.Id
        }, default);
        Assert.Equal(62m, june.Accounting.GrossGenerated);
        Assert.Equal(50m, june.Accounting.CurrentValid);
        Assert.Equal(50m, june.Accounting.Payable);
        Assert.Equal(0m, june.Accounting.CurrentPaid);
        Assert.Equal(12m, june.Accounting.Reversed);
        Assert.Equal(12m, june.Accounting.CashPaidDuringPeriod);
        Assert.Equal(0m, june.Accounting.ReversedDuringPeriod);

        var july = await h.Service.GetFinancialAsync(new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero),
            SalespersonId = h.Seller.Id
        }, default);
        Assert.Equal(0m, july.Accounting.GrossGenerated);
        Assert.Equal(0m, july.Accounting.CashPaidDuringPeriod);
        Assert.Equal(12m, july.Accounting.ReversedDuringPeriod);
    }

    [Fact]
    public async Task Portfolio_PreservesAcquisitionOwnerAndShowsCurrentAssignmentSeparately()
    {
        await using var h = await Harness.CreateAsync();
        h.Seller.Name = "Renamed seller";
        h.Seller.SalespersonCode = "S-RENAMED";
        await h.Db.SaveChangesAsync();
        var (rows, total) = await h.Service.ListPortfolioAsync(h.Seller.Id,
            new ResellerPortfolioQuery(), default);
        var row = Assert.Single(rows);
        Assert.Equal(1, total);
        Assert.Equal(h.Seller.Id, row.AcquiredBySalespersonId);
        Assert.Equal("S-1", row.AcquiredBySalespersonCode);
        Assert.Equal("=Formula Seller", row.AcquiredBySalespersonName);
        Assert.Equal(h.OtherSeller.Id, row.AssignedSalespersonId);
        Assert.Equal("EndingSoon", row.RelationshipState);
        Assert.Equal(180m, row.LifetimeWholesaleRevenue);
    }

    [Fact]
    public async Task Portfolio_ClassifiesAllRelationshipStatesAtTheThirtyDayBoundary()
    {
        await using var h = await Harness.CreateAsync();
        h.Db.Merchants.AddRange(
            RelationshipMerchant(h.Seller, "ACTIVE", Now.AddDays(31), activated: true),
            RelationshipMerchant(h.Seller, "EXPIRED", Now, activated: true),
            RelationshipMerchant(h.Seller, "PENDING", null, activated: false));
        await h.Db.SaveChangesAsync();

        foreach (var expected in new[] { "Active", "EndingSoon", "Expired", "NotActivated" })
        {
            var (items, _) = await h.Service.ListPortfolioAsync(h.Seller.Id,
                new ResellerPortfolioQuery { State = expected }, default);
            Assert.Single(items);
            Assert.Equal(expected, items.Single().RelationshipState);
        }
    }

    [Fact]
    public async Task ChannelFilter_PreventsRetailAndMerchantMetricsFromLeaking()
    {
        await using var h = await Harness.CreateAsync();
        var retail = await h.Service.GetSalespersonPerformanceAsync(h.Seller.Id, new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            Channel = "retail"
        }, default);
        var merchant = await h.Service.GetSalespersonPerformanceAsync(h.Seller.Id, new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
            Channel = "merchant"
        }, default);

        Assert.Equal(0, retail.Merchant.PaidOrders);
        Assert.Equal(0m, retail.LifetimeWholesaleRevenue);
        Assert.Equal(0, merchant.Retail.AttributedPaidOrders);
        Assert.Equal(180m, merchant.LifetimeWholesaleRevenue);
    }

    [Fact]
    public async Task CommissionExport_IsSanitizedCappedShapeAndAudited()
    {
        await using var h = await Harness.CreateAsync();
        var export = await h.Service.ExportCommissionLedgerAsync(h.AdminUser.Id,
            new CommissionLedgerQuery
            {
                From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
                SalespersonId = h.Seller.Id
            }, default);
        var csv = Encoding.UTF8.GetString(export.Content);
        Assert.StartsWith("\uFEFF", csv);
        Assert.Contains("\"'=Formula Seller\"", csv);
        Assert.Contains("\"Percentage Snapshot\"", csv);
        Assert.Contains("\"Fixed Amount Snapshot\"", csv);
        Assert.Contains("\"Legacy Individual Payment\"", csv);
        var audit = await h.Db.AuditLogs.SingleAsync(item => item.Action == "sales-commissions.export");
        Assert.Contains("\"rowCount\":2", audit.NewValue);
        Assert.DoesNotContain("Internal note", csv);
    }

    [Fact]
    public async Task CommissionExport_AppliesTheLedgerFilters()
    {
        await using var h = await Harness.CreateAsync();
        var csv = Encoding.UTF8.GetString((await h.Service.ExportCommissionLedgerAsync(h.AdminUser.Id,
            new CommissionLedgerQuery
            {
                From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero),
                Status = "Payable", Channel = "merchant", Search = "MOR-1"
        }, default)).Content);

        Assert.Contains("\"MOR-1\"", csv);
        Assert.DoesNotContain("\"R-1\"", csv);
    }

    [Theory]
    [InlineData("=SUM(A1:A2)", "\"'=SUM(A1:A2)\"")]
    [InlineData("+1", "\"'+1\"")]
    [InlineData("-1", "\"'-1\"")]
    [InlineData("@command", "\"'@command\"")]
    [InlineData("a,\"b\"\nc", "\"a,\"\"b\"\"\nc\"")]
    public void CsvSanitizer_QuotesAndNeutralizesSpreadsheetInput(string input, string expected) =>
        Assert.Equal(expected, AdminExportSanitizer.Csv(input));

    [Fact]
    public async Task CommissionExport_RefusesMoreThanTenThousandRows()
    {
        await using var h = await Harness.CreateAsync();
        h.Db.SalesCommissions.AddRange(Enumerable.Range(0, 9_999).Select(index => new SalesCommission
        {
            SourceType = SalesCommissionSourceType.TagOrder,
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            SalespersonId = h.Seller.Id,
            SalespersonCodeSnapshot = h.Seller.SalespersonCode,
            SalespersonNameSnapshot = h.Seller.Name,
            CommissionPercentageSnapshot = 1m,
            CommissionBaseAmount = 1m,
            CommissionAmount = 0.01m,
            CalculatedAt = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero).AddSeconds(index)
        }));
        await h.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() => h.Service.ExportCommissionLedgerAsync(
            h.AdminUser.Id, new CommissionLedgerQuery
            {
                From = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                ToExclusive = new DateTimeOffset(2026, 7, 1, 0, 0, 0, TimeSpan.Zero)
            }, default));
        Assert.Equal("validation_failed", error.Code);
    }

    private static Merchant RelationshipMerchant(
        Salesperson seller, string code, DateTimeOffset? repeatEnd, bool activated) => new()
    {
        MerchantCode = code,
        LegalBusinessName = code,
        AcquiredBySalespersonId = seller.Id,
        AcquiredBySalesperson = seller,
        AcquiredBySalespersonCodeSnapshot = seller.SalespersonCode,
        AcquiredBySalespersonNameSnapshot = seller.Name,
        FirstQualifyingPaidOrderAt = activated ? Now.AddDays(-60) : null,
        RepeatCommissionEligibleUntil = repeatEnd,
        CommissionPlan = MerchantCommissionPlan.AcquisitionAndRepeat
    };

    private sealed class Harness : IAsyncDisposable
    {
        public required MyPetLinkDbContext Db { get; init; }
        public required SalesReportingService Service { get; init; }
        public required Salesperson Seller { get; init; }
        public required Salesperson OtherSeller { get; init; }
        public required User AdminUser { get; init; }

        public static async Task<Harness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase($"sales-reporting-{Guid.NewGuid():N}").Options;
            var time = new FixedTimeProvider(Now);
            var db = new MyPetLinkDbContext(options, time);
            var seller = new Salesperson { SalespersonCode = "S-1", Name = "=Formula Seller", DefaultCommissionPercentage = 10 };
            var other = new Salesperson { SalespersonCode = "S-2", Name = "Current Rep", DefaultCommissionPercentage = 10 };
            var admin = new User { Email = "admin@example.test", NormalizedEmail = "ADMIN@EXAMPLE.TEST", DisplayName = "Admin" };
            db.AddRange(seller, other, admin);
            db.Add(new AdminUser { UserId = admin.Id, User = admin, Role = AdminRole.SuperAdmin, IsActive = true });

            var eligibleOrder = RetailOrder(seller, "R-1", new(2026, 6, 10, 0, 0, 0, TimeSpan.Zero), 2, 80m);
            var attributedOnly = RetailOrder(seller, "R-2", new(2026, 6, 20, 0, 0, 0, TimeSpan.Zero), 1, 40m);
            var boundary = RetailOrder(seller, "R-3", new(2026, 7, 1, 0, 0, 0, TimeSpan.Zero), 1, 30m);
            db.AddRange(eligibleOrder, attributedOnly, boundary);

            var merchant = new Merchant
            {
                MerchantCode = "M-1", LegalBusinessName = "Reseller", ContactPerson = "Person",
                ContactEmail = "merchant@example.test", ContactPhone = "+60111111111",
                BillingAddressLine1 = "1 Road", BillingPostcode = "50000", BillingCity = "KL", BillingState = "KL", BillingCountry = "Malaysia",
                DeliveryAddressLine1 = "1 Road", DeliveryPostcode = "50000", DeliveryCity = "KL", DeliveryState = "KL", DeliveryCountry = "Malaysia",
                CommissionPlan = MerchantCommissionPlan.AcquisitionAndRepeat,
                AcquiredBySalespersonId = seller.Id, AcquiredBySalesperson = seller,
                AssignedSalespersonId = other.Id, AssignedSalesperson = other,
                AcquisitionAttributedAt = new(2026, 5, 1, 0, 0, 0, TimeSpan.Zero),
                FirstQualifyingPaidOrderAt = new(2026, 6, 15, 0, 0, 0, TimeSpan.Zero),
                RepeatCommissionEligibleUntil = Now.AddDays(20),
                AcquiredBySalespersonCodeSnapshot = seller.SalespersonCode,
                AcquiredBySalespersonNameSnapshot = seller.Name,
                RepeatCommissionPercentageSnapshot = 3,
                RepeatCommissionEligibilityMonthsSnapshot = 3
            };
            var merchantOrder = new MerchantOrder
            {
                MerchantOrderNumber = "MOR-1", MerchantId = merchant.Id, Merchant = merchant,
                MerchantCodeSnapshot = merchant.MerchantCode, MerchantLegalNameSnapshot = merchant.LegalBusinessName,
                ContactPersonSnapshot = merchant.ContactPerson, ContactEmailSnapshot = merchant.ContactEmail,
                ContactPhoneSnapshot = merchant.ContactPhone, BillingAddressLine1Snapshot = "1 Road", BillingPostcodeSnapshot = "50000",
                BillingCitySnapshot = "KL", BillingStateSnapshot = "KL", BillingCountrySnapshot = "Malaysia",
                DeliveryAddressLine1Snapshot = "1 Road", DeliveryPostcodeSnapshot = "50000", DeliveryCitySnapshot = "KL",
                DeliveryStateSnapshot = "KL", DeliveryCountrySnapshot = "Malaysia", MerchandiseSubtotal = 200m,
                DiscountTotal = 20m, GrandTotal = 180m, PaymentStatus = MerchantOrderPaymentStatus.PaymentConfirmed
            };
            merchant.FirstQualifyingMerchantOrderId = merchantOrder.Id;
            merchant.FirstQualifyingMerchantOrder = merchantOrder;
            var payment = new MerchantPayment { MerchantOrderId = merchantOrder.Id, MerchantOrder = merchantOrder, PaymentDate = new(2026, 6, 15, 0, 0, 0, TimeSpan.Zero), AmountReceived = 180m };
            db.AddRange(merchant, merchantOrder, payment);

            db.Add(new SalesCommission
            {
                SourceType = SalesCommissionSourceType.TagOrder, CommissionType = SalesCommissionType.DirectRetailPercentage,
                TagOrderId = eligibleOrder.Id, TagOrder = eligibleOrder, SalespersonId = seller.Id, Salesperson = seller,
                SalespersonCodeSnapshot = seller.SalespersonCode, SalespersonNameSnapshot = seller.Name,
                CommissionPercentageSnapshot = 15, CommissionBaseAmount = 80m, CommissionAmount = 12m,
                Status = SalesCommissionStatus.Reversed, CalculatedAt = new(2026, 6, 10, 0, 0, 0, TimeSpan.Zero),
                PaidAt = new(2026, 6, 18, 0, 0, 0, TimeSpan.Zero), ReversedAt = new(2026, 7, 5, 0, 0, 0, TimeSpan.Zero),
                ReversalReason = "Refunded", ReversedByAdminUserId = db.AdminUsers.Local.Single().Id
            });
            db.Add(new SalesCommission
            {
                SourceType = SalesCommissionSourceType.MerchantOrder, CommissionType = SalesCommissionType.ResellerAcquisitionBonus,
                MerchantId = merchant.Id, Merchant = merchant, MerchantOrderId = merchantOrder.Id, MerchantOrder = merchantOrder,
                MerchantPaymentId = payment.Id, MerchantPayment = payment, SalespersonId = seller.Id, Salesperson = seller,
                SalespersonCodeSnapshot = seller.SalespersonCode, SalespersonNameSnapshot = seller.Name,
                CommissionFixedAmountSnapshot = 50m, CommissionBaseAmount = 180m, CommissionAmount = 50m,
                Status = SalesCommissionStatus.Payable, CalculatedAt = new(2026, 6, 15, 0, 0, 0, TimeSpan.Zero)
            });
            await db.SaveChangesAsync();
            return new Harness
            {
                Db = db, Seller = seller, OtherSeller = other, AdminUser = admin,
                Service = new SalesReportingService(db, new AuditLogService(db, new HttpContextAccessor()), time)
            };
        }

        private static TagOrder RetailOrder(Salesperson seller, string number, DateTimeOffset paidAt, int quantity, decimal revenue)
        {
            var order = new TagOrder
            {
                OrderNumber = number, SalespersonId = seller.Id, Salesperson = seller,
                SalespersonCodeSnapshot = seller.SalespersonCode, SalespersonNameSnapshot = seller.Name,
                PaymentStatus = PaymentStatus.Confirmed, PaymentConfirmedAt = paidAt, Status = OrderStatus.PaymentConfirmed
            };
            order.Items.Add(new TagOrderItem { OrderId = order.Id, Order = order, Quantity = quantity, FinalAmount = revenue });
            return order;
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
