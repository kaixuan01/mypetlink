using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyPetLink.Api.Services;

internal sealed record ConsignmentAgreementRenderModel(
    ConsignmentService.AgreementDocumentSnapshot Agreement,
    byte[] Logo,
    bool Preview,
    int? IssueNumber,
    string TermsFingerprint,
    DateTimeOffset GeneratedAt);

/// <summary>
/// The consignment agreement a partner signs. Every term is printed exactly as saved:
/// the renderer adds headings, never clauses or values of its own. A preview is
/// watermarked and says it is not for signature; an issued copy says it is unsigned.
/// Signature blocks are blank — nothing here ever claims a signature or a date.
/// </summary>
internal static class ConsignmentAgreementRenderer
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
    private static readonly TimeSpan Malaysia = TimeSpan.FromHours(8);

    public static string ShortFingerprint(string fingerprint) =>
        string.Join("-", Enumerable.Range(0, 3).Select(i => fingerprint.Substring(i * 4, 4)));

    public static string Percent(decimal value) =>
        (value == decimal.Truncate(value) ? value.ToString("0", Invariant) : value.ToString("0.00", Invariant)) + "%";

    private static string Day(DateTimeOffset value) => value.ToOffset(Malaysia).ToString("d MMMM yyyy", Invariant);

    public static byte[] Render(ConsignmentAgreementRenderModel model) =>
        Document.Create(container => container.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(40);
            page.DefaultTextStyle(text => text.FontSize(10).FontColor(DocumentTheme.Ink).FontFamily(Fonts.Arial).LineHeight(1.3f));
            if (model.Preview)
                page.Background().AlignCenter().AlignMiddle().Rotate(-40)
                    .Text("DRAFT PREVIEW").FontSize(64).Bold().FontColor("#eef1f8");
            page.Header().Element(header => ComposeHeader(header, model));
            page.Content().PaddingVertical(10).Element(content => ComposeContent(content, model));
            page.Footer().Element(footer => ComposeFooter(footer, model));
        })).WithMetadata(new DocumentMetadata
        {
            Title = $"Consignment Agreement {model.Agreement.Reference} v{model.Agreement.Version}",
            Author = model.Agreement.Company.LegalName,
            Subject = model.Preview ? "Draft preview — not for signature" : "Issued for signature",
            CreationDate = model.GeneratedAt,
            ModifiedDate = model.GeneratedAt,
        }).GeneratePdf();

    private static string IssueLabel(ConsignmentAgreementRenderModel model) =>
        model.Preview ? "Draft preview" : $"Issue {model.IssueNumber}";

    private static void ComposeHeader(IContainer container, ConsignmentAgreementRenderModel model)
    {
        var a = model.Agreement;
        container.Column(column =>
        {
            column.Item().Row(row =>
            {
                row.RelativeItem().AlignMiddle().Column(brand =>
                {
                    if (model.Logo.Length > 0) brand.Item().Width(150).Height(34).Image(model.Logo).FitArea();
                    else brand.Item().Text(a.BrandName).FontSize(18).Bold().FontColor(DocumentTheme.Accent);
                });
                row.RelativeItem().AlignRight().Column(title =>
                {
                    title.Item().AlignRight().Text("CONSIGNMENT AGREEMENT").FontSize(14).Bold().LetterSpacing(0.04f);
                    title.Item().AlignRight().Text($"{a.Reference} · Version {a.Version}").FontSize(9).FontColor(DocumentTheme.Muted);
                    title.Item().AlignRight().Text(IssueLabel(model)).FontSize(9).FontColor(DocumentTheme.Muted);
                });
            });
            column.Item().PaddingTop(8).LineHorizontal(1).LineColor(DocumentTheme.Border);
        });
    }

    private static void ComposeContent(IContainer container, ConsignmentAgreementRenderModel model)
    {
        var a = model.Agreement;
        container.Column(column =>
        {
            column.Spacing(12);
            column.Item().Element(c => StatusBanner(c, model));
            column.Item().Text($"This agreement sets out the consignment terms agreed between {a.Company.LegalName} and {a.Partner.LegalName}.")
                .FontSize(10);

            column.Item().Element(c => Heading(c, "1", "Parties"));
            column.Item().Row(row =>
            {
                row.Spacing(12);
                row.RelativeItem().Element(c => PartyBlock(c, "The Company", a.Company, a.BrandName));
                row.RelativeItem().Element(c => PartyBlock(c, "The Partner", a.Partner, null));
            });

            column.Item().EnsureSpace(110).Column(section =>
            {
                section.Item().Element(c => Heading(c, "2", "Agreement details"));
                section.Item().PaddingTop(6).Element(c => Rows(c,
                [
                    ("Agreement reference", a.Reference),
                    ("Agreement version", a.Version.ToString(Invariant)),
                    ("Document", IssueLabel(model)),
                    ("Effective start", Day(a.EffectiveFrom)),
                    ("Effective end", a.EffectiveTo is { } end ? Day(end) : "No end date agreed"),
                    ("Terms fingerprint", ShortFingerprint(model.TermsFingerprint)),
                ]));
            });

            column.Item().EnsureSpace(80).Column(section =>
            {
                section.Item().Element(c => Heading(c, "3", "Commission"));
                section.Item().PaddingTop(6).Element(c => Rows(c,
                [
                    ("Partner commission", $"{Percent(a.PartnerCommissionPercentage)} of each sale, kept by the Partner"),
                    ("MyPetLink share", Percent(100m - a.PartnerCommissionPercentage)),
                ]));
            });

            column.Item().Element(c => Clause(c, "4", "Duration and renewal", a.DurationTerms));

            column.Item().EnsureSpace(80).Column(section =>
            {
                section.Item().Element(c => Heading(c, "5", "Settlement and payment"));
                section.Item().PaddingTop(6).Element(c => Rows(c,
                [
                    ("Settlement frequency", a.SettlementFrequency),
                    ("Payment deadline", a.PaymentDeadlineDays == 1 ? "1 day" : $"{a.PaymentDeadlineDays.ToString(Invariant)} days"),
                ]));
            });

            column.Item().Element(c => Clause(c, "6", "Discount permissions", a.DiscountTerms));
            column.Item().Element(c => Clause(c, "7", "Returns", a.ReturnTerms));
            column.Item().Element(c => Clause(c, "8", "Loss and damage", a.LossTerms));

            // The whole execution section moves to the next page rather than splitting.
            column.Item().ShowEntire().Column(section =>
            {
                section.Spacing(8);
                section.Item().Element(c => Heading(c, "9", "Signatures"));
                section.Item().Text("Signed by the authorised representatives of the parties.").FontSize(9).FontColor(DocumentTheme.Muted);
                section.Item().Row(row =>
                {
                    row.Spacing(12);
                    row.RelativeItem().Element(c => SignatureBlock(c, a.Company.LegalName));
                    row.RelativeItem().Element(c => SignatureBlock(c, a.Partner.LegalName));
                });
            });
        });
    }

    private static void StatusBanner(IContainer container, ConsignmentAgreementRenderModel model)
    {
        var preview = model.Preview;
        container.Background(preview ? DocumentTheme.NoticeAmberBackground : "#eef4ff").Padding(10).Column(column =>
        {
            column.Item().Text(preview ? "DRAFT PREVIEW — NOT FOR SIGNATURE" : "ISSUED FOR SIGNATURE — NOT YET SIGNED")
                .FontSize(10).Bold().FontColor(preview ? DocumentTheme.NoticeAmberText : DocumentTheme.Accent);
            column.Item().PaddingTop(2).Text(preview
                    ? $"Generated {Day(model.GeneratedAt)} from the saved draft terms. Issue the agreement for signature to produce the copy to send to the Partner."
                    : $"Issued {Day(model.GeneratedAt)}. This copy becomes a signed agreement only when both parties have signed it. Check the terms fingerprint matches on every page.")
                .FontSize(8.5f).FontColor(preview ? DocumentTheme.NoticeAmberText : DocumentTheme.Ink);
        });
    }

    private static void Heading(IContainer container, string number, string title) =>
        container.Text($"{number}.  {title}").FontSize(11).Bold().FontColor(DocumentTheme.Accent);

    private static void Clause(IContainer container, string number, string title, string body) =>
        container.EnsureSpace(70).Column(column =>
        {
            column.Item().Element(c => Heading(c, number, title));
            column.Item().PaddingTop(6).PaddingLeft(18).Text(body.Trim());
        });

    private static void Rows(IContainer container, (string Label, string Value)[] rows) =>
        container.PaddingLeft(18).Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(140);
                columns.RelativeColumn();
            });
            foreach (var (label, value) in rows)
            {
                table.Cell().Element(DocumentTheme.BodyCell).Text(label).FontSize(9).FontColor(DocumentTheme.Muted);
                table.Cell().Element(DocumentTheme.BodyCell).Text(value);
            }
        });

    private static void PartyBlock(IContainer container, string heading, ConsignmentService.AgreementPartySnapshot party, string? brand)
    {
        container.Border(1).BorderColor(DocumentTheme.Border).Padding(10).Column(column =>
        {
            column.Spacing(2);
            column.Item().PaddingBottom(4).Text(heading.ToUpperInvariant()).FontSize(8).Bold().FontColor(DocumentTheme.Accent).LetterSpacing(0.05f);
            column.Item().Text(party.LegalName).Bold();
            if (brand is not null) column.Item().Text($"Brand: {brand}").FontSize(9).FontColor(DocumentTheme.Muted);
            if (party.TradingName is not null) column.Item().Text($"Trading as {party.TradingName}").FontSize(9).FontColor(DocumentTheme.Muted);
            if (party.RegistrationNumber is not null) column.Item().Text($"Registration No.: {party.RegistrationNumber}").FontSize(9);
            foreach (var line in party.Address) column.Item().Text(line).FontSize(9);
            if (party.ContactPerson is not null) column.Item().PaddingTop(4).Text($"Contact: {party.ContactPerson}").FontSize(9);
            if (party.Email is not null) column.Item().Text(party.Email).FontSize(9);
        });
    }

    private static void SignatureBlock(IContainer container, string party)
    {
        container.Border(1).BorderColor(DocumentTheme.Border).Padding(10).Column(column =>
        {
            column.Spacing(4);
            column.Item().Text("For and on behalf of").FontSize(8).FontColor(DocumentTheme.Muted);
            column.Item().Text(party).Bold().FontSize(9.5f);
            column.Item().PaddingTop(4).Text("Signature").FontSize(8).FontColor(DocumentTheme.Muted);
            column.Item().Height(42).BorderBottom(1).BorderColor(DocumentTheme.Ink);
            foreach (var label in new[] { "Printed name", "Designation", "Date" })
            {
                column.Item().PaddingTop(6).Text(label).FontSize(8).FontColor(DocumentTheme.Muted);
                column.Item().Height(16).BorderBottom(1).BorderColor(DocumentTheme.Border);
            }
            column.Item().PaddingTop(6).Text("Company stamp (if any)").FontSize(8).FontColor(DocumentTheme.Muted);
            column.Item().Height(52).Border(1).BorderColor(DocumentTheme.Border);
        });
    }

    private static void ComposeFooter(IContainer container, ConsignmentAgreementRenderModel model)
    {
        var a = model.Agreement;
        container.Column(column =>
        {
            column.Item().LineHorizontal(1).LineColor(DocumentTheme.Border);
            column.Item().PaddingTop(6).Row(row =>
            {
                row.RelativeItem().Text($"{a.BrandName} Consignment Agreement · {a.Reference} v{a.Version} · {IssueLabel(model)} · Terms fingerprint {ShortFingerprint(model.TermsFingerprint)}")
                    .FontSize(7.5f).FontColor(DocumentTheme.Muted);
                row.ConstantItem(80).AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(7.5f).FontColor(DocumentTheme.Muted));
                    text.Span("Page ");
                    text.CurrentPageNumber();
                    text.Span(" of ");
                    text.TotalPages();
                });
            });
        });
    }
}
