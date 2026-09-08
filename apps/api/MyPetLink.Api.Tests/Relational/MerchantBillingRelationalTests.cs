using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
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

    [RelationalFact]
    public async Task FilteredUniqueIndexAllowsReversedHistoryButOnlyOneValidCommissionPerOrder()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seeded = await SeedTwoPaymentsForOneOrderAsync(db);

        db.SalesCommissions.Add(NewCommission(seeded.MerchantId, seeded.OrderId, seeded.FirstPaymentId,
            seeded.SalespersonId, SalesCommissionStatus.Reversed));
        db.SalesCommissions.Add(NewCommission(seeded.MerchantId, seeded.OrderId, seeded.SecondPaymentId,
            seeded.SalespersonId, SalesCommissionStatus.Payable));
        await db.SaveChangesAsync();

        var thirdPayment = new MerchantPayment
        {
            MerchantInvoiceId = seeded.ThirdInvoiceId,
            MerchantOrderId = seeded.OrderId,
            AmountReceived = 100m,
            PaymentDate = DateTimeOffset.UtcNow,
            Method = MerchantPaymentMethod.BankTransfer,
            RecordedAt = DateTimeOffset.UtcNow,
        };
        db.MerchantPayments.Add(thirdPayment);
        await db.SaveChangesAsync();
        db.SalesCommissions.Add(NewCommission(seeded.MerchantId, seeded.OrderId, thirdPayment.Id,
            seeded.SalespersonId, SalesCommissionStatus.Paid));

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        Assert.Equal(2, await db.SalesCommissions.CountAsync());
        Assert.Equal(1, await db.SalesCommissions.CountAsync(
            item => item.Status != SalesCommissionStatus.Reversed));
    }

    [RelationalFact]
    public async Task AcquisitionBonusIsUniquePerMerchantEvenAfterReversal()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seeded = await SeedTwoPaymentsForOneOrderAsync(db);

        db.SalesCommissions.Add(NewResellerCommission(
            seeded.MerchantId, seeded.OrderId, seeded.FirstPaymentId,
            seeded.SalespersonId, SalesCommissionType.ResellerAcquisitionBonus,
            SalesCommissionStatus.Reversed));
        await db.SaveChangesAsync();
        db.SalesCommissions.Add(NewResellerCommission(
            seeded.MerchantId, seeded.OrderId, seeded.SecondPaymentId,
            seeded.SalespersonId, SalesCommissionType.ResellerAcquisitionBonus,
            SalesCommissionStatus.Payable));

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        Assert.Single(await db.SalesCommissions.Where(item =>
            item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).ToListAsync());
    }

    [RelationalFact]
    public async Task ConcurrentAcquisitionBonusCreationHasExactlyOneWinner()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        SeedResult seeded;
        await using (var seed = scope.NewContext())
            seeded = await SeedTwoPaymentsForOneOrderAsync(seed);

        using var gate = new SemaphoreSlim(0, 2);
        async Task<bool> TryCreateAsync(Guid paymentId)
        {
            await using var db = scope.NewContext();
            db.SalesCommissions.Add(NewResellerCommission(
                seeded.MerchantId, seeded.OrderId, paymentId, seeded.SalespersonId,
                SalesCommissionType.ResellerAcquisitionBonus, SalesCommissionStatus.Payable));
            await gate.WaitAsync();
            try
            {
                await db.SaveChangesAsync();
                return true;
            }
            catch (DbUpdateException)
            {
                return false;
            }
        }

        var first = TryCreateAsync(seeded.FirstPaymentId);
        var second = TryCreateAsync(seeded.SecondPaymentId);
        gate.Release(2);
        var outcomes = await Task.WhenAll(first, second);

        Assert.Single(outcomes, item => item);
        await using var verify = scope.NewContext();
        Assert.Single(await verify.SalesCommissions.Where(item =>
            item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).ToListAsync());
    }

    [RelationalFact]
    public async Task ConcurrentCommissionCreationForOneOrderHasExactlyOneWinner()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        SeedResult seeded;
        await using (var seed = scope.NewContext())
        {
            seeded = await SeedTwoPaymentsForOneOrderAsync(seed);
        }

        using var gate = new SemaphoreSlim(0, 2);
        async Task<bool> TryCreateAsync(Guid paymentId)
        {
            await using var db = scope.NewContext();
            db.SalesCommissions.Add(NewCommission(
                seeded.MerchantId, seeded.OrderId, paymentId, seeded.SalespersonId, SalesCommissionStatus.Payable));
            await gate.WaitAsync();
            try
            {
                await db.SaveChangesAsync();
                return true;
            }
            catch (DbUpdateException)
            {
                return false;
            }
        }

        var first = TryCreateAsync(seeded.FirstPaymentId);
        var second = TryCreateAsync(seeded.SecondPaymentId);
        gate.Release(2);
        var results = await Task.WhenAll(first, second);

        Assert.Single(results, value => value);
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.SalesCommissions.CountAsync());
    }

    [RelationalFact]
    public async Task ConcurrentPaymentCreationForOneInvoiceHasExactlyOneWinner()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        SeedResult seeded;
        await using (var seed = scope.NewContext())
        {
            seeded = await SeedTwoPaymentsForOneOrderAsync(seed);
        }

        using var gate = new SemaphoreSlim(0, 2);
        async Task<bool> TryCreateAsync(string reference)
        {
            await using var db = scope.NewContext();
            db.MerchantPayments.Add(new MerchantPayment
            {
                MerchantInvoiceId = seeded.ThirdInvoiceId,
                MerchantOrderId = seeded.OrderId,
                AmountReceived = 100m,
                PaymentDate = DateTimeOffset.UtcNow,
                Method = MerchantPaymentMethod.BankTransfer,
                TransactionReference = reference,
                RecordedAt = DateTimeOffset.UtcNow,
            });
            await gate.WaitAsync();
            try
            {
                await db.SaveChangesAsync();
                return true;
            }
            catch (DbUpdateException)
            {
                return false;
            }
        }

        var first = TryCreateAsync("PAYMENT-A");
        var second = TryCreateAsync("PAYMENT-B");
        gate.Release(2);
        var results = await Task.WhenAll(first, second);

        Assert.Single(results, value => value);
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.MerchantPayments.CountAsync(
            item => item.MerchantInvoiceId == seeded.ThirdInvoiceId));
    }

    [RelationalFact]
    public async Task CommissionRowVersionPreventsConcurrentPayoutUpdates()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid commissionId;
        await using (var seed = scope.NewContext())
        {
            var graph = await SeedTwoPaymentsForOneOrderAsync(seed);
            var commission = NewCommission(graph.MerchantId, graph.OrderId, graph.FirstPaymentId,
                graph.SalespersonId, SalesCommissionStatus.Payable);
            seed.SalesCommissions.Add(commission);
            await seed.SaveChangesAsync();
            commissionId = commission.Id;
        }

        await using var first = scope.NewContext();
        await using var second = scope.NewContext();
        var firstCopy = await first.SalesCommissions.SingleAsync(item => item.Id == commissionId);
        var secondCopy = await second.SalesCommissions.SingleAsync(item => item.Id == commissionId);
        firstCopy.Status = SalesCommissionStatus.Paid;
        firstCopy.PaidAt = DateTimeOffset.UtcNow;
        secondCopy.Status = SalesCommissionStatus.Paid;
        secondCopy.PaidAt = DateTimeOffset.UtcNow.AddSeconds(1);

        await first.SaveChangesAsync();
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task RetailCommissionUniqueIndexRejectsDuplicateDirectCommission()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seeded = await SeedRetailOrderAsync(db);

        db.SalesCommissions.Add(NewRetailCommission(
            seeded.OrderId, seeded.SalespersonId,
            SalesCommissionType.DirectRetailPercentage,
            SalesCommissionStatus.Payable));
        await db.SaveChangesAsync();

        db.SalesCommissions.Add(NewRetailCommission(
            seeded.OrderId, seeded.SalespersonId,
            SalesCommissionType.DirectRetailPercentage,
            SalesCommissionStatus.Paid));
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        Assert.Single(await db.SalesCommissions.ToListAsync());
    }

    [RelationalFact]
    public async Task RetailCommissionUniqueIndexAllowsReversedHistory()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seeded = await SeedRetailOrderAsync(db);

        db.SalesCommissions.Add(NewRetailCommission(
            seeded.OrderId, seeded.SalespersonId,
            SalesCommissionType.DirectRetailPercentage,
            SalesCommissionStatus.Reversed));
        db.SalesCommissions.Add(NewRetailCommission(
            seeded.OrderId, seeded.SalespersonId,
            SalesCommissionType.DirectRetailPercentage,
            SalesCommissionStatus.Payable));
        await db.SaveChangesAsync();

        Assert.Equal(2, await db.SalesCommissions.CountAsync());
        Assert.Single(await db.SalesCommissions.Where(item =>
            item.Status != SalesCommissionStatus.Reversed).ToListAsync());
    }

    [RelationalFact]
    public async Task CommissionSourceDiscriminatorCannotContradictItsForeignKeyShape()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seeded = await SeedRetailOrderAsync(db);
        var contradictory = NewRetailCommission(
            seeded.OrderId,
            seeded.SalespersonId,
            SalesCommissionType.DirectRetailPercentage,
            SalesCommissionStatus.Payable);
        contradictory.SourceType = SalesCommissionSourceType.MerchantOrder;
        db.SalesCommissions.Add(contradictory);

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.False(await db.SalesCommissions.AnyAsync(item => item.Id == contradictory.Id));
    }

    [RelationalFact]
    public async Task SalespersonUserLinkAndGlobalRuleBusinessKeysAreDatabaseUnique()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var user = new User
        {
            Email = "linked@example.com",
            NormalizedEmail = "LINKED@EXAMPLE.COM",
            DisplayName = "Linked User"
        };
        db.Users.Add(user);
        db.Salespersons.Add(new Salesperson
        {
            SalespersonCode = "SP-LINK-1",
            Name = "First",
            UserId = user.Id
        });
        await db.SaveChangesAsync();

        db.Salespersons.Add(new Salesperson
        {
            SalespersonCode = "SP-LINK-2",
            Name = "Second",
            UserId = user.Id
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();

        db.CommissionRules.Add(new CommissionRule
        {
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            Percentage = 12m,
            Currency = "MYR",
            EffectiveFrom = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero),
            IsActive = false
        });
        await db.SaveChangesAsync();
        db.CommissionRules.Add(new CommissionRule
        {
            CommissionType = SalesCommissionType.DirectRetailPercentage,
            Percentage = 13m,
            Currency = "MYR",
            EffectiveFrom = new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero),
            IsActive = true
        });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    private static SalesCommission NewCommission(
        Guid merchantId, Guid orderId, Guid paymentId, Guid salespersonId, SalesCommissionStatus status) => new()
    {
        MerchantId = merchantId,
        MerchantOrderId = orderId,
        MerchantPaymentId = paymentId,
        SalespersonId = salespersonId,
        SalespersonCodeSnapshot = "SP-0001",
        SalespersonNameSnapshot = "Test Rep",
        CommissionPercentageSnapshot = 5m,
        CommissionBaseAmount = 100m,
        CommissionAmount = 5m,
        Status = status,
        CalculatedAt = DateTimeOffset.UtcNow,
        ReversedAt = status == SalesCommissionStatus.Reversed ? DateTimeOffset.UtcNow : null,
        ReversalReason = status == SalesCommissionStatus.Reversed ? "Historical reversal" : null,
    };

    private static SalesCommission NewRetailCommission(
        Guid orderId,
        Guid salespersonId,
        SalesCommissionType type,
        SalesCommissionStatus status) => new()
    {
        SourceType = SalesCommissionSourceType.TagOrder,
        CommissionType = type,
        TagOrderId = orderId,
        SalespersonId = salespersonId,
        SalespersonCodeSnapshot = "SP-RETAIL",
        SalespersonNameSnapshot = "Retail Seller",
        CommissionPercentageSnapshot = 15m,
        CommissionBaseAmount = 100m,
        CommissionAmount = 15m,
        Status = status,
        CalculatedAt = DateTimeOffset.UtcNow,
        ReversedAt = status == SalesCommissionStatus.Reversed ? DateTimeOffset.UtcNow : null,
        ReversalReason = status == SalesCommissionStatus.Reversed ? "Historical reversal" : null,
    };

    private static SalesCommission NewResellerCommission(
        Guid merchantId,
        Guid orderId,
        Guid paymentId,
        Guid salespersonId,
        SalesCommissionType type,
        SalesCommissionStatus status) => new()
    {
        SourceType = SalesCommissionSourceType.MerchantOrder,
        CommissionType = type,
        MerchantId = merchantId,
        MerchantOrderId = orderId,
        MerchantPaymentId = paymentId,
        SalespersonId = salespersonId,
        SalespersonCodeSnapshot = "SP-RESELLER",
        SalespersonNameSnapshot = "Reseller Rep",
        CommissionPercentageSnapshot = type == SalesCommissionType.ResellerRepeatPercentage ? 3m : null,
        CommissionFixedAmountSnapshot = type == SalesCommissionType.ResellerAcquisitionBonus ? 50m : null,
        CommissionBaseAmount = 100m,
        CommissionAmount = type == SalesCommissionType.ResellerAcquisitionBonus ? 50m : 3m,
        Status = status,
        CalculatedAt = DateTimeOffset.UtcNow,
        ReversedAt = status == SalesCommissionStatus.Reversed ? DateTimeOffset.UtcNow : null,
        ReversalReason = status == SalesCommissionStatus.Reversed ? "Historical reversal" : null,
    };

    private static async Task<(Guid OrderId, Guid SalespersonId)> SeedRetailOrderAsync(
        MyPetLinkDbContext db)
    {
        var owner = new User
        {
            Email = "retail-owner@example.com",
            NormalizedEmail = "RETAIL-OWNER@EXAMPLE.COM",
            DisplayName = "Retail Owner"
        };
        var pet = new Pet
        {
            OwnerUserId = owner.Id,
            Name = "Milo",
            Slug = $"milo-{Guid.NewGuid():N}",
            Species = "Cat"
        };
        var salesperson = new Salesperson
        {
            SalespersonCode = $"SP-{Guid.NewGuid():N}"[..12],
            Name = "Retail Seller"
        };
        var order = new TagOrder
        {
            OrderNumber = $"MPL-ORD-{Guid.NewGuid():N}",
            OwnerUserId = owner.Id,
            PetId = pet.Id,
            Amount = 100m,
            TotalAmount = 100m,
            RecipientName = owner.DisplayName,
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur"
        };
        db.AddRange(owner, pet, salesperson, order);
        await db.SaveChangesAsync();
        return (order.Id, salesperson.Id);
    }

    private static async Task<SeedResult> SeedTwoPaymentsForOneOrderAsync(
        MyPetLinkDbContext db)
    {
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-0001",
            Name = "Test Rep",
            DefaultCommissionPercentage = 5m,
        };
        var merchant = new Merchant
        {
            MerchantCode = "MER-0001",
            LegalBusinessName = "Test Merchant",
            ContactPerson = "Tester",
            ContactEmail = "test@example.com",
            ContactPhone = "+60123456789",
        };
        db.AddRange(salesperson, merchant);
        await db.SaveChangesAsync();

        var order = new MerchantOrder
        {
            MerchantOrderNumber = "MPL-B2B-ORD-TEST",
            MerchantId = merchant.Id,
            SalespersonId = salesperson.Id,
            SalespersonCodeSnapshot = salesperson.SalespersonCode,
            SalespersonNameSnapshot = salesperson.Name,
            SalespersonCommissionPercentageSnapshot = 5m,
            MerchandiseSubtotal = 100m,
            GrandTotal = 100m,
            PaymentStatus = MerchantOrderPaymentStatus.PaymentConfirmed,
        };
        db.MerchantOrders.Add(order);
        await db.SaveChangesAsync();

        MerchantInvoice Invoice(string number, MerchantInvoiceStatus status) => new()
        {
            InvoiceNumber = number,
            MerchantOrderId = order.Id,
            MerchantId = merchant.Id,
            MerchantOrderNumberSnapshot = order.MerchantOrderNumber,
            MerchantLegalNameSnapshot = merchant.LegalBusinessName,
            InvoiceDate = DateTimeOffset.UtcNow,
            DueDate = DateTimeOffset.UtcNow,
            MerchandiseSubtotal = 100m,
            GrandTotal = 100m,
            Status = status,
            IssuedAt = DateTimeOffset.UtcNow,
        };

        var firstInvoice = Invoice("MPL-INV-TEST-1", MerchantInvoiceStatus.Cancelled);
        var secondInvoice = Invoice("MPL-INV-TEST-2", MerchantInvoiceStatus.Cancelled);
        var thirdInvoice = Invoice("MPL-INV-TEST-3", MerchantInvoiceStatus.Paid);
        db.AddRange(firstInvoice, secondInvoice, thirdInvoice);
        await db.SaveChangesAsync();

        MerchantPayment Payment(MerchantInvoice invoice) => new()
        {
            MerchantInvoiceId = invoice.Id,
            MerchantOrderId = order.Id,
            AmountReceived = 100m,
            PaymentDate = DateTimeOffset.UtcNow,
            Method = MerchantPaymentMethod.BankTransfer,
            RecordedAt = DateTimeOffset.UtcNow,
        };

        var firstPayment = Payment(firstInvoice);
        var secondPayment = Payment(secondInvoice);
        db.AddRange(firstPayment, secondPayment);
        await db.SaveChangesAsync();

        return new SeedResult(
            merchant.Id, order.Id, salesperson.Id, firstPayment.Id, secondPayment.Id, thirdInvoice.Id);
    }

    private sealed record SeedResult(
        Guid MerchantId,
        Guid OrderId,
        Guid SalespersonId,
        Guid FirstPaymentId,
        Guid SecondPaymentId,
        Guid ThirdInvoiceId);
}
