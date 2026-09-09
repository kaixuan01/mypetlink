using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class CommissionPayoutRelationalTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-09T04:00:00Z");

    [RelationalFact]
    public async Task FilteredUniqueIndexAllowsReleasedHistoryButOnlyOneActiveClaim()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        await using var db = scope.NewContext();
        var first = NewPayout(seed, "PAYOUT-1", "key-1", CommissionPayoutStatus.Cancelled);
        var released = NewItem(first, seed.CommissionId);
        released.ReleasedAt = Now;
        released.ReleasedByAdminUserId = seed.AdminUserId;
        released.ReleaseReason = "Cancelled";
        first.Items.Add(released);
        db.CommissionPayouts.Add(first);
        await db.SaveChangesAsync();

        var second = NewPayout(seed, "PAYOUT-2", "key-2", CommissionPayoutStatus.Prepared);
        second.Items.Add(NewItem(second, seed.CommissionId));
        db.CommissionPayouts.Add(second);
        await db.SaveChangesAsync();

        var third = NewPayout(seed, "PAYOUT-3", "key-3", CommissionPayoutStatus.Prepared);
        third.Items.Add(NewItem(third, seed.CommissionId));
        db.CommissionPayouts.Add(third);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        Assert.Equal(2, await db.CommissionPayoutItems.CountAsync());
        Assert.Single(await db.CommissionPayoutItems.Where(item => item.ReleasedAt == null).ToListAsync());
    }

    [RelationalFact]
    public async Task ConcurrentPrepareForOneCommissionHasExactlyOneWinner()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PrepareAsync(string key)
        {
            await using var db = scope.NewContext();
            var service = Service(db);
            await gate.WaitAsync();
            try
            {
                await service.PrepareAsync(seed.ActorUserId,
                    new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                        Now.AddDays(-2), Now.AddDays(1), 10m, key));
                return "success";
            }
            catch (ApiException exception)
            {
                return exception.Code;
            }
        }

        var first = PrepareAsync("race-a");
        var second = PrepareAsync("race-b");
        gate.Release(2);
        var outcomes = await Task.WhenAll(first, second);

        Assert.Single(outcomes, item => item == "success");
        Assert.Single(outcomes, item => item is "commission_already_claimed" or "commission_selection_changed");
        await using var verify = scope.NewContext();
        Assert.Single(await verify.CommissionPayoutItems.Where(item => item.ReleasedAt == null).ToListAsync());
    }

    [RelationalFact]
    public async Task OverlappingSelectionsCannotPartiallyAttach()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        Guid secondId;
        Guid thirdId;
        await using (var db = scope.NewContext())
        {
            secondId = await AddCommissionAsync(db, seed, "OVERLAP-2");
            thirdId = await AddCommissionAsync(db, seed, "OVERLAP-3");
        }
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PrepareAsync(Guid[] ids, string key)
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).PrepareAsync(seed.ActorUserId,
                    new PrepareCommissionPayoutRequest(ids, seed.SalespersonId,
                        Now.AddDays(-2), Now.AddDays(1), 20m, key));
                return "success";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        var first = PrepareAsync([seed.CommissionId, secondId], "overlap-a");
        var second = PrepareAsync([secondId, thirdId], "overlap-b");
        gate.Release(2);
        var outcomes = await Task.WhenAll(first, second);

        Assert.Single(outcomes, item => item == "success");
        await using var verify = scope.NewContext();
        var payout = await verify.CommissionPayouts.Include(item => item.Items).SingleAsync();
        Assert.Equal(2, payout.Items.Count);
        Assert.Equal(2, await verify.CommissionPayoutItems.CountAsync(item => item.ReleasedAt == null));
    }

    [RelationalFact]
    public async Task PrepareRacingLegacyMarkPaidHasOneValidOutcome()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PrepareAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).PrepareAsync(seed.ActorUserId,
                    new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                        Now.AddDays(-2), Now.AddDays(1), 10m, "prepare-vs-paid"));
                return "prepared";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        async Task<string> MarkPaidAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Billing(db).MarkCommissionPaidAsync(seed.ActorUserId, seed.CommissionId, null, default);
                return "paid";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        var prepare = PrepareAsync();
        var paid = MarkPaidAsync();
        gate.Release(2);
        var outcomes = await Task.WhenAll(prepare, paid);

        Assert.Single(outcomes, item => item is "prepared" or "paid");
        await using var verify = scope.NewContext();
        var commission = await verify.SalesCommissions.SingleAsync();
        var payout = await verify.CommissionPayouts.Include(item => item.Items).SingleOrDefaultAsync();
        if (payout is null)
            Assert.Equal(SalesCommissionStatus.Paid, commission.Status);
        else
        {
            Assert.Equal(CommissionPayoutStatus.Prepared, payout.Status);
            Assert.Equal(SalesCommissionStatus.Payable, commission.Status);
            Assert.Single(payout.Items);
        }
    }

    [RelationalFact]
    public async Task PrepareRacingReversalHasOneValidOutcome()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PrepareAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).PrepareAsync(seed.ActorUserId,
                    new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                        Now.AddDays(-2), Now.AddDays(1), 10m, "prepare-vs-reversal"));
                return "prepared";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        async Task<string> ReverseAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Billing(db).ReverseCommissionAsync(seed.ActorUserId, seed.CommissionId,
                    new ReverseSalesCommissionRequest("Concurrent invalidation"), default);
                return "reversed";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        var prepare = PrepareAsync();
        var reverse = ReverseAsync();
        gate.Release(2);
        var outcomes = await Task.WhenAll(prepare, reverse);

        Assert.Single(outcomes, item => item is "prepared" or "reversed");
        await using var verify = scope.NewContext();
        var commission = await verify.SalesCommissions.SingleAsync();
        var payout = await verify.CommissionPayouts.Include(item => item.Items).SingleOrDefaultAsync();
        if (payout is null)
            Assert.Equal(SalesCommissionStatus.Reversed, commission.Status);
        else
        {
            Assert.Equal(CommissionPayoutStatus.Prepared, payout.Status);
            Assert.Equal(SalesCommissionStatus.Payable, commission.Status);
            Assert.Single(payout.Items);
        }
    }

    [RelationalFact]
    public async Task PayoutRowVersionAndStateConstraintRejectConflictingWrites()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        Guid payoutId;
        string staleToken;
        await using (var db = scope.NewContext())
        {
            var payout = await Service(db).PrepareAsync(seed.ActorUserId,
                new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                    Now.AddDays(-2), Now.AddDays(1), 10m, "rowversion"));
            payoutId = payout.Summary.Id;
            staleToken = payout.Summary.ConcurrencyToken;
        }
        await using var first = scope.NewContext();
        await using var second = scope.NewContext();
        var firstCopy = await first.CommissionPayouts.SingleAsync(item => item.Id == payoutId);
        var secondCopy = await second.CommissionPayouts.SingleAsync(item => item.Id == payoutId);
        firstCopy.Notes = "First edit";
        secondCopy.Notes = "Second edit";
        await first.SaveChangesAsync();
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());

        await using var serviceContext = scope.NewContext();
        var stale = await Assert.ThrowsAsync<ApiException>(() => Service(serviceContext).CancelAsync(
            seed.ActorUserId, payoutId, new CancelCommissionPayoutRequest(staleToken, "Stale request")));
        Assert.Equal("concurrency_conflict", stale.Code);

        await using var invalid = scope.NewContext();
        var invalidPayout = await invalid.CommissionPayouts.SingleAsync(item => item.Id == payoutId);
        invalidPayout.Status = CommissionPayoutStatus.Paid;
        await Assert.ThrowsAsync<DbUpdateException>(() => invalid.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task ConcurrentPaidRetriesFinalizeOnceWithoutDoublePaying()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        CommissionPayoutResponse prepared;
        await using (var db = scope.NewContext())
            prepared = await Service(db).PrepareAsync(seed.ActorUserId,
                new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                    Now.AddDays(-2), Now.AddDays(1), 10m, "double-pay"));
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PayAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).MarkPaidAsync(seed.ActorUserId, prepared.Summary.Id,
                    new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                        CommissionPayoutPaymentMethod.BankTransfer, "BANK-SAME"));
                return "success";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        var first = PayAsync();
        var second = PayAsync();
        gate.Release(2);
        var outcomes = await Task.WhenAll(first, second);

        Assert.All(outcomes, item => Assert.Equal("success", item));
        await using var verify = scope.NewContext();
        Assert.Equal(CommissionPayoutStatus.Paid,
            (await verify.CommissionPayouts.SingleAsync()).Status);
        Assert.Equal(SalesCommissionStatus.Paid,
            (await verify.SalesCommissions.SingleAsync()).Status);
        Assert.Single(await verify.AuditLogs.Where(item => item.Action == "commission-payout.paid").ToListAsync());
    }

    [RelationalFact]
    public async Task ConcurrentPayAndCancelCannotPartiallyWin()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var seed = await SeedAsync(scope);
        CommissionPayoutResponse prepared;
        await using (var db = scope.NewContext())
            prepared = await Service(db).PrepareAsync(seed.ActorUserId,
                new PrepareCommissionPayoutRequest([seed.CommissionId], seed.SalespersonId,
                    Now.AddDays(-2), Now.AddDays(1), 10m, "pay-cancel"));
        using var gate = new SemaphoreSlim(0, 2);
        async Task<string> PayAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).MarkPaidAsync(seed.ActorUserId, prepared.Summary.Id,
                    new MarkCommissionPayoutPaidRequest(prepared.Summary.ConcurrencyToken,
                        CommissionPayoutPaymentMethod.BankTransfer, "BANK-RACE"));
                return "paid";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        async Task<string> CancelAsync()
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            try
            {
                await Service(db).CancelAsync(seed.ActorUserId, prepared.Summary.Id,
                    new CancelCommissionPayoutRequest(prepared.Summary.ConcurrencyToken, "Race cancellation"));
                return "cancelled";
            }
            catch (ApiException exception) { return exception.Code; }
        }
        var pay = PayAsync();
        var cancel = CancelAsync();
        gate.Release(2);
        var outcomes = await Task.WhenAll(pay, cancel);

        Assert.Single(outcomes, item => item is "paid" or "cancelled");
        await using var verify = scope.NewContext();
        var payout = await verify.CommissionPayouts.Include(item => item.Items).SingleAsync();
        var commission = await verify.SalesCommissions.SingleAsync();
        if (payout.Status == CommissionPayoutStatus.Paid)
        {
            Assert.Equal(SalesCommissionStatus.Paid, commission.Status);
            Assert.All(payout.Items, item => Assert.Null(item.ReleasedAt));
        }
        else
        {
            Assert.Equal(CommissionPayoutStatus.Cancelled, payout.Status);
            Assert.Equal(SalesCommissionStatus.Payable, commission.Status);
            Assert.All(payout.Items, item => Assert.NotNull(item.ReleasedAt));
        }
    }

    private static CommissionPayoutService Service(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new CommissionPayoutService(db, new DocumentNumberService(db),
            new BusinessIdentityService(db, audit, TimeProvider.System), audit, TimeProvider.System);
    }

    private static MerchantBillingService Billing(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var identity = new BusinessIdentityService(db, audit, TimeProvider.System);
        var gate = new EmailTemplateGate(db, Options.Create(new EmailOptions
        {
            Enabled = true, FromAddress = "support@mypetlink.com.my", FromName = "MyPetLink",
            OwnerPortalBaseUrl = "http://localhost:3000",
        }));
        return new MerchantBillingService(db, new DocumentNumberService(db), identity,
            new MerchantEmailService(db, gate, audit, TimeProvider.System), audit, TimeProvider.System);
    }

    private static async Task<Guid> AddCommissionAsync(MyPetLinkDbContext db, Seed seed, string suffix)
    {
        var owner = await db.Users.SingleAsync(item => item.Email.StartsWith("owner-"));
        var pet = await db.Pets.SingleAsync(item => item.OwnerUserId == owner.Id);
        var order = new TagOrder
        {
            OrderNumber = $"MPL-ORD-{suffix}", OwnerUserId = owner.Id, PetId = pet.Id,
            Amount = 200m, TotalAmount = 200m, Currency = "MYR", RecipientName = "Owner",
            DeliveryPhoneE164 = "+60123456789", AddressLine1 = "1 Jalan Test",
            Postcode = "50000", City = "Kuala Lumpur", State = "Kuala Lumpur",
        };
        db.TagOrders.Add(order);
        await db.SaveChangesAsync();
        var commission = new SalesCommission
        {
            SourceType = SalesCommissionSourceType.TagOrder,
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            TagOrderId = order.Id, SalespersonId = seed.SalespersonId,
            SalespersonCodeSnapshot = "MPL-SALES-001", SalespersonNameSnapshot = "Aina Rep",
            CommissionPercentageSnapshot = 5m, CommissionBaseAmount = 200m,
            CommissionAmount = 10m, Currency = "MYR", Status = SalesCommissionStatus.Payable,
            CalculatedAt = Now.AddHours(-2), CreatedAt = Now.AddHours(-2), UpdatedAt = Now.AddHours(-2),
        };
        db.SalesCommissions.Add(commission);
        await db.SaveChangesAsync();
        return commission.Id;
    }

    private static async Task<Seed> SeedAsync(RelationalScope scope)
    {
        await using var db = scope.NewContext();
        var actor = new User
        {
            Email = $"finance-{Guid.NewGuid():N}@example.com",
            NormalizedEmail = $"FINANCE-{Guid.NewGuid():N}@EXAMPLE.COM",
            DisplayName = "Finance Admin",
            Status = UserStatus.Active,
        };
        var admin = new AdminUser { User = actor, Role = AdminRole.SuperAdmin, IsActive = true };
        var owner = new User
        {
            Email = $"owner-{Guid.NewGuid():N}@example.com",
            NormalizedEmail = $"OWNER-{Guid.NewGuid():N}@EXAMPLE.COM",
            DisplayName = "Owner",
        };
        var pet = new Pet { OwnerUserId = owner.Id, Name = "Milo", Slug = $"milo-{Guid.NewGuid():N}", Species = "Cat" };
        var salesperson = new Salesperson { SalespersonCode = "MPL-SALES-001", Name = "Aina Rep" };
        var order = new TagOrder
        {
            OrderNumber = $"MPL-ORD-{Guid.NewGuid():N}", OwnerUserId = owner.Id, PetId = pet.Id,
            Amount = 200m, TotalAmount = 200m, Currency = "MYR", RecipientName = "Owner",
            DeliveryPhoneE164 = "+60123456789", AddressLine1 = "1 Jalan Test",
            Postcode = "50000", City = "Kuala Lumpur", State = "Kuala Lumpur",
        };
        db.AddRange(admin, owner, pet, salesperson, order);
        var identity = await db.BusinessIdentitySettings.SingleAsync(
            item => item.Id == BusinessIdentityService.SettingsId);
        identity.BrandName = "MyPetLink";
        identity.LegalBusinessName = "GBB Software Solutions";
        identity.BusinessRegistrationNumber = "AS0515813-P";
        identity.RegisteredAddressLine1 = "12 Jalan Teknologi";
        identity.RegisteredPostcode = "57000";
        identity.RegisteredCity = "Kuala Lumpur";
        identity.RegisteredState = "Kuala Lumpur";
        identity.RegisteredCountry = "Malaysia";
        identity.SupportEmail = "support@mypetlink.com.my";
        identity.UpdatedAt = Now;
        await db.SaveChangesAsync();
        var commission = new SalesCommission
        {
            SourceType = SalesCommissionSourceType.TagOrder,
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            TagOrderId = order.Id, SalespersonId = salesperson.Id,
            SalespersonCodeSnapshot = salesperson.SalespersonCode,
            SalespersonNameSnapshot = salesperson.Name,
            CommissionPercentageSnapshot = 5m, CommissionBaseAmount = 200m,
            CommissionAmount = 10m, Currency = "MYR", Status = SalesCommissionStatus.Payable,
            CalculatedAt = Now.AddDays(-1), CreatedAt = Now.AddDays(-1), UpdatedAt = Now.AddDays(-1),
        };
        db.SalesCommissions.Add(commission);
        await db.SaveChangesAsync();
        return new(actor.Id, admin.Id, salesperson.Id, commission.Id);
    }

    private static CommissionPayout NewPayout(Seed seed, string number, string key,
        CommissionPayoutStatus status)
    {
        var payout = new CommissionPayout
        {
            PayoutNumber = number, SalespersonId = seed.SalespersonId,
            SalespersonCodeSnapshot = "MPL-SALES-001", SalespersonNameSnapshot = "Aina Rep",
            Seller = Seller(), PeriodFrom = Now.AddDays(-2), PeriodToExclusive = Now,
            Currency = "MYR", PreparedAmount = 10m, Status = status,
            PreparedAt = Now, PreparedByAdminUserId = seed.AdminUserId,
            IdempotencyKey = key, RequestFingerprint = new string('A', 64),
            CreatedAt = Now, UpdatedAt = Now,
        };
        if (status == CommissionPayoutStatus.Cancelled)
        {
            payout.CancelledAt = Now;
            payout.CancelledByAdminUserId = seed.AdminUserId;
            payout.CancellationReason = "Cancelled";
        }
        return payout;
    }

    private static CommissionPayoutItem NewItem(CommissionPayout payout, Guid commissionId) => new()
    {
        CommissionPayout = payout, SalesCommissionId = commissionId,
        SourceTypeSnapshot = SalesCommissionSourceType.TagOrder,
        CommissionTypeSnapshot = SalesCommissionType.DirectRetailPercentage,
        TagOrderIdSnapshot = Guid.NewGuid(), SourceOrderNumberSnapshot = "MPL-ORD-TEST",
        CommissionBaseAmountSnapshot = 200m, CommissionAmountSnapshot = 10m,
        CommissionPercentageSnapshot = 5m, CurrencySnapshot = "MYR",
        CalculatedAtSnapshot = Now.AddDays(-1), CreatedAt = Now, UpdatedAt = Now,
    };

    private static SellerIdentitySnapshot Seller() => new()
    {
        BrandName = "MyPetLink", LegalBusinessName = "GBB Software Solutions",
        BusinessRegistrationNumber = "AS0515813-P", AddressLine1 = "12 Jalan Teknologi",
        Postcode = "57000", City = "Kuala Lumpur", State = "Kuala Lumpur",
        Country = "Malaysia", SupportEmail = "support@mypetlink.com.my",
    };

    private sealed record Seed(Guid ActorUserId, Guid AdminUserId, Guid SalespersonId, Guid CommissionId);
}
