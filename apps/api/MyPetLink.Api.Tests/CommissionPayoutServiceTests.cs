using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class CommissionPayoutServiceTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-09T04:00:00Z");

    [Fact]
    public async Task PrepareSnapshotsExactSelectionAndReplaysSortedPayload()
    {
        using var h = await Harness.CreateAsync();
        var first = await h.CommissionAsync(12.34m, Now.AddDays(-2));
        var second = await h.CommissionAsync(5.66m, Now.AddDays(-1));

        var prepared = await h.PrepareAsync([second.Id, first.Id], 18m, "prepare-1");
        var replay = await h.PrepareAsync([first.Id, second.Id], 18m, "prepare-1");

        Assert.Equal(prepared.Summary.Id, replay.Summary.Id);
        Assert.Equal("Prepared", prepared.Summary.Status);
        Assert.Equal("MPL-PAYOUT-260909-0001", prepared.Summary.PayoutNumber);
        Assert.Equal(18m, prepared.Summary.PreparedAmount);
        Assert.Equal(2, prepared.Items.Count);
        Assert.Equal([5.66m, 12.34m], prepared.Items.Select(item => item.CommissionAmount).Order().ToArray());
        Assert.Equal("MyPetLink", prepared.Seller.BrandName);
        Assert.Single(await h.Db.AuditLogs.Where(item => item.Action == "commission-payout.prepared").ToListAsync());
    }

    [Fact]
    public async Task SameIdempotencyKeyWithDifferentFinancialPayloadConflicts()
    {
        using var h = await Harness.CreateAsync();
        var commission = await h.CommissionAsync(10m, Now.AddDays(-1));
        await h.PrepareAsync([commission.Id], 10m, "same-key");

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.PrepareAsync(h.ActorUserId, h.Request([commission.Id], 11m, "same-key")));

        Assert.Equal("idempotency_key_conflict", exception.Code);

        var other = await h.CommissionAsync(10m, Now.AddHours(-3));
        var changedList = await Assert.ThrowsAsync<ApiException>(() =>
            h.Service.PrepareAsync(h.ActorUserId, h.Request([other.Id], 10m, "same-key")));
        Assert.Equal("idempotency_key_conflict", changedList.Code);
    }

    [Fact]
    public async Task PrepareRejectsChangedTotalMixedSellerAndUnsupportedCurrency()
    {
        using var h = await Harness.CreateAsync();
        var first = await h.CommissionAsync(10m, Now.AddDays(-1));
        var changed = await Assert.ThrowsAsync<ApiException>(() => h.PrepareAsync([first.Id], 9m, "wrong-total"));
        Assert.Equal("payout_total_changed", changed.Code);

        var secondSeller = new Salesperson { SalespersonCode = "MPL-SALES-999", Name = "Other Rep", Email = "other@example.com", Phone = "+60120000099" };
        h.Db.Salespersons.Add(secondSeller);
        await h.Db.SaveChangesAsync();
        var mixed = await h.CommissionAsync(2m, Now.AddDays(-1), secondSeller.Id);
        var mismatch = await Assert.ThrowsAsync<ApiException>(() => h.PrepareAsync([first.Id, mixed.Id], 12m, "mixed"));
        Assert.Equal("payout_salesperson_mismatch", mismatch.Code);

        first.Currency = "USD";
        await h.Db.SaveChangesAsync();
        var currency = await Assert.ThrowsAsync<ApiException>(() => h.PrepareAsync([first.Id], 10m, "currency"));
        Assert.Equal("unsupported_payout_currency", currency.Code);
    }

    [Fact]
    public async Task PrepareRejectsNonPayableAndOutOfPeriodRows()
    {
        using var h = await Harness.CreateAsync();
        var paid = await h.CommissionAsync(10m, Now.AddDays(-1));
        paid.Status = SalesCommissionStatus.Paid;
        paid.PaidAt = Now;
        await h.Db.SaveChangesAsync();
        var status = await Assert.ThrowsAsync<ApiException>(() => h.PrepareAsync([paid.Id], 10m, "not-payable"));
        Assert.Equal("commission_not_payable", status.Code);

        var old = await h.CommissionAsync(3m, Now.AddDays(-20));
        var period = await Assert.ThrowsAsync<ApiException>(() => h.PrepareAsync([old.Id], 3m, "outside"));
        Assert.Equal("commission_outside_payout_period", period.Code);
    }

    [Fact]
    public async Task PayTransitionsEveryCommissionAtOneTimestampAndRetryIsIdempotent()
    {
        using var h = await Harness.CreateAsync();
        var first = await h.CommissionAsync(10m, Now.AddDays(-2));
        var second = await h.CommissionAsync(8m, Now.AddDays(-1));
        var prepared = await h.PrepareAsync([first.Id, second.Id], 18m, "pay-batch");

        var paid = await h.Service.MarkPaidAsync(h.ActorUserId, prepared.Summary.Id,
            new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.BankTransfer, "BANK-20260909-1"));
        var replay = await h.Service.MarkPaidAsync(h.ActorUserId, prepared.Summary.Id,
            new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.BankTransfer, "BANK-20260909-1"));

        Assert.Equal("Paid", paid.Summary.Status);
        Assert.Equal(paid.Summary.Id, replay.Summary.Id);
        var commissions = await h.Db.SalesCommissions.Where(item => item.Id == first.Id || item.Id == second.Id).ToListAsync();
        Assert.All(commissions, item => Assert.Equal(SalesCommissionStatus.Paid, item.Status));
        Assert.Single(commissions.Select(item => item.PaidAt).Distinct());
        Assert.All(commissions, item => Assert.Equal(h.AdminUserId, item.PaidByAdminUserId));
        var changedRetry = await Assert.ThrowsAsync<ApiException>(() => h.Service.MarkPaidAsync(
            h.ActorUserId, prepared.Summary.Id,
            new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.Cash, "DIFFERENT")));
        Assert.Equal("payout_already_paid", changedRetry.Code);
        var cancelPaid = await Assert.ThrowsAsync<ApiException>(() => h.Service.CancelAsync(
            h.ActorUserId, prepared.Summary.Id,
            new CancelCommissionPayoutRequest(prepared.Summary.ConcurrencyToken, "Too late")));
        Assert.Equal("payout_already_paid", cancelPaid.Code);
    }

    [Fact]
    public async Task PayFailsClosedWhenAnyReservedCommissionChanged()
    {
        using var h = await Harness.CreateAsync();
        var commission = await h.CommissionAsync(10m, Now.AddDays(-1));
        var prepared = await h.PrepareAsync([commission.Id], 10m, "reconcile");
        commission.Status = SalesCommissionStatus.Reversed;
        commission.ReversedAt = Now;
        commission.ReversalReason = "Injected inconsistency";
        await h.Db.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() => h.Service.MarkPaidAsync(
            h.ActorUserId, prepared.Summary.Id,
            new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.BankTransfer, "BANK-1")));

        Assert.Equal("payout_reconciliation_failed", exception.Code);
        Assert.Equal(CommissionPayoutStatus.Prepared,
            (await h.Db.CommissionPayouts.SingleAsync()).Status);
    }

    [Fact]
    public async Task CancelReleasesClaimsKeepsCommissionsPayableAndAllowsNewPayout()
    {
        using var h = await Harness.CreateAsync();
        var commission = await h.CommissionAsync(10m, Now.AddDays(-1));
        var prepared = await h.PrepareAsync([commission.Id], 10m, "cancel-1");

        var cancelled = await h.Service.CancelAsync(h.ActorUserId, prepared.Summary.Id,
            new CancelCommissionPayoutRequest(prepared.Summary.ConcurrencyToken, "Wrong payout period"));
        var replacement = await h.PrepareAsync([commission.Id], 10m, "cancel-2");

        Assert.Equal("Cancelled", cancelled.Summary.Status);
        Assert.NotEqual(cancelled.Summary.Id, replacement.Summary.Id);
        Assert.Equal(SalesCommissionStatus.Payable, (await h.Db.SalesCommissions.FindAsync(commission.Id))!.Status);
        Assert.Single(await h.Db.CommissionPayoutItems.Where(item => item.ReleasedAt != null).ToListAsync());
        Assert.Single(await h.Db.CommissionPayoutItems.Where(item => item.ReleasedAt == null).ToListAsync());
        var payCancelled = await Assert.ThrowsAsync<ApiException>(() => h.Service.MarkPaidAsync(
            h.ActorUserId, cancelled.Summary.Id,
            new MarkCommissionPayoutPaidRequest(cancelled.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.BankTransfer, "BANK-CANCELLED")));
        Assert.Equal("payout_cancelled", payCancelled.Code);
    }

    [Fact]
    public async Task DirectLegacyTransitionsAreBlockedWhilePrepared()
    {
        using var h = await Harness.CreateAsync();
        var commission = await h.CommissionAsync(10m, Now.AddDays(-1));
        await h.PrepareAsync([commission.Id], 10m, "reserved");

        var pay = await Assert.ThrowsAsync<ApiException>(() => h.Billing.MarkCommissionPaidAsync(
            null, commission.Id, null, default));
        var reverse = await Assert.ThrowsAsync<ApiException>(() => h.Billing.ReverseCommissionAsync(
            null, commission.Id, new ReverseSalesCommissionRequest("Invalid"), default));

        Assert.Equal("commission_reserved_for_payout", pay.Code);
        Assert.Equal("commission_reserved_for_payout", reverse.Code);
    }

    [Fact]
    public async Task ReversalAfterPaidPayoutPreservesPayoutAndExposesRecovery()
    {
        using var h = await Harness.CreateAsync();
        var commission = await h.CommissionAsync(10m, Now.AddDays(-1));
        var prepared = await h.PrepareAsync([commission.Id], 10m, "recovery");
        var paid = await h.Service.MarkPaidAsync(h.ActorUserId, prepared.Summary.Id,
            new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                CommissionPayoutPaymentMethod.BankTransfer, "BANK-RECOVERY"));

        var reversed = await h.Billing.ReverseCommissionAsync(null, commission.Id,
            new ReverseSalesCommissionRequest("Customer refund"), default);
        var detail = await h.Service.GetAsync(paid.Summary.Id);

        Assert.Equal("IncludedInPaidPayout", reversed.PayoutClaimState);
        Assert.True(reversed.RequiresRecovery);
        Assert.Equal("Paid", detail.Summary.Status);
        Assert.Equal(10m, detail.Summary.RecoveryExposure);
        Assert.Equal(10m, detail.Summary.PreparedAmount);
        Assert.Equal("BANK-RECOVERY", detail.PaymentReference);
        Assert.True(Assert.Single(detail.Items).RequiresRecovery);
    }

    [Fact]
    public async Task LedgerPayableAndUnclaimedFilterExcludesPreparedReservations()
    {
        using var h = await Harness.CreateAsync();
        var reserved = await h.CommissionAsync(10m, Now.AddDays(-1));
        var available = await h.CommissionAsync(4m, Now.AddHours(-2));
        await h.PrepareAsync([reserved.Id], 10m, "ledger-filter");
        var reporting = new SalesReportingService(h.Db, h.Audit, h.Time);

        var (items, total) = await reporting.ListCommissionsAsync(new CommissionLedgerQuery
        {
            From = Now.AddDays(-7), ToExclusive = Now.AddDays(1),
            PayableAndUnclaimed = true,
        }, default);

        Assert.Equal(1, total);
        Assert.Equal(available.Id, Assert.Single(items).Id);
        Assert.Equal("Unclaimed", Assert.Single(items).PayoutClaimState);

        var (all, _) = await reporting.ListCommissionsAsync(new CommissionLedgerQuery
        {
            From = Now.AddDays(-7), ToExclusive = Now.AddDays(1),
        }, default);
        Assert.Equal("ReservedInPreparedPayout", all.Single(item => item.Id == reserved.Id).PayoutClaimState);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, CommissionPayoutService service,
            MerchantBillingService billing, AuditLogService audit, MutableTime time,
            Guid actorUserId, Guid adminUserId, Salesperson salesperson)
        {
            Db = db; Service = service; Billing = billing; Audit = audit; Time = time;
            ActorUserId = actorUserId; AdminUserId = adminUserId; Salesperson = salesperson;
        }
        public MyPetLinkDbContext Db { get; }
        public CommissionPayoutService Service { get; }
        public MerchantBillingService Billing { get; }
        public AuditLogService Audit { get; }
        public MutableTime Time { get; }
        public Guid ActorUserId { get; }
        public Guid AdminUserId { get; }
        public Salesperson Salesperson { get; }

        public static async Task<Harness> CreateAsync()
        {
            var time = new MutableTime(Now);
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options, time);
            var user = new User { Email = "admin@example.com", NormalizedEmail = "ADMIN@EXAMPLE.COM", DisplayName = "Finance Admin", Status = UserStatus.Active };
            var admin = new AdminUser { User = user, Role = AdminRole.SuperAdmin, IsActive = true };
            var salesperson = new Salesperson { SalespersonCode = "MPL-SALES-001", Name = "Aina Rep", Email = "aina@example.com", Phone = "+60120000001" };
            db.AddRange(admin, salesperson, new BusinessIdentitySetting
            {
                Id = BusinessIdentityService.SettingsId, BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions", BusinessRegistrationNumber = "AS0515813-P",
                RegisteredAddressLine1 = "12 Jalan Teknologi", RegisteredPostcode = "57000",
                RegisteredCity = "Kuala Lumpur", RegisteredState = "Kuala Lumpur",
                RegisteredCountry = "Malaysia", SupportEmail = "support@mypetlink.com.my",
                RowVersion = [1], UpdatedAt = Now,
            });
            await db.SaveChangesAsync();
            var audit = new AuditLogService(db, new HttpContextAccessor());
            var numbers = new DocumentNumberService(db);
            var identity = new BusinessIdentityService(db, audit, time);
            var gate = new EmailTemplateGate(db, Options.Create(new EmailOptions
            {
                Enabled = true, FromAddress = "support@mypetlink.com.my", FromName = "MyPetLink",
                OwnerPortalBaseUrl = "http://localhost:3000",
            }));
            return new Harness(db,
                new CommissionPayoutService(db, numbers, identity, audit, time),
                new MerchantBillingService(db, numbers, identity,
                    new MerchantEmailService(db, gate, audit, time), audit, time),
                audit, time, user.Id, admin.Id, salesperson);
        }

        public async Task<SalesCommission> CommissionAsync(decimal amount, DateTimeOffset calculatedAt,
            Guid? salespersonId = null)
        {
            var commission = new SalesCommission
            {
                SourceType = SalesCommissionSourceType.TagOrder,
                CommissionType = SalesCommissionType.DirectRetailPercentage,
                SalespersonId = salespersonId ?? Salesperson.Id,
                SalespersonCodeSnapshot = salespersonId.HasValue ? "MPL-SALES-999" : Salesperson.SalespersonCode,
                SalespersonNameSnapshot = salespersonId.HasValue ? "Other Rep" : Salesperson.Name,
                CommissionPercentageSnapshot = 5m,
                CommissionBaseAmount = amount * 20m,
                CommissionAmount = amount,
                Currency = "MYR", Status = SalesCommissionStatus.Payable,
                CalculatedAt = calculatedAt, CreatedAt = calculatedAt, UpdatedAt = calculatedAt,
            };
            Db.SalesCommissions.Add(commission);
            await Db.SaveChangesAsync();
            return commission;
        }

        public PrepareCommissionPayoutRequest Request(IReadOnlyCollection<Guid> ids, decimal total, string key) =>
            new(ids, Salesperson.Id, Now.AddDays(-7), Now.AddDays(1), total, key, "September payout");
        public Task<CommissionPayoutResponse> PrepareAsync(IReadOnlyCollection<Guid> ids, decimal total, string key) =>
            Service.PrepareAsync(ActorUserId, Request(ids, total, key));
        public void Dispose() => Db.Dispose();
    }

    public sealed class MutableTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }
}
