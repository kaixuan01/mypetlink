using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class AdminOperationalStatusTests
{
    [Theory]
    [InlineData(false, false, "", false)]
    [InlineData(false, true, "", true)]
    [InlineData(true, false, "not-an-email", true)]
    [InlineData(true, true, "operations@example.com", false)]
    public async Task OperationsRecipientWarning_FollowsCurrentEmailIntent(
        bool globalEnabled,
        bool alertTemplateEnabled,
        string operationsRecipient,
        bool expectsWarning)
    {
        await using var db = new MyPetLinkDbContext(
            new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase($"operational-status-{Guid.NewGuid():N}")
                .Options);
        if (alertTemplateEnabled)
        {
            db.EmailTemplateSettings.Add(new EmailTemplateSetting
            {
                Id = Guid.NewGuid(),
                MessageType = EmailMessageType.AdminPaymentProofSubmitted,
                IsEnabled = true,
                EnabledFromUtc = DateTimeOffset.Parse("2026-09-03T00:00:00Z")
            });
            await db.SaveChangesAsync();
        }

        var email = new EmailOptions
        {
            Enabled = globalEnabled,
            Provider = EmailOptions.DevelopmentProvider,
            OperationsRecipient = operationsRecipient
        };
        var service = new AdminOperationalStatusService(
            db,
            Options.Create(email),
            Options.Create(new StorageOptions()),
            Options.Create(new CloudflareR2Options()),
            Options.Create(new PublicSiteOptions()),
            Options.Create(new FeatureOptions()));

        var result = await service.GetAsync();

        Assert.Equal(
            EmailRecipientSafety.IsValid(operationsRecipient),
            result.Email.OperationsRecipientConfigured);
        var warning = result.Warnings.SingleOrDefault(item =>
            item.Code == "admin_payment_proof_recipient_unavailable");
        Assert.Equal(expectsWarning, warning is not null);
        if (warning is not null)
        {
            Assert.Equal("High", warning.Severity);
            Assert.Contains("cannot be delivered", warning.Title, StringComparison.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(operationsRecipient))
            {
                Assert.DoesNotContain(operationsRecipient, warning.Message, StringComparison.Ordinal);
            }
        }
    }
}
