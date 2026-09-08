using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class ResellerCommissionConcurrencyRelationalTests
{
    private static readonly DateTimeOffset Now =
        DateTimeOffset.Parse("2026-09-08T04:00:00Z");

    [RelationalFact]
    public async Task ConcurrentQualifyingPaymentsCreateOneAcquisitionBonus()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        SeededRelationship seeded;
        await using (var seed = scope.NewContext())
        {
            seeded = await SeedRelationshipAsync(seed, orderCount: 2);
        }

        using var gate = new SemaphoreSlim(0, 2);
        async Task PayAsync(Guid invoiceId, string reference)
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            await Billing(db).RecordPaymentAsync(null, invoiceId,
                Payment(reference, Now), default);
        }

        var first = PayAsync(seeded.InvoiceIds[0], "ACQ-CONCURRENT-A");
        var second = PayAsync(seeded.InvoiceIds[1], "ACQ-CONCURRENT-B");
        gate.Release(2);
        await Task.WhenAll(first, second);

        await using var verify = scope.NewContext();
        Assert.Single(await verify.SalesCommissions.Where(item =>
            item.MerchantId == seeded.MerchantId
            && item.CommissionType == SalesCommissionType.ResellerAcquisitionBonus).ToListAsync());
        Assert.Single(await verify.Merchants.Where(item =>
            item.Id == seeded.MerchantId
            && item.FirstQualifyingMerchantOrderId != null).ToListAsync());
        Assert.Equal(2, await verify.MerchantPayments.CountAsync());
    }

    [RelationalFact]
    public async Task ConcurrentRepeatPaymentRetryCreatesOneRepeatCommission()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        SeededRelationship seeded;
        await using (var seed = scope.NewContext())
        {
            seeded = await SeedRelationshipAsync(seed, orderCount: 2);
        }

        await using (var activation = scope.NewContext())
        {
            await Billing(activation).RecordPaymentAsync(null, seeded.InvoiceIds[0],
                Payment("ACQ-FIRST", Now), default);
        }

        using var gate = new SemaphoreSlim(0, 2);
        async Task<RecordMerchantPaymentResult> PayAsync(string reference)
        {
            await using var db = scope.NewContext();
            await gate.WaitAsync();
            return await Billing(db).RecordPaymentAsync(null, seeded.InvoiceIds[1],
                Payment(reference, Now.AddDays(1)), default);
        }

        var first = PayAsync("REPEAT-CONCURRENT-A");
        var second = PayAsync("REPEAT-CONCURRENT-B");
        gate.Release(2);
        var results = await Task.WhenAll(first, second);

        Assert.Single(results, result => !result.AlreadyRecorded);
        Assert.Single(results, result => result.AlreadyRecorded);
        await using var verify = scope.NewContext();
        Assert.Single(await verify.SalesCommissions.Where(item =>
            item.MerchantOrderId == seeded.OrderIds[1]
            && item.CommissionType == SalesCommissionType.ResellerRepeatPercentage).ToListAsync());
        Assert.Single(await verify.MerchantPayments.Where(item =>
            item.MerchantInvoiceId == seeded.InvoiceIds[1]).ToListAsync());
    }

    private static MerchantBillingService Billing(MyPetLinkDbContext db)
    {
        var time = new FixedTimeProvider(Now.AddDays(2));
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var email = new MerchantEmailService(
            db,
            new EmailTemplateGate(db, Options.Create(new EmailOptions())),
            audit,
            time);
        return new MerchantBillingService(
            db,
            new DocumentNumberService(db),
            null!,
            email,
            audit,
            time);
    }

    private static RecordMerchantPaymentRequest Payment(
        string reference, DateTimeOffset paymentDate) =>
        new(paymentDate, 125m, "BankTransfer", reference);

    private static async Task<SeededRelationship> SeedRelationshipAsync(
        MyPetLinkDbContext db, int orderCount)
    {
        var salesperson = new Salesperson
        {
            SalespersonCode = "SP-RES-CONC",
            Name = "Reseller Concurrency Rep",
            IsActive = true,
        };
        var merchant = new Merchant
        {
            MerchantCode = "MER-RES-CONC",
            LegalBusinessName = "Concurrent Reseller Sdn Bhd",
            ContactPerson = "Aina Rahman",
            ContactEmail = "orders@concurrent-reseller.example",
            ContactPhone = "+60123456789",
            BillingAddressLine1 = "12 Jalan Test",
            BillingPostcode = "50000",
            BillingCity = "Kuala Lumpur",
            BillingState = "Kuala Lumpur",
            DeliveryAddressLine1 = "12 Jalan Test",
            DeliveryPostcode = "50000",
            DeliveryCity = "Kuala Lumpur",
            DeliveryState = "Kuala Lumpur",
            AssignedSalesperson = salesperson,
            AcquiredBySalesperson = salesperson,
            AcquisitionAttributedAt = Now.AddDays(-1),
            CommissionPlan = MerchantCommissionPlan.AcquisitionAndRepeat,
            IsActive = true,
        };
        var product = new TagProduct
        {
            Name = "QR + NFC Smart Tag",
            Slug = "relational-reseller-tag",
            IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = "RELRESELLER000001",
            Sku = "REL-RES-NFC",
            DisplayName = "Standard",
            SupportsQr = true,
            SupportsNfc = true,
            TagVariant = "Standard",
            BasePrice = 19.90m,
            IsActive = true,
            IsPurchasable = true,
        };
        db.AddRange(salesperson, merchant, product, variant);
        db.CommissionRules.AddRange(
            new CommissionRule
            {
                CommissionType = SalesCommissionType.ResellerAcquisitionBonus,
                FixedAmount = 50m,
                MinQuantity = 10,
                MaxQuantity = 19,
                Currency = "MYR",
                EffectiveFrom = Now.AddYears(-1),
                IsActive = true,
            },
            new CommissionRule
            {
                CommissionType = SalesCommissionType.ResellerRepeatPercentage,
                Percentage = 3m,
                EligibilityMonths = 3,
                Currency = "MYR",
                EffectiveFrom = Now.AddYears(-1),
                IsActive = true,
            });

        var orders = new List<MerchantOrder>();
        var invoices = new List<MerchantInvoice>();
        for (var index = 0; index < orderCount; index++)
        {
            var order = NewOrder(merchant, product, variant, index);
            var invoice = NewInvoice(order, product, variant, index);
            orders.Add(order);
            invoices.Add(invoice);
        }

        db.MerchantOrders.AddRange(orders);
        db.MerchantInvoices.AddRange(invoices);
        await db.SaveChangesAsync();
        return new SeededRelationship(
            merchant.Id,
            orders.Select(item => item.Id).ToArray(),
            invoices.Select(item => item.Id).ToArray());
    }

    private static MerchantOrder NewOrder(
        Merchant merchant, TagProduct product, TagProductVariant variant, int index)
    {
        var order = new MerchantOrder
        {
            MerchantOrderNumber = $"MO-RES-CONC-{index + 1}",
            Merchant = merchant,
            MerchantCodeSnapshot = merchant.MerchantCode,
            MerchantLegalNameSnapshot = merchant.LegalBusinessName,
            ContactPersonSnapshot = merchant.ContactPerson,
            ContactEmailSnapshot = merchant.ContactEmail,
            ContactPhoneSnapshot = merchant.ContactPhone,
            BillingAddressLine1Snapshot = merchant.BillingAddressLine1,
            BillingPostcodeSnapshot = merchant.BillingPostcode,
            BillingCitySnapshot = merchant.BillingCity,
            BillingStateSnapshot = merchant.BillingState,
            BillingCountrySnapshot = merchant.BillingCountry,
            DeliveryAddressLine1Snapshot = merchant.DeliveryAddressLine1,
            DeliveryPostcodeSnapshot = merchant.DeliveryPostcode,
            DeliveryCitySnapshot = merchant.DeliveryCity,
            DeliveryStateSnapshot = merchant.DeliveryState,
            DeliveryCountrySnapshot = merchant.DeliveryCountry,
            MerchandiseSubtotal = 125m,
            GrandTotal = 125m,
            PaymentStatus = MerchantOrderPaymentStatus.AwaitingPayment,
        };
        order.Items.Add(new MerchantOrderItem
        {
            MerchantOrder = order,
            ProductId = product.Id,
            ProductVariantId = variant.Id,
            ProductNameSnapshot = product.Name,
            SkuCodeSnapshot = variant.Sku,
            OptionNameSnapshot = variant.DisplayName,
            SupportsQrSnapshot = true,
            SupportsNfcSnapshot = true,
            Quantity = 10,
            WholesaleUnitPrice = 12.50m,
            LineSubtotal = 125m,
        });
        return order;
    }

    private static MerchantInvoice NewInvoice(
        MerchantOrder order, TagProduct product, TagProductVariant variant, int index)
    {
        var invoice = new MerchantInvoice
        {
            InvoiceNumber = $"INV-RES-CONC-{index + 1}",
            MerchantOrder = order,
            Merchant = order.Merchant,
            MerchantCodeSnapshot = order.MerchantCodeSnapshot,
            MerchantLegalNameSnapshot = order.MerchantLegalNameSnapshot,
            ContactPersonSnapshot = order.ContactPersonSnapshot,
            ContactEmailSnapshot = order.ContactEmailSnapshot,
            ContactPhoneSnapshot = order.ContactPhoneSnapshot,
            BillingAddressLine1Snapshot = order.BillingAddressLine1Snapshot,
            BillingPostcodeSnapshot = order.BillingPostcodeSnapshot,
            BillingCitySnapshot = order.BillingCitySnapshot,
            BillingStateSnapshot = order.BillingStateSnapshot,
            BillingCountrySnapshot = order.BillingCountrySnapshot,
            MerchantOrderNumberSnapshot = order.MerchantOrderNumber,
            InvoiceDate = Now,
            DueDate = Now,
            MerchandiseSubtotal = 125m,
            GrandTotal = 125m,
            Status = MerchantInvoiceStatus.Issued,
            IssuedAt = Now,
            Seller = new SellerIdentitySnapshot
            {
                BrandName = "MyPetLink",
                LegalBusinessName = "GBB Software Solutions",
                BusinessRegistrationNumber = "AS0515813-P",
                AddressLine1 = "1 Jalan Seller",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur",
                Country = "Malaysia",
                SupportEmail = "support@mypetlink.com.my",
            },
        };
        invoice.Items.Add(new MerchantInvoiceItem
        {
            MerchantInvoice = invoice,
            ProductId = product.Id,
            ProductVariantId = variant.Id,
            ProductNameSnapshot = product.Name,
            SkuCodeSnapshot = variant.Sku,
            OptionNameSnapshot = variant.DisplayName,
            SupportsQrSnapshot = true,
            SupportsNfcSnapshot = true,
            Quantity = 10,
            WholesaleUnitPrice = 12.50m,
            LineSubtotal = 125m,
        });
        return invoice;
    }

    private sealed record SeededRelationship(
        Guid MerchantId, Guid[] OrderIds, Guid[] InvoiceIds);
}
