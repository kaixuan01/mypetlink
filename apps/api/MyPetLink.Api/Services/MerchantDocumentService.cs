using System.Reflection;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Renders the three merchant documents.
///
/// Everything printed comes from the snapshot stored on the record itself.
/// Nothing is re-read from business identity settings, the merchant profile,
/// the catalog or current prices, so correcting any of those tomorrow cannot
/// change a document a merchant already has.
/// </summary>
public interface IMerchantDocumentService
{
    Task<OrderDocumentResult> GetQuotationAsync(Guid quotationId, CancellationToken cancellationToken = default);
    Task<OrderDocumentResult> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<OrderDocumentResult> GetReceiptAsync(Guid receiptId, CancellationToken cancellationToken = default);

    /// <summary>The receipt belonging to an invoice, for the payment email.</summary>
    Task<OrderDocumentResult> GetReceiptForInvoiceAsync(
        Guid invoiceId, CancellationToken cancellationToken = default);

    /// <summary>The packing document that travels with the goods.</summary>
    Task<OrderDocumentResult> GetDeliveryOrderAsync(
        Guid deliveryOrderId, CancellationToken cancellationToken = default);
}

public sealed class MerchantDocumentService : IMerchantDocumentService
{
    private const string BrandName = "MyPetLink";
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);

    private readonly MyPetLinkDbContext _dbContext;

    public MerchantDocumentService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    // --- Quotation ---------------------------------------------------------

    public async Task<OrderDocumentResult> GetQuotationAsync(
        Guid quotationId, CancellationToken cancellationToken = default)
    {
        var quotation = await _dbContext.MerchantQuotations
            .AsNoTracking()
            .Include(item => item.Items)
            .SingleOrDefaultAsync(item => item.Id == quotationId, cancellationToken)
            ?? throw NotFound("merchant_quotation_not_found", "That quotation no longer exists.");

        // A draft has never been shown to anybody, so there is no issued
        // document to reproduce.
        if (quotation.Seller is null || quotation.Status == MerchantQuotationStatus.Draft)
        {
            throw new ApiException(409, "quotation_not_issued",
                "This quotation has not been sent yet. Send it to produce the document.");
        }

        var currency = quotation.Currency;
        var model = new MerchantDocumentModel(
            Kind: MerchantDocumentKind.Quotation,
            BrandLogo: LoadBrandLogo(),
            BrandName: BrandName,
            Seller: SellerParty(quotation.Seller),
            Merchant: new MerchantDocumentParty(
                quotation.MerchantLegalNameSnapshot,
                quotation.MerchantTradingNameSnapshot,
                quotation.MerchantRegistrationNumberSnapshot,
                quotation.MerchantTaxIdentificationNumberSnapshot,
                quotation.MerchantSstRegistrationNumberSnapshot,
                quotation.ContactPersonSnapshot,
                quotation.ContactEmailSnapshot,
                quotation.ContactPhoneSnapshot,
                Address(
                    quotation.BillingAddressLine1Snapshot, quotation.BillingAddressLine2Snapshot,
                    quotation.BillingPostcodeSnapshot, quotation.BillingCitySnapshot,
                    quotation.BillingStateSnapshot, quotation.BillingCountrySnapshot)),
            SupportEmail: quotation.Seller.SupportEmail,
            Website: quotation.Seller.BusinessWebsite,
            DocumentTitle: "Quotation",
            DocumentNumberLabel: "Quotation No.",
            DocumentNumber: quotation.QuotationNumber,
            DocumentRows:
            [
                ("Quotation No.", quotation.QuotationNumber),
                ("Quotation date", Date(quotation.QuotationDate)),
                ("Valid until", Date(quotation.ValidUntil)),
                ("Status", StatusLabel(quotation.Status)),
                ("Payment term", "Due on receipt"),
            ],
            PaymentRows: [],
            DeliveryAddressLines: DeliveryLinesWhenDifferent(quotation),
            Lines: Lines(quotation.Items
                .OrderBy(item => item.SortOrder)
                .Select(item => new LineInput(
                    item.ProductNameSnapshot, item.SkuCodeSnapshot, item.OptionNameSnapshot,
                    item.SupportsQrSnapshot, item.SupportsNfcSnapshot, item.Quantity,
                    item.WholesaleUnitPrice, item.LineDiscount, item.LineSubtotal)),
                currency),
            MerchandiseSubtotal: Money(currency, quotation.MerchandiseSubtotal),
            OrderDiscount: quotation.DiscountTotal > 0m
                ? $"− {Money(currency, quotation.DiscountTotal)}"
                : null,
            DeliveryFee: quotation.DeliveryFee <= 0m ? "Free" : Money(currency, quotation.DeliveryFee),
            TotalLabel: "Quotation total",
            TotalAmount: Money(currency, quotation.GrandTotal),
            Currency: currency,
            PaymentInstructions: null,
            CustomerNotes: quotation.CustomerNotes,
            ClosingNotice:
                "This is a quotation, not an invoice and not proof of payment. Prices are held "
                + "until the valid-until date above. An invoice is issued once the quotation is "
                + "accepted and converted into an order.",
            ShowPaidBadge: false);

        return new OrderDocumentResult(
            MerchantDocumentRenderer.Render(model),
            $"MyPetLink-Quotation-{SafeReference(quotation.QuotationNumber)}.pdf");
    }

    // --- Invoice -----------------------------------------------------------

    public async Task<OrderDocumentResult> GetInvoiceAsync(
        Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var invoice = await _dbContext.MerchantInvoices
            .AsNoTracking()
            .Include(item => item.Items)
            .SingleOrDefaultAsync(item => item.Id == invoiceId, cancellationToken)
            ?? throw NotFound("merchant_invoice_not_found", "That invoice no longer exists.");

        if (invoice.Status == MerchantInvoiceStatus.Draft)
        {
            throw new ApiException(409, "invoice_not_issued",
                "This invoice has not been issued yet.");
        }

        var currency = invoice.Currency;
        var paymentRows = new List<(string, string)>
        {
            ("Payment term", "Due on receipt"),
            ("Amount due", Money(currency, invoice.GrandTotal)),
        };

        // The same wording retail documents use. It states a fact about this
        // sale without implying a registration the business may not hold.
        paymentRows.Add(("SST", "Not applicable"));

        var bank = BankLines(invoice.Seller);
        if (bank.Count > 0)
        {
            paymentRows.AddRange(bank);
        }

        // Something the merchant can quote so the payment can be matched. The
        // invoice number is already public to them and carries no secret.
        paymentRows.Add(("Payment reference", invoice.InvoiceNumber));

        if (!string.IsNullOrWhiteSpace(invoice.Seller.PaymentInstructions))
        {
            paymentRows.Add(("How to pay", invoice.Seller.PaymentInstructions!));
        }

        var model = new MerchantDocumentModel(
            Kind: MerchantDocumentKind.Invoice,
            BrandLogo: LoadBrandLogo(),
            BrandName: BrandName,
            Seller: SellerParty(invoice.Seller),
            Merchant: new MerchantDocumentParty(
                invoice.MerchantLegalNameSnapshot,
                invoice.MerchantTradingNameSnapshot,
                invoice.MerchantRegistrationNumberSnapshot,
                invoice.MerchantTaxIdentificationNumberSnapshot,
                invoice.MerchantSstRegistrationNumberSnapshot,
                invoice.ContactPersonSnapshot,
                invoice.ContactEmailSnapshot,
                invoice.ContactPhoneSnapshot,
                Address(
                    invoice.BillingAddressLine1Snapshot, invoice.BillingAddressLine2Snapshot,
                    invoice.BillingPostcodeSnapshot, invoice.BillingCitySnapshot,
                    invoice.BillingStateSnapshot, invoice.BillingCountrySnapshot)),
            SupportEmail: invoice.Seller.SupportEmail,
            Website: invoice.Seller.BusinessWebsite,
            DocumentTitle: "Invoice",
            DocumentNumberLabel: "Invoice No.",
            DocumentNumber: invoice.InvoiceNumber,
            DocumentRows:
            [
                ("Invoice No.", invoice.InvoiceNumber),
                ("Invoice date", Date(invoice.InvoiceDate)),
                ("Due date", Date(invoice.DueDate)),
                ("Order No.", invoice.MerchantOrderNumberSnapshot),
                string.IsNullOrWhiteSpace(invoice.SourceQuotationNumberSnapshot)
                    ? ("", "")
                    : ("Quotation No.", invoice.SourceQuotationNumberSnapshot!),
                ("Status", invoice.Status == MerchantInvoiceStatus.Paid ? "Paid" : "Awaiting payment"),
            ],
            PaymentRows: paymentRows,
            DeliveryAddressLines: null,
            Lines: Lines(invoice.Items
                .OrderBy(item => item.SortOrder)
                .Select(item => new LineInput(
                    item.ProductNameSnapshot, item.SkuCodeSnapshot, item.OptionNameSnapshot,
                    item.SupportsQrSnapshot, item.SupportsNfcSnapshot, item.Quantity,
                    item.WholesaleUnitPrice, item.LineDiscount, item.LineSubtotal)),
                currency),
            MerchandiseSubtotal: Money(currency, invoice.MerchandiseSubtotal),
            OrderDiscount: invoice.DiscountTotal > 0m
                ? $"− {Money(currency, invoice.DiscountTotal)}"
                : null,
            DeliveryFee: invoice.DeliveryFee <= 0m ? "Free" : Money(currency, invoice.DeliveryFee),
            TotalLabel: "Amount due",
            TotalAmount: Money(currency, invoice.GrandTotal),
            Currency: currency,
            PaymentInstructions: null,
            CustomerNotes: null,
            ClosingNotice: invoice.Status == MerchantInvoiceStatus.Paid
                ? "This invoice has been settled in full. An official receipt has been issued separately."
                : "Payment is due on receipt. Your order is prepared once payment is confirmed.",
            ShowPaidBadge: false);

        return new OrderDocumentResult(
            MerchantDocumentRenderer.Render(model),
            $"MyPetLink-Invoice-{SafeReference(invoice.InvoiceNumber)}.pdf");
    }

    // --- Official receipt --------------------------------------------------

    public Task<OrderDocumentResult> GetReceiptAsync(
        Guid receiptId, CancellationToken cancellationToken = default) =>
        BuildReceiptAsync(
            _dbContext.MerchantReceipts.AsNoTracking().Include(item => item.Items)
                .SingleOrDefaultAsync(item => item.Id == receiptId, cancellationToken),
            cancellationToken);

    public Task<OrderDocumentResult> GetReceiptForInvoiceAsync(
        Guid invoiceId, CancellationToken cancellationToken = default) =>
        BuildReceiptAsync(
            _dbContext.MerchantReceipts.AsNoTracking().Include(item => item.Items)
                .SingleOrDefaultAsync(item => item.MerchantInvoiceId == invoiceId, cancellationToken),
            cancellationToken);

    private async Task<OrderDocumentResult> BuildReceiptAsync(
        Task<MerchantReceipt?> lookup, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var receipt = await lookup
            ?? throw NotFound("merchant_receipt_not_found", "That receipt no longer exists.");

        var currency = receipt.Currency;
        var paymentRows = new List<(string, string)>
        {
            ("Payment date", Date(receipt.PaymentDate)),
            ("Payment method", DTOs.MerchantBillingParsing.Describe(receipt.PaymentMethod)),
        };

        // Absent means absent. Printing a placeholder here would look like a
        // reference the merchant could quote back to their bank.
        if (!string.IsNullOrWhiteSpace(receipt.TransactionReference))
        {
            paymentRows.Add(("Transaction reference", receipt.TransactionReference!));
        }

        paymentRows.Add(("Amount received", Money(currency, receipt.AmountPaid)));
        paymentRows.Add(("SST", "Not applicable"));

        var model = new MerchantDocumentModel(
            Kind: MerchantDocumentKind.Receipt,
            BrandLogo: LoadBrandLogo(),
            BrandName: BrandName,
            Seller: SellerParty(receipt.Seller),
            Merchant: new MerchantDocumentParty(
                receipt.MerchantLegalNameSnapshot,
                receipt.MerchantTradingNameSnapshot,
                receipt.MerchantRegistrationNumberSnapshot,
                receipt.MerchantTaxIdentificationNumberSnapshot,
                null,
                receipt.ContactPersonSnapshot,
                receipt.ContactEmailSnapshot,
                null,
                Address(
                    receipt.BillingAddressLine1Snapshot, receipt.BillingAddressLine2Snapshot,
                    receipt.BillingPostcodeSnapshot, receipt.BillingCitySnapshot,
                    receipt.BillingStateSnapshot, receipt.BillingCountrySnapshot)),
            SupportEmail: receipt.Seller.SupportEmail,
            Website: receipt.Seller.BusinessWebsite,
            DocumentTitle: "Official Receipt",
            DocumentNumberLabel: "Receipt No.",
            DocumentNumber: receipt.ReceiptNumber,
            DocumentRows:
            [
                ("Receipt No.", receipt.ReceiptNumber),
                ("Receipt date", Date(receipt.IssuedAt)),
                ("Invoice No.", receipt.InvoiceNumberSnapshot),
                ("Order No.", receipt.MerchantOrderNumberSnapshot),
            ],
            PaymentRows: paymentRows,
            DeliveryAddressLines: null,
            Lines: Lines(receipt.Items
                .OrderBy(item => item.SortOrder)
                .Select(item => new LineInput(
                    item.ProductNameSnapshot, item.SkuCodeSnapshot, item.OptionNameSnapshot,
                    null, null, item.Quantity,
                    item.WholesaleUnitPrice, item.LineDiscount, item.LineSubtotal)),
                currency),
            MerchandiseSubtotal: Money(currency, receipt.MerchandiseSubtotal),
            OrderDiscount: receipt.DiscountTotal > 0m
                ? $"− {Money(currency, receipt.DiscountTotal)}"
                : null,
            DeliveryFee: receipt.DeliveryFee <= 0m ? "Free" : Money(currency, receipt.DeliveryFee),
            TotalLabel: "Total paid",
            TotalAmount: Money(currency, receipt.AmountPaid),
            Currency: currency,
            PaymentInstructions: null,
            CustomerNotes: null,
            ClosingNotice:
                "Payment received in full. Thank you for your business.",
            ShowPaidBadge: true);

        return new OrderDocumentResult(
            MerchantDocumentRenderer.Render(model),
            $"MyPetLink-Receipt-{SafeReference(receipt.ReceiptNumber)}.pdf");
    }

    // --- Shared mapping ----------------------------------------------------

    private sealed record LineInput(
        string ProductName, string SkuCode, string OptionName,
        bool? SupportsQr, bool? SupportsNfc, int Quantity,
        decimal UnitPrice, decimal LineDiscount, decimal LineSubtotal);

    private static IReadOnlyList<MerchantDocumentLine> Lines(
        IEnumerable<LineInput> items, string currency) =>
        items.Select(item => new MerchantDocumentLine(
            item.ProductName,
            item.SkuCode,
            item.OptionName,
            Capability(item.SupportsQr, item.SupportsNfc),
            item.Quantity,
            Money(currency, item.UnitPrice),
            item.LineDiscount > 0m ? $"− {Money(currency, item.LineDiscount)}" : null,
            Money(currency, item.LineSubtotal))).ToList();

    private static string? Capability(bool? supportsQr, bool? supportsNfc) =>
        (supportsQr, supportsNfc) switch
        {
            (true, true) => "QR + NFC Smart Tag",
            (true, false) => "QR Pet Tag",
            (false, true) => "NFC Smart Tag",
            // A receipt line does not store capability. Omit the row rather
            // than print a vaguer label than the invoice used for the same
            // item; the SKU and option above already identify it.
            _ => null,
        };


    // --- Delivery order ----------------------------------------------------

    /// <summary>
    /// Renders the delivery order from its own snapshot and nothing else. No
    /// business identity lookup, no merchant record, no catalog, no courier
    /// configuration and no invoice: a document reprinted next year must say
    /// exactly what the copy in the box said.
    /// </summary>
    public async Task<OrderDocumentResult> GetDeliveryOrderAsync(
        Guid deliveryOrderId, CancellationToken cancellationToken = default)
    {
        var document = await _dbContext.MerchantDeliveryOrders
            .AsNoTracking()
            .Include(item => item.Items)
            .SingleOrDefaultAsync(item => item.Id == deliveryOrderId, cancellationToken)
            ?? throw NotFound(
                "merchant_delivery_order_not_found", "That delivery order no longer exists.");

        var model = new MerchantDocumentModel(
            Kind: MerchantDocumentKind.DeliveryOrder,
            BrandLogo: LoadBrandLogo(),
            BrandName: BrandName,
            Seller: SellerParty(document.Seller),
            Merchant: new MerchantDocumentParty(
                document.MerchantLegalNameSnapshot,
                document.MerchantTradingNameSnapshot,
                null,
                null,
                null,
                document.ContactPersonSnapshot,
                document.ContactEmailSnapshot,
                document.ContactPhoneSnapshot,
                Address(
                    document.DeliveryAddressLine1Snapshot,
                    document.DeliveryAddressLine2Snapshot,
                    document.DeliveryPostcodeSnapshot,
                    document.DeliveryCitySnapshot,
                    document.DeliveryStateSnapshot,
                    document.DeliveryCountrySnapshot)),
            SupportEmail: document.Seller.SupportEmail,
            Website: document.Seller.BusinessWebsite,
            DocumentTitle: "Delivery Order",
            DocumentNumberLabel: "Delivery Order No.",
            DocumentNumber: document.DeliveryOrderNumber,
            DocumentRows: DeliveryRows(document),
            PaymentRows: [],
            DeliveryAddressLines: null,
            Lines: document.Items
                .OrderBy(item => item.ProductNameSnapshot)
                .ThenBy(item => item.SkuCodeSnapshot)
                .Select(item => new MerchantDocumentLine(
                    item.ProductNameSnapshot,
                    item.SkuCodeSnapshot,
                    item.OptionNameSnapshot,
                    Capability(item.SupportsQrSnapshot, item.SupportsNfcSnapshot),
                    item.AllocatedQuantity,
                    UnitPrice: "",
                    LineDiscount: null,
                    LineSubtotal: "",
                    BatchSummary: item.BatchSummarySnapshot))
                .ToList(),
            MerchandiseSubtotal: null,
            OrderDiscount: null,
            DeliveryFee: null,
            TotalLabel: null,
            TotalAmount: null,
            Currency: MerchantSalesConstants.Currency,
            PaymentInstructions: null,
            CustomerNotes: null,
            ClosingNotice:
                "This Delivery Order records the goods prepared for delivery and is not an "
                + "invoice or proof of payment.",
            ShowPaidBadge: false,
            ShowReceivingBlock: true);

        return new OrderDocumentResult(
            MerchantDocumentRenderer.Render(model),
            $"MyPetLink-Delivery-Order-{SafeReference(document.DeliveryOrderNumber)}.pdf");
    }

    private static IReadOnlyList<(string Label, string Value)> DeliveryRows(
        MerchantDeliveryOrder document)
    {
        var rows = new List<(string, string)>
        {
            ("Delivery Order No.", document.DeliveryOrderNumber),
            ("Merchant Order No.", document.MerchantOrderNumberSnapshot),
            ("Issue date", Date(document.IssuedAt)),
        };

        // A delivery order legitimately exists before the parcel leaves, so
        // the shipment lines only appear once there is something to say.
        if (!string.IsNullOrWhiteSpace(document.CourierProviderSnapshot))
        {
            rows.Add(("Courier", document.CourierProviderSnapshot!));
        }
        if (!string.IsNullOrWhiteSpace(document.CourierServiceSnapshot))
        {
            rows.Add(("Service", document.CourierServiceSnapshot!));
        }
        if (!string.IsNullOrWhiteSpace(document.TrackingNumberSnapshot))
        {
            rows.Add(("Tracking number", document.TrackingNumberSnapshot!));
        }

        return rows;
    }

    private static MerchantDocumentParty SellerParty(SellerIdentitySnapshot seller) =>
        new(
            seller.LegalBusinessName,
            seller.BrandName,
            seller.BusinessRegistrationNumber,
            seller.TaxIdentificationNumber,
            seller.SstRegistrationNumber,
            null,
            seller.SupportEmail,
            seller.BusinessPhone,
            Address(
                seller.AddressLine1, seller.AddressLine2, seller.Postcode,
                seller.City, seller.State, seller.Country));

    private static List<(string, string)> BankLines(SellerIdentitySnapshot seller)
    {
        var rows = new List<(string, string)>();
        if (!string.IsNullOrWhiteSpace(seller.BankName))
            rows.Add(("Bank", seller.BankName!));
        if (!string.IsNullOrWhiteSpace(seller.BankAccountName))
            rows.Add(("Account name", seller.BankAccountName!));
        if (!string.IsNullOrWhiteSpace(seller.BankAccountNumber))
            rows.Add(("Account number", seller.BankAccountNumber!));
        if (!string.IsNullOrWhiteSpace(seller.DuitNowDisplayName))
            rows.Add(("DuitNow", seller.DuitNowDisplayName!));
        return rows;
    }

    private static IReadOnlyList<string> Address(
        string line1, string? line2, string postcode, string city, string state, string country)
    {
        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(line1)) lines.Add(line1.Trim());
        if (!string.IsNullOrWhiteSpace(line2)) lines.Add(line2!.Trim());

        var locality = string.Join(" ", new[] { postcode, city }
            .Where(part => !string.IsNullOrWhiteSpace(part))
            .Select(part => part.Trim()));
        if (locality.Length > 0) lines.Add(locality);

        if (!string.IsNullOrWhiteSpace(state)) lines.Add(state.Trim());
        if (!string.IsNullOrWhiteSpace(country)) lines.Add(country.Trim());

        return lines;
    }

    /// <summary>
    /// A delivery block only earns its space when the goods go somewhere other
    /// than the billing address.
    /// </summary>
    private static IReadOnlyList<string>? DeliveryLinesWhenDifferent(MerchantQuotation quotation)
    {
        var billing = Address(
            quotation.BillingAddressLine1Snapshot, quotation.BillingAddressLine2Snapshot,
            quotation.BillingPostcodeSnapshot, quotation.BillingCitySnapshot,
            quotation.BillingStateSnapshot, quotation.BillingCountrySnapshot);
        var delivery = Address(
            quotation.DeliveryAddressLine1Snapshot, quotation.DeliveryAddressLine2Snapshot,
            quotation.DeliveryPostcodeSnapshot, quotation.DeliveryCitySnapshot,
            quotation.DeliveryStateSnapshot, quotation.DeliveryCountrySnapshot);

        return delivery.SequenceEqual(billing) ? null : delivery;
    }

    private static string StatusLabel(MerchantQuotationStatus status) => status switch
    {
        MerchantQuotationStatus.Sent => "Awaiting your acceptance",
        MerchantQuotationStatus.Accepted => "Accepted",
        MerchantQuotationStatus.Rejected => "Declined",
        MerchantQuotationStatus.Expired => "Expired",
        MerchantQuotationStatus.Converted => "Converted to order",
        MerchantQuotationStatus.Cancelled => "Cancelled",
        _ => "Draft",
    };

    private static string Money(string currency, decimal amount) => $"{currency} {amount:N2}";

    private static string Date(DateTimeOffset value) =>
        value.ToOffset(MalaysiaOffset).ToString("dd MMM yyyy");

    /// <summary>
    /// A filename can only contain characters our own document numbers use, so
    /// nothing from a record can steer a header or a path.
    /// </summary>
    private static string SafeReference(string value)
    {
        var safe = new string(value
            .Where(character => char.IsLetterOrDigit(character) || character is '-' or '_')
            .ToArray());
        return safe.Length == 0 ? "document" : safe;
    }

    private static byte[] LoadBrandLogo()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames()
            .SingleOrDefault(item =>
                item.EndsWith("Assets.Brand.mypetlink-logo-horizontal.png", StringComparison.Ordinal));

        if (name is null) return [];

        using var stream = assembly.GetManifestResourceStream(name);
        if (stream is null) return [];

        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    private static ApiException NotFound(string code, string message) => new(404, code, message);
}
