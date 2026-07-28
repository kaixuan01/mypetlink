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
        const string heroMessage =
            "Hi! I’m Linko. Let’s get your pet profile set up in just a few simple steps.";
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
                "Add your contact details",
                "Make sure someone can reach you if your pet is found."),
            new TransactionalEmailStep(
                "welcome-preview.png",
                "Preview public profile",
                "Preview your public profile",
                "See how your pet’s profile will appear to others."),
            new TransactionalEmailStep(
                "welcome-ready.png",
                "Ready to share",
                "You’re almost there!",
                "Complete your profile and you’re ready to share it.")
        ];

        var bodyHtml = new StringBuilder()
            .Append(_layout.Paragraph(introduction))
            .Append(_layout.MascotHero(
                new TransactionalEmailMascot("linko-hero.png", "Linko", 180),
                heroMessage))
            .Append(_layout.InformationCard("Getting started", _layout.NumberedSteps(steps)))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine(introduction)
            .AppendLine()
            .AppendLine(heroMessage)
            .AppendLine()
            .AppendLine("Getting started")
            .AppendLine("1. Create your pet’s profile")
            .AppendLine("Add your pet’s name, photo, and basic information.")
            .AppendLine()
            .AppendLine("2. Add your contact details")
            .AppendLine("Make sure someone can reach you if your pet is found.")
            .AppendLine()
            .AppendLine("3. Preview your public profile")
            .AppendLine("See how your pet’s profile will appear to others.")
            .AppendLine()
            .AppendLine("4. You’re almost there!")
            .Append("Complete your profile and you’re ready to share it.")
            .ToString();

        return _layout.Render(new TransactionalEmailContent(
            message.Subject,
            "Welcome to MyPetLink. Create your pet’s profile and keep important information together.",
            Eyebrow: "Owner Portal",
            title,
            bodyHtml,
            textBody,
            new TransactionalEmailAction(
                "Create My Pet Profile",
                portalUri.AbsoluteUri),
            "You received this email after signing in to MyPetLink for the first time.",
            new TransactionalEmailMascot("linko-support-sit.png", "Linko", 64)));
    }
}
