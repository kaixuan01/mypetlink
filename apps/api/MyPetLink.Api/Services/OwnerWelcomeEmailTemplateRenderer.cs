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

        var ownerDisplayName = data.OwnerName.Trim();
        var title = string.IsNullOrWhiteSpace(ownerDisplayName)
            ? "Welcome to MyPetLink!"
            : $"Welcome to MyPetLink, {ownerDisplayName}!";
        const string introduction =
            "We’re happy to have you here. Create a shareable profile for your pet, keep important details together, and help people contact you if your pet is found.";
        const string heroHeading = "Hi, I’m Linko!";
        const string heroMessage =
            "Let’s set up your pet’s profile in a few simple steps.";
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
                "Add the contact details you’d like finders to use."),
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
            .Append(_layout.WelcomeHero(
                title,
                introduction,
                new TransactionalEmailMascot("linko-hero.png", "Linko waving hello", 258),
                heroHeading,
                heroMessage))
            .Append(_layout.OnboardingCard(
                "Just a few simple steps",
                "Set up the essentials now, then update your pet’s profile anytime.",
                _layout.NumberedSteps(steps)))
            .ToString();
        var textBody = new StringBuilder()
            .AppendLine(introduction)
            .AppendLine()
            .AppendLine(heroHeading)
            .AppendLine(heroMessage)
            .AppendLine()
            .AppendLine("Just a few simple steps")
            .AppendLine("Set up the essentials now, then update your pet’s profile anytime.")
            .AppendLine()
            .AppendLine("1. Create your pet’s profile")
            .AppendLine("Add your pet’s name, photo, and basic information.")
            .AppendLine()
            .AppendLine("2. Add your contact details")
            .AppendLine("Add the contact details you’d like finders to use.")
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
            Eyebrow: null,
            title,
            bodyHtml,
            textBody,
            new TransactionalEmailAction(
                "Create My Pet Profile",
                portalUri.AbsoluteUri,
                Wide: true,
                IconFileName: "welcome-paw-decoration.png",
                SupportingText: "Let’s get started!"),
            "You received this email after signing in to MyPetLink for the first time.",
            new TransactionalEmailMascot("linko-support-sit.png", "Linko ready to help", 72),
            BodyOwnsTitle: true));
    }
}
