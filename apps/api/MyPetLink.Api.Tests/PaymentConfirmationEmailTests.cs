using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class PaymentConfirmationEmailTests
{
    [Fact]
    public async Task SuccessfulConfirmation_QueuesExactlyOneImmutableMessage()
    {
        using var harness = await Harness.CreateAsync();

        var result = await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);

        var message = Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
        Assert.Equal(OrderStatus.PaymentConfirmed, result.Order.Status);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Equal("owner@example.com", message.RecipientEmail);
        Assert.Contains("MPL-ORD-EMAIL", message.Subject);
        var data = JsonSerializer.Deserialize<PaymentConfirmedEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("Aina", data!.OwnerName);
        Assert.Equal("MPL-ORD-EMAIL", data.OrderNumber);
        Assert.Equal(47m, data.AmountPaid);
        Assert.Equal("Topu", data.PetName);
        Assert.DoesNotContain(Harness.OrderId.ToString(), message.TemplateDataJson);
        Assert.DoesNotContain("private/", message.TemplateDataJson);
    }

    [Fact]
    public async Task FailedAndDuplicateConfirmation_DoNotCreateMoreMessages()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId));

        Assert.Single(await harness.Db.EmailOutbox.ToListAsync());

        var pending = Harness.NewOrder("MPL-ORD-NO-PROOF", OrderStatus.PendingPayment, PaymentStatus.Pending);
        harness.Db.TagOrders.Add(pending);
        await harness.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, pending.Id));
        Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
    }

    [Fact]
    public async Task DisabledEmail_RecordsSuppressedMessageAndDoesNotClaimOrSend()
    {
        using var harness = await Harness.CreateAsync(enabled: false);
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);

        var claims = await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2));

        Assert.Empty(claims);
        Assert.Equal(0, harness.Sender.CallCount);
        // Payment confirmation itself must still succeed; only the email is
        // held back, and as a non-dispatchable Suppressed record.
        var message = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(0, message.AttemptCount);
        Assert.Equal(
            PaymentStatus.Confirmed,
            (await harness.Db.TagOrders.SingleAsync()).PaymentStatus);
    }

    [Fact]
    public async Task PendingMessage_IsSentAndOwnerProjectionOnlyShowsSentMetadata()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));

        await harness.Dispatcher.DispatchAsync(claim);

        var stored = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Sent, stored.Status);
        Assert.NotNull(stored.SentAt);
        Assert.Equal(1, stored.AttemptCount);
        Assert.Equal(1, harness.Sender.CallCount);
        var attachment = Assert.Single(harness.Sender.LastMessage!.Attachments);
        Assert.Equal("application/pdf", attachment.ContentType);
        Assert.EndsWith(".pdf", attachment.FileName, StringComparison.OrdinalIgnoreCase);
        Assert.True(attachment.Content.AsSpan(0, 5).SequenceEqual("%PDF-"u8));
        Assert.NotNull(EmailOutboxService.ToOwnerResponse([stored]));
        Assert.Equal("o***@example.com", EmailOutboxService.ToOwnerResponse([stored])!.MaskedRecipient);
    }

    [Fact]
    public async Task TransientFailure_SchedulesExpectedRetryWithoutChangingPayment()
    {
        using var harness = await Harness.CreateAsync();
        harness.Sender.Exception = new EmailDeliveryException("Temporary mail failure.", true);
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));

        await harness.Dispatcher.DispatchAsync(claim);

        var stored = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Pending, stored.Status);
        Assert.Equal(harness.Clock.GetUtcNow().AddMinutes(1), stored.NextAttemptAt);
        Assert.Equal(
            OrderStatus.PaymentConfirmed,
            (await harness.Db.TagOrders.FindAsync(Harness.OrderId))!.Status);
    }

    [Fact]
    public async Task PermanentFailure_StopsImmediatelyAndCanBeRetriedByAdmin()
    {
        using var harness = await Harness.CreateAsync();
        harness.Sender.Exception = new EmailDeliveryException("The recipient email address is invalid.", false);
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));
        await harness.Dispatcher.DispatchAsync(claim);

        var failed = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Failed, failed.Status);
        Assert.NotNull(failed.LastError);

        var retried = await harness.Admin.RetryPaymentConfirmationEmailAsync(
            Harness.AdminUserId,
            Harness.OrderId);

        Assert.Equal(EmailOutboxStatus.Pending, retried.Status);
        Assert.Equal(0, retried.AttemptCount);
        Assert.Null(retried.LastError);
        Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
        Assert.Contains(
            await harness.Db.AuditLogs.ToListAsync(),
            item => item.Action == "email.payment-confirmation.retry");
    }

    [Fact]
    public async Task MaxAttempts_BecomesFailed()
    {
        using var harness = await Harness.CreateAsync();
        harness.Sender.Exception = new EmailDeliveryException("Temporary mail failure.", true);
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        message.AttemptCount = 4;
        await harness.Db.SaveChangesAsync();
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));

        await harness.Dispatcher.DispatchAsync(claim);

        Assert.Equal(
            EmailOutboxStatus.Failed,
            (await harness.Db.EmailOutbox.SingleAsync()).Status);
    }

    [Fact]
    public async Task AbandonedSendingMessage_IsReclaimed()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        message.Status = EmailOutboxStatus.Sending;
        message.LockToken = Guid.NewGuid();
        message.LockedUntil = harness.Clock.GetUtcNow().AddMinutes(-1);
        var abandonedLockToken = message.LockToken;
        await harness.Db.SaveChangesAsync();

        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));

        Assert.NotEqual(abandonedLockToken, claim.LockToken);
        Assert.Equal(1, (await harness.Db.EmailOutbox.SingleAsync()).AttemptCount);
    }

    [Fact]
    public async Task SentMessage_CannotBeRetried()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));
        await harness.Dispatcher.DispatchAsync(claim);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.RetryPaymentConfirmationEmailAsync(
                Harness.AdminUserId,
                Harness.OrderId));
    }

    [Fact]
    public async Task OtherOwner_CannotReadEmailMetadataOrRetryMessage()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));
        await harness.Dispatcher.DispatchAsync(claim);

        var hiddenOrder = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Orders.GetAsync(Harness.OtherOwnerUserId, "MPL-ORD-EMAIL"));
        Assert.Equal(StatusCodes.Status404NotFound, hiddenOrder.StatusCode);

        var forbiddenRetry = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Admin.RetryPaymentConfirmationEmailAsync(
                Harness.OtherOwnerUserId,
                Harness.OrderId));
        Assert.Equal(StatusCodes.Status403Forbidden, forbiddenRetry.StatusCode);
    }

    [Fact]
    public async Task Cancellation_IsHonouredAndLeaseRemainsRecoverable()
    {
        using var harness = await Harness.CreateAsync();
        harness.Sender.Cancel = true;
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var claim = Assert.Single(await harness.Dispatcher.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            harness.Dispatcher.DispatchAsync(claim, cancellation.Token));
        Assert.Equal(
            EmailOutboxStatus.Sending,
            (await harness.Db.EmailOutbox.SingleAsync()).Status);
    }

    [Fact]
    public async Task Template_IsResponsiveEncodedAndContainsNoInternalData()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<PaymentConfirmedEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        message.TemplateDataJson = JsonSerializer.Serialize(
            data with { OwnerName = "<script>alert('x')</script>" },
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        var rendered = harness.Renderer.Render(message);

        Assert.Contains("viewport", rendered.HtmlBody);
        Assert.Contains("class=\"email-card\"", rendered.HtmlBody);
        Assert.Contains("https://mypetlink.com.my/logo-horizontal.png", rendered.HtmlBody);
        Assert.Contains("alt=\"MyPetLink\"", rendered.HtmlBody);
        Assert.Contains("background-color:#1570ef", rendered.HtmlBody);
        Assert.Contains("MyPetLink &middot;", rendered.HtmlBody);
        Assert.Contains("Paid", rendered.HtmlBody);
        Assert.Contains("&lt;script&gt;", rendered.HtmlBody);
        Assert.DoesNotContain("<script>", rendered.HtmlBody);
        Assert.Contains("MYR 47.00", rendered.HtmlBody);
        Assert.Contains("MPL-ORD-EMAIL", rendered.TextBody);
        Assert.Contains("Topu", rendered.TextBody);
        Assert.Contains(
            "http://localhost:3000/orders/view?order=MPL-ORD-EMAIL",
            rendered.TextBody);
        Assert.DoesNotContain(Harness.OrderId.ToString(), rendered.HtmlBody);
        Assert.DoesNotContain("payment-proof", rendered.HtmlBody);
        Assert.DoesNotContain("bearer", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("#1f6b5b", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@font-face", rendered.HtmlBody, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(false, "Smtp", true)]
    [InlineData(true, "Smtp", false)]
    [InlineData(true, "Development", true)]
    public void Configuration_ValidatesOnlyEnabledDelivery(
        bool enabled,
        string provider,
        bool expectedValid)
    {
        var options = Harness.Options(enabled);
        options.Provider = provider;
        options.Smtp.Username = "";
        options.Smtp.Password = "";

        var result = new EmailOptionsValidator().Validate(null, options);

        Assert.Equal(expectedValid, result.Succeeded);
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminUserId = Guid.Parse("91111111-1111-1111-1111-111111111111");
        public static readonly Guid OwnerUserId = Guid.Parse("92222222-2222-2222-2222-222222222222");
        public static readonly Guid OtherOwnerUserId = Guid.Parse("92222222-2222-2222-2222-222222222223");
        public static readonly Guid PetId = Guid.Parse("93333333-3333-3333-3333-333333333333");
        public static readonly Guid OrderId = Guid.Parse("94444444-4444-4444-4444-444444444444");

        public MyPetLinkDbContext Db { get; }
        public MutableTimeProvider Clock { get; }
        public RecordingEmailSender Sender { get; }
        public PaymentConfirmedEmailTemplateRenderer Renderer { get; }
        public EmailOutboxDispatcher Dispatcher { get; }
        public AdminService Admin { get; }
        public OrderService Orders { get; }

        private Harness(MyPetLinkDbContext db, bool enabled)
        {
            Db = db;
            Clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-07-27T02:00:00Z"));
            Sender = new RecordingEmailSender();
            var emailOptions = Microsoft.Extensions.Options.Options.Create(Options(enabled));
            Renderer = new PaymentConfirmedEmailTemplateRenderer(
                emailOptions,
                new TransactionalEmailLayout(emailOptions));
            var audit = new AuditLogService(db, new HttpContextAccessor());
            Dispatcher = new EmailOutboxDispatcher(
                db,
                Renderer,
                Sender,
                new EmailTemplateGate(db, emailOptions),
                Clock,
                NullLogger<EmailOutboxDispatcher>.Instance,
                new EmailAttachmentResolver(new OrderDocumentService(db)));
            var gate = new EmailTemplateGate(db, emailOptions);
            var outbox = new EmailOutboxService(db, audit, Clock, gate);
            Admin = new AdminService(
                db,
                audit,
                Microsoft.Extensions.Options.Options.Create(new FeatureOptions()),
                outbox);
            Orders = new OrderService(
                db,
                Microsoft.Extensions.Options.Options.Create(new FeatureOptions
                {
                    SmartTagOrderingEnabled = true
                }),
                new TagPricingService(db),
                new DeliveryService(db, new TagPricingService(db), audit));
        }

        public static async Task<Harness> CreateAsync(bool enabled = true)
        {
            var db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase($"email-{Guid.NewGuid():N}")
                    .Options);
            var admin = new User
            {
                Id = AdminUserId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    UserId = AdminUserId,
                    Role = AdminRole.Admin,
                    IsActive = true
                }
            };
            var owner = new User
            {
                Id = OwnerUserId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Aina",
                Status = UserStatus.Active
            };
            var otherOwner = new User
            {
                Id = OtherOwnerUserId,
                Email = "other-owner@example.com",
                NormalizedEmail = "OTHER-OWNER@EXAMPLE.COM",
                DisplayName = "Bala",
                Status = UserStatus.Active
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerUserId,
                OwnerUser = owner,
                Slug = "topu-code",
                Name = "Topu",
                Species = "Cat",
                LifecycleStatus = PetLifecycleStatus.Active
            };
            var order = NewOrder(
                "MPL-ORD-EMAIL",
                OrderStatus.PaymentProofSubmitted,
                PaymentStatus.ProofSubmitted);
            order.PaymentProofs.Add(Proof(order.Id));
            db.Users.AddRange(admin, owner, otherOwner);
            db.Pets.Add(pet);
            db.TagOrders.Add(order);
            if (enabled)
            {
                // Per-template enablement now lives in the database.
                db.EmailTemplateSettings.Add(new EmailTemplateSetting
                {
                    Id = Guid.NewGuid(),
                    MessageType = EmailMessageType.PaymentConfirmed,
                    IsEnabled = true,
                    EnabledFromUtc = DateTimeOffset.Parse("2026-07-27T00:00:00Z"),
                    CreatedAt = DateTimeOffset.Parse("2026-07-27T00:00:00Z"),
                    UpdatedAt = DateTimeOffset.Parse("2026-07-27T00:00:00Z")
                });
            }

            await db.SaveChangesAsync();
            return new Harness(db, enabled);
        }

        public static TagOrder NewOrder(
            string number,
            OrderStatus status,
            PaymentStatus paymentStatus)
        {
            return new TagOrder
            {
                Id = number == "MPL-ORD-EMAIL" ? OrderId : Guid.NewGuid(),
                OrderNumber = number,
                OwnerUserId = OwnerUserId,
                PetId = PetId,
                TagType = TagType.QrNfcSmartTag,
                Variant = TagVariants.Standard,
                Amount = 39m,
                Currency = "MYR",
                DeliveryFee = 8m,
                Status = status,
                PaymentStatus = paymentStatus,
                RecipientName = "Aina",
                DeliveryPhoneE164 = "+60123456789",
                AddressLine1 = "1 Jalan Test",
                Postcode = "50000",
                City = "Kuala Lumpur",
                State = "Kuala Lumpur",
                CreatedAt = DateTimeOffset.Parse("2026-07-27T01:00:00Z"),
                UpdatedAt = DateTimeOffset.Parse("2026-07-27T01:00:00Z")
            };
        }

        private static PaymentProof Proof(Guid orderId)
        {
            var mediaId = Guid.NewGuid();
            return new PaymentProof
            {
                Id = Guid.NewGuid(),
                OrderId = orderId,
                MediaFileId = mediaId,
                MediaFile = new MediaFile
                {
                    Id = mediaId,
                    OwnerUserId = OwnerUserId,
                    OriginalFileName = "proof.jpg",
                    StorageFileName = "proof.jpg",
                    ContentType = "image/jpeg",
                    StorageProvider = "MetadataOnly",
                    StoragePath = "private/proof.jpg",
                    Sha256 = "abc"
                },
                OriginalFileName = "proof.jpg",
                StorageFileName = "proof.jpg",
                ContentType = "image/jpeg",
                StorageProvider = "MetadataOnly",
                StoragePath = "private/proof.jpg",
                Sha256 = "abc",
                UploadedAt = DateTimeOffset.Parse("2026-07-27T01:30:00Z"),
                PaymentMethod = "DuitNow QR",
                Status = PaymentProofStatus.PendingReview
            };
        }

        public static EmailOptions Options(bool enabled) => new()
        {
            Enabled = enabled,
            Provider = EmailOptions.DevelopmentProvider,
            FromAddress = "support@mypetlink.com.my",
            FromName = "MyPetLink",
            OwnerPortalBaseUrl = "http://localhost:3000"
        };

        public void Dispose() => Db.Dispose();
    }

    private sealed class RecordingEmailSender : IEmailSender
    {
        public int CallCount { get; private set; }
        public Exception? Exception { get; set; }
        public bool Cancel { get; set; }
        public EmailMessage? LastMessage { get; private set; }

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Cancel)
            {
                throw new OperationCanceledException(cancellationToken);
            }

            CallCount += 1;
            LastMessage = message;
            return Exception is null ? Task.CompletedTask : Task.FromException(Exception);
        }
    }

    public sealed class MutableTimeProvider(DateTimeOffset value) : TimeProvider
    {
        private DateTimeOffset _value = value;
        public override DateTimeOffset GetUtcNow() => _value;
        public void Advance(TimeSpan amount) => _value = _value.Add(amount);
    }
}
