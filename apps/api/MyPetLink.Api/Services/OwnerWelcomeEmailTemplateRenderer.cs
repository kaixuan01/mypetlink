using System.Text;
using System.Text.Json;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OwnerWelcomeEmailTemplateRenderer
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private readonly TransactionalEmailLayout _layout;

    public OwnerWelcomeEmailTemplateRenderer(TransactionalEmailLayout layout)
    {
        _layout = layout;
    }

    public RenderedEmail Render(EmailOutbox message)
    {
        if (message.MessageType != EmailMessageType.OwnerWelcome)
        {
            throw new EmailDeliveryException("The email template is not supported.", false);
        }

        OwnerWelcomeEmailTemplateData data;
        try
        {
            data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
                       message.TemplateDataJson,
                       TemplateJson)
                   ?? throw new JsonException("Template data was empty.");
        }
        catch (JsonException exception)
        {
            throw new EmailDeliveryException("The email content could not be prepared.", false, exception);
        }

        if (!Uri.TryCreate(data.OwnerPortalUrl, UriKind.Absolute, out var portalUri)
            || (portalUri.Scheme != Uri.UriSchemeHttps
                && !(portalUri.Scheme == Uri.UriSchemeHttp && portalUri.IsLoopback))
            || !string.IsNullOrEmpty(portalUri.UserInfo))
        {
            throw new EmailDeliveryException("The Owner Portal link could not be prepared.", false);
        }

        var ownerFirstName = data.OwnerName.Trim();
        var title = string.IsNullOrWhiteSpace(ownerFirstName)
            ? "Welcome to MyPetLink!"
            : $"Welcome to MyPetLink, {ownerFirstName}!";
        const string introduction =
            "We’re happy to have you here. Create your pet’s public profile, keep important information together, and make it easier for someone to contact you if your pet is ever found.";
        TransactionalEmailStep[] steps =
        [
            new TransactionalEmailStep(
                "welcome-profile.png",
                "Pet profile",
                "Create your pet’s profile",
                "Add your pet’s name, photo, and basic information."),
            new TransactionalEmailStep(
                "welcome-contact.png",
                "Contact details",
                "Update your contact details",
                "Make sure someone can reach you if your pet is found."),
            new TransactionalEmailStep(
                "welcome-preview.png",
                "Preview public profile",
                "Preview the public profile",
                "Review what other people will see when you share the profile.")
        ];

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph(introduction))
            .Append(_layout.InformationCard("Getting started", _layout.NumberedSteps(steps)))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine(introduction)
            .AppendLine()
            .AppendLine("Getting started")
            .AppendLine("1. Create your pet’s profile")
            .AppendLine("Add your pet’s name, photo, and basic information.")
            .AppendLine()
            .AppendLine("2. Update your contact details")
            .AppendLine("Make sure someone can reach you if your pet is found.")
            .AppendLine()
            .AppendLine("3. Preview the public profile")
            .Append("Review what other people will see when you share the profile.")
            .ToString();

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            "Welcome to MyPetLink. Create your pet’s profile and keep important information together.",
            Eyebrow: "Owner Portal",
            title,
            bodyHtml,
            textBody,
            new TransactionalEmailAction(
                "Create Your Pet Profile",
                portalUri.AbsoluteUri),
            "You received this email after signing in to MyPetLink for the first time."));
    }
}
