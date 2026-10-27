using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

/// <summary>
/// Signature is the issuer's own signature image, required exactly when the snapshot records a signing.
/// Preview watermarks the page and prints no Delivery Order number.
/// </summary>
public sealed record ConsignmentDeliveryOrderRenderModel(ConsignmentService.DeliveryOrderSnapshot Order, byte[] Logo,
    byte[]? Signature = null, bool Preview = false);

/// <summary>
/// The consignment Delivery Order / Handover form, laid out like the paper form MyPetLink used
/// for its first consignment handover. Everything printed comes from the issued snapshot: the
/// delivered quantities from the dispatch, and the partner's count only when receiving had
/// already been recorded. Anything not recorded is left blank to be completed by hand. The only
/// signature ever drawn is the issuing administrator's own, in Delivered By, when they explicitly
/// signed at issue; Received By is always left for the partner. Lines and boxes are dark enough to
/// survive black-and-white printing.
/// </summary>
public static class ConsignmentDeliveryOrderRenderer
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
    private static readonly TimeSpan Malaysia = TimeSpan.FromHours(8);
    // Darker than DocumentTheme.Border so write-in lines and boxes still print on a mono printer.
    private const string Rule = "#8a94a8";
    private const string Shade = "#eef3fb";

    private static string Day(DateTimeOffset value) => value.ToOffset(Malaysia).ToString("d MMMM yyyy", Invariant);
    private static string Stamp(DateTimeOffset value) => value.ToOffset(Malaysia).ToString("dd-MM-yyyy HH:mm", Invariant);
    private static string Pcs(int value) => value.ToString("N0", Invariant);

    public static byte[] Render(ConsignmentDeliveryOrderRenderModel model)
    {
        // A signing without its image, or an image without a recorded signing, is never printed.
        if ((model.Order.Signature is null) != (model.Signature is null or { Length: 0 }))
            throw new InvalidOperationException("A Delivery Order signature needs both its recorded signing and its image.");
        return Document.Create(container => container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.MarginHorizontal(36);
            page.MarginVertical(24);
            page.DefaultTextStyle(text => text.FontSize(9.5f).FontColor(DocumentTheme.Ink).FontFamily(Fonts.Arial).LineHeight(1.2f));
            if (model.Preview)
                page.Background().AlignCenter().AlignMiddle().Rotate(-40)
                    .Text("PREVIEW - NOT ISSUED").FontSize(60).Bold().FontColor("#e6eaf2");
            page.Header().Element(header => ComposeHeader(header, model));
            page.Content().PaddingVertical(6).Element(content => ComposeContent(content, model));
            page.Footer().Element(footer => ComposeFooter(footer, model));
        })).WithMetadata(new DocumentMetadata
        {
            Title = model.Preview ? "Delivery Order preview - not issued" : $"Delivery Order {model.Order.Number}",
            Author = model.Order.CompanyName,
            Subject = $"Consignment delivery to {model.Order.PartnerName}",
            CreationDate = model.Order.IssuedAt,
            ModifiedDate = model.Order.IssuedAt,
        }).GeneratePdf();
    }

    private static void ComposeHeader(IContainer container, ConsignmentDeliveryOrderRenderModel model)
    {
        var o = model.Order;
        container.Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().AlignMiddle().Column(brand =>
                {
                    if (model.Logo.Length > 0) brand.Item().Width(150).Height(34).Image(model.Logo).FitArea();
                    else brand.Item().Text(o.BrandName).FontSize(18).Bold().FontColor(DocumentTheme.Accent);
                });
                row.RelativeItem(1.3f).AlignRight().Column(title =>
                {
                    title.Item().AlignRight().Text("DELIVERY ORDER / HANDOVER").FontSize(16).Bold();
                    title.Item().AlignRight().Text($"Consignment stock | {Day(o.DeliveredAt)}").FontSize(9).FontColor(DocumentTheme.Muted);
                    title.Item().AlignRight().Text(o.BrandName).FontSize(8.5f).FontColor(DocumentTheme.Muted);
                });
            });
            column.Item().PaddingTop(6).LineHorizontal(1).LineColor(Rule);
        });
    }

    private static void ComposeContent(IContainer container, ConsignmentDeliveryOrderRenderModel model)
    {
        var o = model.Order;
        container.Column(column =>
        {
            column.Spacing(7);
            column.Item().Element(c => Reference(c, o));

            column.Item().Element(c => Heading(c, "1", "Parties and handover location"));
            column.Item().Row(row =>
            {
                row.Spacing(14);
                row.RelativeItem().Element(c => CompanyBlock(c, o));
                row.RelativeItem().Element(c => PartnerBlock(c, o));
            });
            column.Item().Element(c => Field(c, "Handover location / address:", o.DeliveryAddress, 140));

            column.Item().Element(c => Heading(c, "2", "Consignment stock details"));
            column.Item().Element(c => DeclaredBanner(c, o));
            column.Item().Element(c => StockTable(c, o));
            column.Item().EnsureSpace(50).Element(c => CountSummary(c, o));

            column.Item().EnsureSpace(150).Column(section =>
            {
                section.Spacing(6);
                section.Item().Element(c => Heading(c, "3", "Receipt, condition and exceptions"));
                section.Item().Element(c => ReceiptChecks(c, Marks(o)));
                section.Item().Text("For sealed or unopened packs, receipt confirms external packaging only. Internal quantity, SKU mix, "
                    + "item condition and QR/NFC function remain unverified unless checked and recorded here.").FontSize(9);
                if (o.Receipt is { Events.Count: > 0 } recorded)
                    section.Item().Element(c => Field(c, "Recorded receipt:", Receipts(recorded), 140));
                section.Item().Element(c => Field(c, "Exceptions / pending checks:", Exceptions(o.Receipt), 140));
            });

            // The acknowledgement and both signature blocks always stay together on one page.
            column.Item().ShowEntire().Column(section =>
            {
                section.Spacing(7);
                section.Item().LineHorizontal(0.8f).LineColor(Rule);
                section.Item().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(9));
                    text.Span("Consignment only: ").Bold();
                    text.Span("Signatures acknowledge handover subject to the count basis, condition and exceptions recorded above. "
                        + "This is not a sale, invoice or proof of payment. Terms follow the referenced consignment agreement.");
                });
                section.Item().Row(row =>
                {
                    row.Spacing(14);
                    if (o.Signature is { } signed)
                        row.RelativeItem().Element(c => SignedBlock(c, "DELIVERED BY / FOR CONSIGNOR", signed, model.Signature!));
                    else
                        row.RelativeItem().Element(c => SignatureBlock(c, "DELIVERED BY / FOR CONSIGNOR", o.DispatchedBy, null));
                    // Only a single recorded receipt that actually counted units names its receiver here. Several
                    // receipts are listed above instead, and a receipt that found nothing is not a receiver's acceptance.
                    var only = o.Receipt is { Events: [{ Good: var good, Damaged: var damaged } single] } && good + damaged > 0 ? single : null;
                    row.RelativeItem().Element(c => SignatureBlock(c, "RECEIVED BY / FOR CONSIGNEE", only?.RecipientName,
                        only is null ? null : Stamp(only.ReceivedAt)));
                });
            });
        });
    }

    private static void Reference(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        container.Column(column =>
        {
            column.Spacing(4);
            column.Item().Row(row =>
            {
                row.ConstantItem(112).AlignBottom().Text("DO / Reference no.").FontColor(DocumentTheme.Muted);
                row.RelativeItem(2).BorderBottom(0.8f).BorderColor(Rule).PaddingBottom(1).Text(o.Number).FontSize(12).Bold();
                row.ConstantItem(18);
                row.ConstantItem(78).AlignBottom().Text("Handover date").FontColor(DocumentTheme.Muted);
                row.RelativeItem().AlignBottom().Text(Day(o.DeliveredAt)).FontSize(10.5f);
            });
            // The free-text shipment reference stays in the admin record; it is not partner-facing copy.
            column.Item().Row(row =>
            {
                row.ConstantItem(112).Text("Agreement reference").FontColor(DocumentTheme.Muted);
                row.RelativeItem(2).Text($"{o.AgreementReference} | Version {o.AgreementVersion.ToString(Invariant)}");
                row.ConstantItem(18);
                row.ConstantItem(78).Text("Delivery record").FontColor(DocumentTheme.Muted);
                row.RelativeItem().Text(o.DispatchNumber);
            });
        });
    }

    private static void Heading(IContainer container, string number, string title) =>
        container.Text($"{number}.  {title}").FontSize(11).Bold().FontColor(DocumentTheme.Accent);

    private static IContainer Box(IContainer container) => container.Border(0.8f).BorderColor(Rule).PaddingVertical(8).PaddingHorizontal(10);

    private static void BoxHeading(ColumnDescriptor column, string heading) =>
        column.Item().PaddingBottom(4).Text(heading).FontSize(8).Bold().FontColor(DocumentTheme.Accent).LetterSpacing(0.03f);

    private static void CompanyBlock(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        Box(container).Column(column =>
        {
            column.Spacing(2);
            BoxHeading(column, "THE COMPANY / CONSIGNOR");
            column.Item().Text(o.CompanyName).Bold().FontSize(10);
            if (!string.Equals(o.BrandName, o.CompanyName, StringComparison.OrdinalIgnoreCase))
                column.Item().Text($"Brand: {o.BrandName}").FontColor(DocumentTheme.Muted);
            if (o.CompanyRegistrationNumber is not null) column.Item().Text($"Registration No.: {o.CompanyRegistrationNumber}").FontSize(8.5f);
            if (o.CompanyAddress.Count > 0) column.Item().Text(string.Join(", ", o.CompanyAddress)).FontSize(8.5f);
            var contact = string.Join(" | ", new[] { o.CompanyEmail, o.CompanyPhone }.Where(v => v is not null));
            if (contact.Length > 0) column.Item().Text(contact).FontSize(8.5f);
        });
    }

    private static void PartnerBlock(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        Box(container).Column(column =>
        {
            column.Spacing(2);
            BoxHeading(column, "THE PARTNER / CONSIGNEE");
            column.Item().Text(o.PartnerName).Bold().FontSize(10);
            if (o.PartnerTradingName is not null) column.Item().Text($"Trading as {o.PartnerTradingName}").FontColor(DocumentTheme.Muted);
            if (o.PartnerRegistrationNumber is not null) column.Item().Text($"Registration No.: {o.PartnerRegistrationNumber}").FontSize(8.5f);
            column.Item().PaddingTop(4).Element(c => Field(c, "Branch / outlet:", o.BranchName, 82));
            column.Item().PaddingTop(4).Element(c => Field(c, "Contact / tel.:", Contact(o), 82));
        });
    }

    private static string? Contact(ConsignmentService.DeliveryOrderSnapshot o) =>
        (o.ContactPerson, o.ContactPhone) switch
        {
            (null, null) => null,
            ({ } person, null) => person,
            (null, { } phone) => phone,
            ({ } person, { } phone) => $"{person} | {phone}",
        };

    /// <summary>A label and a write-in line. A recorded value is printed on the line; otherwise it stays blank.</summary>
    private static void Field(IContainer container, string label, string? value, float labelWidth) =>
        container.Row(row =>
        {
            row.ConstantItem(labelWidth).AlignBottom().Text(label).FontColor(DocumentTheme.Muted);
            row.RelativeItem().BorderBottom(0.8f).BorderColor(Rule).PaddingBottom(1).MinHeight(14).Text(value ?? "");
        });

    private static void DeclaredBanner(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        container.Background(Shade).Border(0.8f).BorderColor(Rule).PaddingVertical(6).PaddingHorizontal(10).Column(column =>
        {
            column.Item().Text($"DELIVERED TOTAL: {Pcs(o.TotalQuantity)} QR + NFC SMART TAGS").FontSize(10.5f).Bold().FontColor(DocumentTheme.Accent);
            column.Item().Text(o.Receipt switch
                {
                    null => "Delivered quantities are from the dispatch record. Fill counted quantities by hand after checking; leave blank if unverified.",
                    { Events.Count: 0 } => "Delivered quantities are from the dispatch record. No count was recorded at receipt; see pending checks below.",
                    var r => "Delivered quantities are from the dispatch record. Counted quantities are as recorded at receipt on "
                        + string.Join(", ", r.Events.Select(e => Day(e.ReceivedAt)).Distinct()) + ".",
                }).FontSize(8.5f);
        });
    }

    /// <summary>
    /// Each SKU row is one count line, so it is laid out as a single unbreakable row: when it does not fit,
    /// the whole row (SKU, design, size, quantity and count box) moves to the next page, under a repeated
    /// header. Snapshot values are length-limited (SKU 80, design and size 200), so a row always fits a page.
    /// </summary>
    private static void StockTable(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        container.Border(0.8f).BorderColor(Rule).Decoration(decoration =>
        {
            decoration.Before().Background(Shade).BorderBottom(0.8f).BorderColor(Rule)
                .DefaultTextStyle(text => text.FontSize(8.5f).Bold().FontColor(DocumentTheme.Muted))
                .Element(c => StockRow(c,
                    cell => cell.Text("No."), cell => cell.Text("SKU / Product code"), cell => cell.Text("Design"), cell => cell.Text("Size"),
                    cell => cell.AlignRight().Text("Delivered (pcs)"), cell => cell.AlignCenter().Text("Counted (pcs)"), 5));
            decoration.Content().Column(column =>
            {
                var number = 0;
                foreach (var line in o.Lines)
                {
                    var label = (++number).ToString(Invariant);
                    column.Item().ShowEntire().BorderBottom(0.5f).BorderColor(Rule).Element(c => StockRow(c,
                        cell => cell.Text(label), cell => cell.Text(line.Sku), cell => cell.Text(line.Design), cell => cell.Text(line.Size),
                        cell => cell.AlignRight().Text(Pcs(line.Delivered)).Bold(), cell => cell.AlignCenter().Element(b => CountBox(b, line.Counted)), 4));
                }
                // Same column edges as the rows above: the label spans the first four columns.
                column.Item().ShowEntire().Background(Shade).Row(row =>
                {
                    row.RelativeItem().PaddingVertical(4).PaddingHorizontal(6).AlignRight().AlignMiddle().Text("Total delivered").Bold();
                    row.ConstantItem(76).PaddingVertical(4).PaddingHorizontal(6).AlignRight().AlignMiddle().Text(Pcs(o.TotalQuantity)).Bold();
                    row.ConstantItem(76).PaddingVertical(4).PaddingHorizontal(6).AlignCenter().AlignMiddle().Element(c => CountBox(c, o.Receipt?.Counted));
                });
            });
        });
    }

    private static void StockRow(IContainer container, Action<IContainer> number, Action<IContainer> sku, Action<IContainer> design,
        Action<IContainer> size, Action<IContainer> delivered, Action<IContainer> counted, float padding) =>
        container.Row(row =>
        {
            IContainer Cell(IContainer c) => c.PaddingVertical(padding).PaddingHorizontal(6).AlignMiddle();
            row.ConstantItem(26).Element(Cell).Element(number);
            row.RelativeItem(2.4f).Element(Cell).Element(sku);
            row.RelativeItem(2.6f).Element(Cell).Element(design);
            row.ConstantItem(66).Element(Cell).Element(size);
            row.ConstantItem(76).Element(Cell).Element(delivered);
            row.ConstantItem(76).Element(Cell).Element(counted);
        });

    private static void CountBox(IContainer container, int? value) =>
        container.Width(56).Height(16).Border(0.8f).BorderColor(Rule).Background(Colors.White).AlignCenter().AlignMiddle()
            .Text(value is { } v ? Pcs(v) : "").FontSize(10).Bold();

    /// <summary>
    /// What the recorded receiving evidence supports ticking. A box is ticked only when the stored
    /// evidence shows it: a recorded shortage is not a count, a unit under review or never recorded is
    /// unverified, and the absence of a damage finding is not a recorded inspection. Everything else
    /// stays blank for the partner to complete by hand.
    /// </summary>
    private sealed record ReceiptMarks(int? Counted, bool AllCounted, bool PartialCount, bool CountPending, bool NoVisibleDamage,
        bool DamageOrExceptions, int? Short);

    private static ReceiptMarks Marks(ConsignmentService.DeliveryOrderSnapshot o)
    {
        if (o.Receipt is not { } r) return new(null, false, false, false, false, false, null);
        // Every delivered unit was physically counted, good or damaged, at a recorded receipt.
        var allCounted = r.Unverified == 0 && r.Missing == 0 && r.Counted == o.TotalQuantity;
        return new(r.Counted, allCounted, r.Counted > 0 && !allCounted, r.Unverified > 0,
            NoVisibleDamage: allCounted && r.Damaged == 0,
            DamageOrExceptions: r.Damaged > 0 || r.Missing > 0,
            // The difference is known only once every delivered unit has a recorded receiving finding.
            Short: r.Unverified == 0 ? o.TotalQuantity - r.Counted : null);
    }

    private static void CountSummary(IContainer container, ConsignmentService.DeliveryOrderSnapshot o)
    {
        var marks = Marks(o);
        var shortBy = marks.Short;
        container.Column(column =>
        {
            column.Spacing(5);
            column.Item().Row(row =>
            {
                row.ConstantItem(112).AlignMiddle().Text("Actual counted total:").Bold();
                row.ConstantItem(62).Element(c => CountBox(c, marks.Counted));
                row.ConstantItem(30).AlignMiddle().PaddingLeft(6).Text("pcs");
                row.RelativeItem().AlignMiddle().Element(c => Tick(c, marks.CountPending, "Unverified / sealed - count pending"));
            });
            column.Item().Row(row =>
            {
                row.ConstantItem(112).AlignMiddle().Text($"Difference vs {Pcs(o.TotalQuantity)} pcs:");
                row.ConstantItem(56).AlignMiddle().Element(c => Tick(c, shortBy == 0, "Nil"));
                row.ConstantItem(42).AlignMiddle().Element(c => Tick(c, shortBy > 0, "Short"));
                row.ConstantItem(56).AlignMiddle().BorderBottom(0.8f).BorderColor(Rule).AlignCenter().Text(shortBy > 0 ? Pcs(shortBy.Value) : "");
                row.ConstantItem(30).AlignMiddle().PaddingLeft(6).Text("pcs");
                row.ConstantItem(18);
                // A recorded receipt can never count more units than were dispatched, so Excess is only ever written by hand.
                row.ConstantItem(48).AlignMiddle().Element(c => Tick(c, false, "Excess"));
                row.ConstantItem(56).AlignMiddle().BorderBottom(0.8f).BorderColor(Rule).Text("");
                row.ConstantItem(30).AlignMiddle().PaddingLeft(6).Text("pcs");
                row.RelativeItem();
            });
        });
    }

    private static void ReceiptChecks(IContainer container, ReceiptMarks marks)
    {
        container.Column(column =>
        {
            column.Spacing(5);
            column.Item().Row(row =>
            {
                row.ConstantItem(112).Text("Count basis (tick):").Bold();
                row.RelativeItem().Element(c => Tick(c, marks.AllCounted, "All units counted"));
                // Sealed packs are never recorded by the system, so that box is only ever ticked by hand.
                row.RelativeItem().Element(c => Tick(c, false, "Sealed packs only"));
                row.RelativeItem().Element(c => Tick(c, marks.PartialCount, "Partial count"));
            });
            column.Item().Row(row =>
            {
                row.ConstantItem(112).Text("Visible condition (tick):").Bold();
                row.RelativeItem().Element(c => Tick(c, marks.NoVisibleDamage, "No visible damage"));
                row.RelativeItem(2).Element(c => Tick(c, marks.DamageOrExceptions, "Damage / exceptions noted below"));
            });
        });
    }

    private static string Receipts(ConsignmentService.DeliveryOrderReceipt r) => string.Join("; ", r.Events.Select(e =>
        $"{Stamp(e.ReceivedAt)}, {e.RecipientName}: " + string.Join(", ", new[] {
            e.Good > 0 ? $"{Pcs(e.Good)} good" : null, e.Damaged > 0 ? $"{Pcs(e.Damaged)} damaged" : null,
            e.Missing > 0 ? $"{Pcs(e.Missing)} missing" : null }.Where(x => x is not null)))) + ".";

    private static string? Exceptions(ConsignmentService.DeliveryOrderReceipt? r)
    {
        if (r is null) return null;
        var parts = new List<string>();
        var found = new[] { r.Damaged > 0 ? $"{Pcs(r.Damaged)} damaged" : null, r.Missing > 0 ? $"{Pcs(r.Missing)} missing" : null }
            .Where(x => x is not null).ToArray();
        if (r.Events.Count > 0) parts.Add(found.Length == 0 ? "No damage or shortage recorded at receipt." : "Recorded at receipt: " + string.Join(", ", found) + ".");
        // What happened after receipt, dated, so it is never read as part of the original count.
        if (r.Later.Count > 0)
            parts.Add("Later: " + string.Join(", ", r.Later.Select(l => $"{Pcs(l.Units)} {l.Outcome} ({Day(l.RecordedAt)})")) + ".");
        var pending = new[] {
            r.UnderReview > 0 ? $"{Pcs(r.UnderReview)} under review" : null,
            r.AwaitingConfirmation > 0 ? $"{Pcs(r.AwaitingConfirmation)} awaiting count confirmation" : null,
            r.NotRecordedByUnit > 0 ? $"{Pcs(r.NotRecordedByUnit)} without a unit-level receipt record" : null }.Where(x => x is not null).ToArray();
        if (pending.Length > 0) parts.Add("Unverified: " + string.Join(", ", pending) + ".");
        return string.Join(" ", parts);
    }

    private static void Tick(IContainer container, bool ticked, string label) =>
        container.Row(row =>
        {
            row.ConstantItem(10).Height(10).Border(0.8f).BorderColor(DocumentTheme.Ink).AlignCenter().AlignMiddle()
                .Text(ticked ? "X" : "").FontSize(7.5f).Bold().LineHeight(1);
            row.AutoItem().PaddingLeft(5).Text(label);
        });

    private static void SignatureBlock(IContainer container, string heading, string? name, string? date)
    {
        Box(container).Column(column =>
        {
            column.Spacing(3);
            BoxHeading(column, heading);
            column.Item().Height(30).BorderBottom(1).BorderColor(DocumentTheme.Ink);
            column.Item().Text("Signature / company stamp (if available)").FontSize(8).FontColor(DocumentTheme.Muted);
            column.Item().PaddingTop(3).Element(c => Field(c, "Name / title:", name, 72));
            column.Item().PaddingTop(3).Element(c => Field(c, "Date / time:", date, 72));
        });
    }

    // Signed electronically by the issuer: the image sits on the signature line, with who signed and when beneath it.
    private static void SignedBlock(IContainer container, string heading, ConsignmentService.DeliveryOrderSigning signed, byte[] image)
    {
        Box(container).Column(column =>
        {
            column.Spacing(3);
            BoxHeading(column, heading);
            column.Item().Height(30).BorderBottom(1).BorderColor(DocumentTheme.Ink).AlignLeft().AlignBottom()
                .MaxWidth(150).Image(image).FitArea();
            column.Item().Text("Signed electronically by the authorised signatory at issue").FontSize(8).FontColor(DocumentTheme.Muted);
            column.Item().PaddingTop(3).Element(c => Field(c, "Name / title:", $"{signed.SignatoryName}, {signed.SignatoryPosition}", 72));
            column.Item().PaddingTop(3).Element(c => Field(c, "Date / time:", Stamp(signed.SignedAt), 72));
        });
    }

    private static void ComposeFooter(IContainer container, ConsignmentDeliveryOrderRenderModel model)
    {
        var o = model.Order;
        container.Column(column =>
        {
            column.Item().LineHorizontal(0.8f).LineColor(Rule);
            column.Item().PaddingTop(5).Row(row =>
            {
                row.RelativeItem().Text(model.Preview
                        ? "Preview only. Not a Delivery Order: it has no number and must not be printed for signing."
                        : o.Signature is null
                            ? "Print 2 identical copies. Both parties sign each copy and initial corrections; each party retains one signed copy."
                            : "Print 2 identical copies. MyPetLink has signed Delivered By; the partner signs Received By on each copy and initials corrections. Each party retains one copy.")
                    .FontSize(7.5f).FontColor(DocumentTheme.Muted);
                row.ConstantItem(150).AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(7.5f).FontColor(DocumentTheme.Muted));
                    text.Span($"{o.Number} | Page ");
                    text.CurrentPageNumber();
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        });
    }
}
