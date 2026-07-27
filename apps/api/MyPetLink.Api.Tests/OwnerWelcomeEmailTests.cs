using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class OwnerWelcomeEmailTests
{
    [Theory]
    [InlineData(ExternalLoginProviders.Google)]
    [InlineData(ExternalLoginProviders.Apple)]
    [InlineData(ExternalLoginProviders.EmailOtp)]
    public async Task FirstEligiblePortalEntry_QueuesExactlyOneWelcome(
        string provider)
    {
        using var harness = await Harness.CreateAsync(provider: provider);

        await harness.Entry.EnterAsync(Harness.OwnerId);
        await harness.Entry.EnterAsync(Harness.OwnerId);

        var message = Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
        Assert.Equal(EmailMessageType.OwnerWelcome, message.MessageType);
        Assert.Equal(Harness.OwnerId, message.RelatedUserId);
        Assert.Null(message.RelatedOrderId);
        Assert.Equal("owner@example.com", message.RecipientEmail);
        Assert.Equal("Welcome to MyPetLink", message.Subject);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        var data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("Aina", data!.OwnerName);
        Assert.Equal("https://mypetlink.com.my/pets/new", data.OwnerPortalUrl);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public async Task DisabledDeliveryOrTemplate_DoesNotQueueOrSend(
        bool emailEnabled,
        bool templateEnabled)
    {
        using var harness = await Harness.CreateAsync(
            emailEnabled: emailEnabled,
            templateEnabled: templateEnabled);

        await harness.Entry.EnterAsync(Harness.OwnerId);
        var claims = await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2));

        Assert.Empty(await harness.Db.EmailOutbox.ToListAsync());
        Assert.Empty(claims);
        Assert.Equal(0, harness.Sender.CallCount);
    }

    [Theory]
    [InlineData("owner@example.com", false, "OWNER@EXAMPLE.COM")]
    [InlineData("", true, "")]
    [InlineData("not-an-email", true, "NOT-AN-EMAIL")]
    [InlineData("owner@example.com\r\nBcc:attacker@example.com", true, "OWNER@EXAMPLE.COM\r\nBCC:ATTACKER@EXAMPLE.COM")]
    [InlineData("owner@example.com", true, "OTHER@EXAMPLE.COM")]
    public async Task IneligibleEmail_DoesNotQueueOrBlockPortal(
        string email,
        bool verified,
        string normalizedEmail)
    {
        using var harness = await Harness.CreateAsync(
            email: email,
            normalizedEmail: normalizedEmail,
            verified: verified);

        await harness.Entry.EnterAsync(Harness.OwnerId);

        Assert.Empty(await harness.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task MissingOwnerProfile_DoesNotQueueWelcome()
    {
        using var harness = await Harness.CreateAsync(withOwnerProfile: false);

        await harness.Entry.EnterAsync(Harness.OwnerId);

        Assert.Empty(await harness.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task EmailPrefixDisplayName_IsNotUsedAsGreeting()
    {
        using var harness = await Harness.CreateAsync();
        var owner = await harness.Db.Users
            .Include(item => item.OwnerProfile)
            .SingleAsync(item => item.Id == Harness.OwnerId);
        owner.DisplayName = "owner";
        owner.OwnerProfile!.OwnerDisplayName = "owner";
        await harness.Db.SaveChangesAsync();

        await harness.Entry.EnterAsync(Harness.OwnerId);

        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("", data!.OwnerName);
    }

    [Theory]
    [InlineData("a1111111-1111-1111-1111-111111111111")]
    [InlineData("subject-Google")]
    [InlineData("1234567890")]
    public async Task IdentifierLikeDisplayName_IsNotUsedAsGreeting(string displayName)
    {
        using var harness = await Harness.CreateAsync();
        var owner = await harness.Db.Users
            .Include(item => item.OwnerProfile)
            .SingleAsync(item => item.Id == Harness.OwnerId);
        owner.DisplayName = displayName;
        owner.OwnerProfile!.OwnerDisplayName = displayName;
        await harness.Db.SaveChangesAsync();

        await harness.Entry.EnterAsync(Harness.OwnerId);

        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("", data!.OwnerName);
    }

    [Fact]
    public async Task SuitableDisplayName_PreservesTheValidatedFullName()
    {
        using var harness = await Harness.CreateAsync();
        var owner = await harness.Db.Users
            .Include(item => item.OwnerProfile)
            .SingleAsync(item => item.Id == Harness.OwnerId);
        owner.DisplayName = "Chua Kai Xuan";
        owner.OwnerProfile!.OwnerDisplayName = "Chua Kai Xuan";
        await harness.Db.SaveChangesAsync();

        await harness.Entry.EnterAsync(Harness.OwnerId);

        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("Chua Kai Xuan", data!.OwnerName);
    }

    [Fact]
    public async Task OwnerProfileDisplayName_TakesPriorityOverAccountDisplayName()
    {
        using var harness = await Harness.CreateAsync();
        var owner = await harness.Db.Users
            .Include(item => item.OwnerProfile)
            .SingleAsync(item => item.Id == Harness.OwnerId);
        owner.DisplayName = "Provider Display Value";
        owner.OwnerProfile!.OwnerDisplayName = "Kai Xuan";
        await harness.Db.SaveChangesAsync();

        await harness.Entry.EnterAsync(Harness.OwnerId);

        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<OwnerWelcomeEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("Kai Xuan", data!.OwnerName);
    }

    [Fact]
    public async Task PendingWelcome_IsSentBySharedWorkerAndMarkedSent()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Entry.EnterAsync(Harness.OwnerId);
        var claim = Assert.Single(
            await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));

        await harness.Dispatcher.DispatchAsync(claim);

        var stored = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Sent, stored.Status);
        Assert.NotNull(stored.SentAt);
        Assert.Equal(1, stored.AttemptCount);
        Assert.Equal(1, harness.Sender.CallCount);
    }

    [Fact]
    public async Task QueuedWelcome_RemainsPendingWhenTemplateIsDisabled()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Entry.EnterAsync(Harness.OwnerId);
        var disabledOptions = Options.Create(new EmailOptions
        {
            Enabled = true,
            Provider = EmailOptions.DevelopmentProvider,
            OwnerPortalBaseUrl = "https://mypetlink.com.my",
            Templates = new EmailTemplateOptions
            {
                OwnerWelcomeEnabled = false
            }
        });
        var dispatcher = new EmailOutboxDispatcher(
            harness.Db,
            new EmailTemplateRenderer(
                new PaymentConfirmedEmailTemplateRenderer(
                    disabledOptions,
                    new TransactionalEmailLayout(disabledOptions)),
                new OwnerWelcomeEmailTemplateRenderer(
                    new TransactionalEmailLayout(disabledOptions))),
            harness.Sender,
            disabledOptions,
            harness.Clock,
            NullLogger<EmailOutboxDispatcher>.Instance);

        var claims = await dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2));

        Assert.Empty(claims);
        Assert.Equal(
            EmailOutboxStatus.Pending,
            (await harness.Db.EmailOutbox.SingleAsync()).Status);
        Assert.Equal(0, harness.Sender.CallCount);
    }

    [Fact]
    public async Task AdminRetry_ReusesFailedWelcomeAndOwnerCannotRetry()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Entry.EnterAsync(Harness.OwnerId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        message.Status = EmailOutboxStatus.Failed;
        message.AttemptCount = 5;
        message.LastError = "Safe failure.";
        await harness.Db.SaveChangesAsync();

        var forbidden = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.RetryOwnerWelcomeEmailAsync(
                Harness.OtherOwnerId,
                Harness.OwnerId));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);

        var retried = await harness.Admin.RetryOwnerWelcomeEmailAsync(
            Harness.AdminId,
            Harness.OwnerId);

        Assert.Equal(EmailOutboxStatus.Pending, retried.Status);
        Assert.Equal(0, retried.AttemptCount);
        Assert.Null(retried.LastError);
        Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task Template_UsesSharedBrandLayoutAndContainsNoAuthenticationData()
    {
        using var harness = await Harness.CreateAsync();
        var message = Message(new OwnerWelcomeEmailTemplateData(
            "<script>alert('x')</script>",
            "https://mypetlink.com.my/pets/new",
            harness.Clock.GetUtcNow(),
            SmartTagsEnabled: false));

        var rendered = harness.WelcomeRenderer.Render(message);

        Assert.Contains("viewport", rendered.HtmlBody);
        Assert.Contains("role=\"presentation\"", rendered.HtmlBody);
        Assert.Contains("width=\"600\"", rendered.HtmlBody);
        Assert.Contains("width:100%;max-width:600px", rendered.HtmlBody);
        Assert.Contains("class=\"email-card\"", rendered.HtmlBody);
        Assert.Contains("background-color:#fff8f2", rendered.HtmlBody);
        Assert.Contains("background-color:#1570ef", rendered.HtmlBody);
        Assert.Contains("color:#0d1b3d", rendered.HtmlBody);
        Assert.Contains("border:1px solid #f0dcd0", rendered.HtmlBody);
        Assert.Contains("&lt;script&gt;", rendered.HtmlBody);
        Assert.DoesNotContain("<script>", rendered.HtmlBody);
        Assert.Contains("Create Your Pet Profile", rendered.HtmlBody);
        Assert.Contains("Create Your Pet Profile", rendered.TextBody);
        Assert.Contains("https://mypetlink.com.my/pets/new", rendered.HtmlBody);
        Assert.Contains("https://mypetlink.com.my/pets/new", rendered.TextBody);
        Assert.Contains("Create your pet&#x2019;s profile", rendered.HtmlBody);
        Assert.Contains("Create your pet’s profile", rendered.TextBody);
        Assert.Contains("Update your contact details", rendered.HtmlBody);
        Assert.Contains("Preview the public profile", rendered.HtmlBody);
        Assert.Contains(
            "https://mypetlink.com.my/email-assets/welcome-profile.png",
            rendered.HtmlBody);
        Assert.Contains(
            "https://mypetlink.com.my/email-assets/welcome-contact.png",
            rendered.HtmlBody);
        Assert.Contains(
            "https://mypetlink.com.my/email-assets/welcome-preview.png",
            rendered.HtmlBody);
        Assert.Contains("alt=\"Pet profile\"", rendered.HtmlBody);
        Assert.Contains("alt=\"Contact details\"", rendered.HtmlBody);
        Assert.Contains("alt=\"Preview public profile\"", rendered.HtmlBody);
        Assert.Contains(">1</div>", rendered.HtmlBody);
        Assert.Contains(">2</div>", rendered.HtmlBody);
        Assert.Contains(">3</div>", rendered.HtmlBody);
        Assert.Contains("https://mypetlink.com.my/logo-horizontal.png", rendered.HtmlBody);
        Assert.Contains("alt=\"MyPetLink\"", rendered.HtmlBody);
        Assert.Contains("support@mypetlink.com.my", rendered.HtmlBody);
        Assert.Contains(
            "You received this email after signing in to MyPetLink for the first time.",
            rendered.HtmlBody);
        Assert.Contains(
            "You received this email after signing in to MyPetLink for the first time.",
            rendered.TextBody);
        Assert.DoesNotContain("QR or NFC", rendered.HtmlBody);
        Assert.DoesNotContain("Smart Tag", rendered.HtmlBody);
        Assert.DoesNotContain("Premium", rendered.HtmlBody);
        Assert.DoesNotContain("Lost Mode", rendered.HtmlBody);
        Assert.DoesNotContain("#1f6b5b", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("#f7f3ea", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@font-face", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("display:grid", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("display:flex", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(".svg", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("data:image", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(Harness.OwnerId.ToString(), rendered.HtmlBody);
        Assert.DoesNotContain("OAuth", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("JWT", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("OTP", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Template_UsesFallbackHeadingAndWorksWithoutLogo()
    {
        using var harness = await Harness.CreateAsync(brandLogoUrl: "http://localhost/logo.png");
        var message = Message(new OwnerWelcomeEmailTemplateData(
            "",
            "https://mypetlink.com.my/pets/new",
            harness.Clock.GetUtcNow(),
            SmartTagsEnabled: true));

        var rendered = harness.WelcomeRenderer.Render(message);

        Assert.Contains("Welcome to MyPetLink!", rendered.HtmlBody);
        Assert.Contains("Welcome to MyPetLink!", rendered.TextBody);
        Assert.DoesNotContain("alt=\"MyPetLink\"", rendered.HtmlBody);
        Assert.Contains(TransactionalEmailLayout.Tagline, rendered.HtmlBody);
        Assert.Contains("alt=\"Pet profile\"", rendered.HtmlBody);
        Assert.Contains("Create Your Pet Profile", rendered.HtmlBody);
        Assert.DoesNotContain("QR or NFC", rendered.HtmlBody);
        Assert.DoesNotContain("Smart Tag", rendered.HtmlBody);
    }

    [Fact]
    public async Task LongOwnerName_IsEncodedAndWrapSafe()
    {
        using var harness = await Harness.CreateAsync();
        const string ownerName =
            "Alexandria-Catherine-Montgomery-Wellington-Santos<&>";
        var rendered = harness.WelcomeRenderer.Render(Message(
            new OwnerWelcomeEmailTemplateData(
                ownerName,
                "https://mypetlink.com.my/pets/new",
                harness.Clock.GetUtcNow(),
                SmartTagsEnabled: false)));

        Assert.Contains(
            "Welcome to MyPetLink, Alexandria-Catherine-Montgomery-Wellington-Santos&lt;&amp;&gt;!",
            rendered.HtmlBody);
        Assert.Contains("overflow-wrap:anywhere", rendered.HtmlBody);
        Assert.DoesNotContain(ownerName, rendered.HtmlBody);
        Assert.Contains(ownerName, rendered.TextBody);
    }

    private static EmailOutbox Message(OwnerWelcomeEmailTemplateData data) =>
        new()
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.OwnerWelcome,
            RecipientEmail = "owner@example.com",
            RecipientName = "Owner",
            Subject = "Welcome to MyPetLink",
            TemplateDataJson = JsonSerializer.Serialize(
                data,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)),
            RelatedUserId = Harness.OwnerId,
            Status = EmailOutboxStatus.Pending,
            MaxAttempts = 5,
            NextAttemptAt = data.WelcomeEventAt,
            CreatedAt = data.WelcomeEventAt,
            UpdatedAt = data.WelcomeEventAt
        };

    private sealed class Harness : IDisposable
    {
        public static readonly Guid OwnerId = Guid.Parse("a1111111-1111-1111-1111-111111111111");
        public static readonly Guid OtherOwnerId = Guid.Parse("a2222222-2222-2222-2222-222222222222");
        public static readonly Guid AdminId = Guid.Parse("a3333333-3333-3333-3333-333333333333");
        private static readonly Guid PlanId = Guid.Parse("a4444444-4444-4444-4444-444444444444");

        public MyPetLinkDbContext Db { get; }
        public PaymentConfirmationEmailTests.MutableTimeProvider Clock { get; }
        public RecordingSender Sender { get; }
        public OwnerWelcomeEmailTemplateRenderer WelcomeRenderer { get; }
        public EmailOutboxDispatcher Dispatcher { get; }
        public OwnerPortalEntryService Entry { get; }
        public AdminService Admin { get; }

        private Harness(
            MyPetLinkDbContext db,
            EmailOptions options,
            FeatureOptions features)
        {
            Db = db;
            Clock = new PaymentConfirmationEmailTests.MutableTimeProvider(
                DateTimeOffset.Parse("2026-07-27T03:00:00Z"));
            var optionValue = Options.Create(options);
            var audit = new AuditLogService(db, new HttpContextAccessor());
            var outbox = new EmailOutboxService(db, audit, Clock);
            Sender = new RecordingSender();
            var layout = new TransactionalEmailLayout(optionValue);
            WelcomeRenderer = new OwnerWelcomeEmailTemplateRenderer(layout);
            Dispatcher = new EmailOutboxDispatcher(
                db,
                new EmailTemplateRenderer(
                    new PaymentConfirmedEmailTemplateRenderer(optionValue, layout),
                    WelcomeRenderer),
                Sender,
                optionValue,
                Clock,
                NullLogger<EmailOutboxDispatcher>.Instance);
            Entry = new OwnerPortalEntryService(
                db,
                outbox,
                optionValue,
                Options.Create(features),
                Clock,
                NullLogger<OwnerPortalEntryService>.Instance);
            Admin = new AdminService(
                db,
                audit,
                Options.Create(features),
                outbox);
        }

        public static async Task<Harness> CreateAsync(
            string provider = ExternalLoginProviders.Google,
            string email = "owner@example.com",
            string? normalizedEmail = null,
            bool verified = true,
            bool withOwnerProfile = true,
            bool emailEnabled = true,
            bool templateEnabled = true,
            string brandLogoUrl = "https://mypetlink.com.my/logo-horizontal.png")
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase($"owner-welcome-{Guid.NewGuid():N}")
                    .Options);
            var plan = new Plan
            {
                Id = PlanId,
                Code = "Free",
                Name = "Free",
                Status = PlanStatus.Available
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = email,
                NormalizedEmail = normalizedEmail ?? email.Trim().ToUpperInvariant(),
                DisplayName = "Aina",
                Status = UserStatus.Active
            };
            if (withOwnerProfile)
            {
                owner.OwnerProfile = new OwnerProfile
                {
                    UserId = owner.Id,
                    PlanId = plan.Id,
                    Plan = plan,
                    OwnerDisplayName = "Aina"
                };
            }

            owner.ExternalLogins.Add(new ExternalLogin
            {
                UserId = owner.Id,
                User = owner,
                Provider = provider,
                ProviderSubjectId = $"subject-{provider}",
                ProviderEmail = email,
                EmailVerifiedAt = verified
                    ? DateTimeOffset.Parse("2026-07-27T02:55:00Z")
                    : null
            });
            var otherOwner = new User
            {
                Id = OtherOwnerId,
                Email = "other@example.com",
                NormalizedEmail = "OTHER@EXAMPLE.COM",
                DisplayName = "Other",
                Status = UserStatus.Active
            };
            var admin = new User
            {
                Id = AdminId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    UserId = AdminId,
                    Role = AdminRole.Admin,
                    IsActive = true
                }
            };
            db.Plans.Add(plan);
            db.Users.AddRange(owner, otherOwner, admin);
            await db.SaveChangesAsync();

            var options = new EmailOptions
            {
                Enabled = emailEnabled,
                Provider = EmailOptions.DevelopmentProvider,
                OwnerPortalBaseUrl = "https://mypetlink.com.my",
                BrandLogoUrl = brandLogoUrl,
                Templates = new EmailTemplateOptions
                {
                    OwnerWelcomeEnabled = templateEnabled
                }
            };
            return new Harness(
                db,
                options,
                new FeatureOptions { SmartTagOrderingEnabled = false });
        }

        public void Dispose() => Db.Dispose();
    }

    private sealed class RecordingSender : IEmailSender
    {
        public int CallCount { get; private set; }

        public Task SendAsync(
            EmailMessage message,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            CallCount++;
            return Task.CompletedTask;
        }
    }
}
