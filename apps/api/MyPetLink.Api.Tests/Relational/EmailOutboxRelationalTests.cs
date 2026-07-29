using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class EmailOutboxRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("b2222222-2222-2222-2222-222222222222");
    private static readonly Guid PetId = Guid.Parse("b3333333-3333-3333-3333-333333333333");
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-27T02:00:00Z");

    [RelationalFact]
    public async Task UniqueConstraint_PreventsDuplicatePaymentConfirmedMessages()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var order = SeedOrderGraph(db, withProof: false);
        db.EmailOutbox.AddRange(Message(order), Message(order));

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task PaymentAndOutboxInsert_RollBackTogether_WhenOutboxInsertFails()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid orderId;
        Guid proofId;
        await using (var seed = scope.NewContext())
        {
            var order = SeedOrderGraph(seed, withProof: true);
            var existing = Message(order);
            seed.EmailOutbox.Add(existing);
            await seed.SaveChangesAsync();
            orderId = order.Id;
            proofId = order.PaymentProofs.Single().Id;
        }

        await using (var db = scope.NewContext())
        {
            var audit = new AuditLogService(db, new HttpContextAccessor());
            var admin = new AdminService(
                db,
                audit,
                Options.Create(new FeatureOptions()),
                new DuplicateEnqueueService(db));

            await Assert.ThrowsAsync<DbUpdateException>(() =>
                admin.ConfirmPaymentAsync(AdminId, orderId));
        }

        await using var verify = scope.NewContext();
        Assert.Equal(
            OrderStatus.PaymentProofSubmitted,
            (await verify.TagOrders.FindAsync(orderId))!.Status);
        Assert.Equal(
            PaymentProofStatus.PendingReview,
            (await verify.PaymentProofs.FindAsync(proofId))!.Status);
        Assert.Single(await verify.EmailOutbox.ToListAsync());
        Assert.Empty(await verify.AuditLogs.ToListAsync());
    }

    [RelationalFact]
    public async Task TwoDispatchers_CannotClaimTheSameMessage()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var seed = scope.NewContext())
        {
            var order = SeedOrderGraph(seed, withProof: false);
            seed.EmailOutbox.Add(Message(order));
            seed.EmailTemplateSettings.Add(EnabledTemplate(EmailMessageType.PaymentConfirmed));
            await seed.SaveChangesAsync();
        }

        await using var dbA = scope.NewContext();
        await using var dbB = scope.NewContext();
        var dispatcherA = Dispatcher(dbA);
        var dispatcherB = Dispatcher(dbB);

        var claims = await Task.WhenAll(
            dispatcherA.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)),
            dispatcherB.ClaimBatchAsync(1, TimeSpan.FromMinutes(2)));

        Assert.Equal(1, claims.Sum(result => result.Count));
        await using var verify = scope.NewContext();
        var stored = await verify.EmailOutbox.SingleAsync();
        Assert.Equal(EmailOutboxStatus.Sending, stored.Status);
        Assert.Equal(1, stored.AttemptCount);
    }

    [RelationalFact]
    public async Task ConcurrentOwnerPortalEntries_CreateOneWelcomeMessage()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var ownerId = Guid.NewGuid();
        await using (var seed = scope.NewContext())
        {
            var plan = await seed.Plans.SingleAsync(item => item.Code == "Free");
            var owner = new User
            {
                Id = ownerId,
                Email = "concurrent-owner@example.com",
                NormalizedEmail = "CONCURRENT-OWNER@EXAMPLE.COM",
                DisplayName = "Concurrent Owner",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = ownerId,
                    PlanId = plan.Id,
                    Plan = plan,
                    OwnerDisplayName = "Concurrent Owner"
                }
            };
            owner.ExternalLogins.Add(new ExternalLogin
            {
                UserId = ownerId,
                User = owner,
                Provider = "Google",
                ProviderSubjectId = $"concurrent-{ownerId:N}",
                ProviderEmail = owner.Email,
                EmailVerifiedAt = Now
            });
            seed.Users.Add(owner);
            await seed.SaveChangesAsync();
        }

        await using var dbA = scope.NewContext();
        await using var dbB = scope.NewContext();

        await Task.WhenAll(
            Entry(dbA).EnterAsync(ownerId),
            Entry(dbB).EnterAsync(ownerId));

        await using var verify = scope.NewContext();
        var message = Assert.Single(await verify.EmailOutbox.ToListAsync());
        Assert.Equal(EmailMessageType.OwnerWelcome, message.MessageType);
        Assert.Equal(ownerId, message.RelatedUserId);
    }

    private static EmailTemplateSetting EnabledTemplate(EmailMessageType messageType) =>
        new()
        {
            Id = Guid.NewGuid(),
            MessageType = messageType,
            IsEnabled = true,
            EnabledFromUtc = Now.AddMinutes(-5),
            CreatedAt = Now.AddMinutes(-5),
            UpdatedAt = Now.AddMinutes(-5)
        };

    private static EmailOutboxDispatcher Dispatcher(MyPetLinkDbContext db)
    {
        var options = Options.Create(new EmailOptions
        {
            Enabled = true,
            Provider = EmailOptions.DevelopmentProvider,
            OwnerPortalBaseUrl = "http://localhost:3000"
        });
        return new EmailOutboxDispatcher(
            db,
            new StubRenderer(),
            new StubSender(),
            new EmailTemplateGate(db, options),
            new FixedTimeProvider(),
            NullLogger<EmailOutboxDispatcher>.Instance);
    }

    private static OwnerPortalEntryService Entry(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        var emailOptions = Options.Create(new EmailOptions
        {
            Enabled = true,
            Provider = EmailOptions.DevelopmentProvider,
            OwnerPortalBaseUrl = "http://localhost:3000"
        });
        return new OwnerPortalEntryService(
            db,
            new EmailOutboxService(
                db,
                audit,
                new FixedTimeProvider(),
                new EmailTemplateGate(db, emailOptions)),
            emailOptions,
            Options.Create(new FeatureOptions()),
            new FixedTimeProvider(),
            NullLogger<OwnerPortalEntryService>.Instance);
    }

    private static TagOrder SeedOrderGraph(MyPetLinkDbContext db, bool withProof)
    {
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
        var owner = new User
        {
            Id = OwnerId,
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active
        };
        var pet = new Pet
        {
            Id = PetId,
            OwnerUserId = OwnerId,
            OwnerUser = owner,
            Slug = $"milo-{Guid.NewGuid():N}",
            Name = "Milo",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active
        };
        var order = new TagOrder
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"MPL-REL-{Guid.NewGuid():N}",
            OwnerUserId = OwnerId,
            OwnerUser = owner,
            PetId = PetId,
            Pet = pet,
            TagType = TagType.QrPetTag,
            Variant = TagVariants.Standard,
            Amount = 39m,
            Currency = "MYR",
            Status = withProof ? OrderStatus.PaymentProofSubmitted : OrderStatus.PendingPayment,
            PaymentStatus = withProof ? PaymentStatus.ProofSubmitted : PaymentStatus.Pending,
            RecipientName = "Owner",
            DeliveryPhoneE164 = "+60123456789",
            AddressLine1 = "1 Jalan Test",
            Postcode = "50000",
            City = "Kuala Lumpur",
            State = "Kuala Lumpur",
            CreatedAt = Now,
            UpdatedAt = Now
        };
        if (withProof)
        {
            var media = new MediaFile
            {
                Id = Guid.NewGuid(),
                OwnerUserId = OwnerId,
                OriginalFileName = "proof.jpg",
                StorageFileName = "proof.jpg",
                ContentType = "image/jpeg",
                StorageProvider = "MetadataOnly",
                StoragePath = "private/proof.jpg",
                Sha256 = "abc"
            };
            order.PaymentProofs.Add(new PaymentProof
            {
                Id = Guid.NewGuid(),
                Order = order,
                OrderId = order.Id,
                MediaFile = media,
                MediaFileId = media.Id,
                OriginalFileName = "proof.jpg",
                StorageFileName = "proof.jpg",
                ContentType = "image/jpeg",
                StorageProvider = "MetadataOnly",
                StoragePath = "private/proof.jpg",
                Sha256 = "abc",
                Status = PaymentProofStatus.PendingReview,
                UploadedAt = Now
            });
        }

        db.Users.AddRange(admin, owner);
        db.Pets.Add(pet);
        db.TagOrders.Add(order);
        return order;
    }

    private static EmailOutbox Message(TagOrder order) => new()
    {
        Id = Guid.NewGuid(),
        MessageType = EmailMessageType.PaymentConfirmed,
        RecipientEmail = "owner@example.com",
        RecipientName = "Owner",
        Subject = $"Payment confirmed for order {order.OrderNumber}",
        TemplateDataJson = "{}",
        RelatedOrderId = order.Id,
        RelatedOrder = order,
        Status = EmailOutboxStatus.Pending,
        MaxAttempts = 5,
        NextAttemptAt = Now,
        CreatedAt = Now,
        UpdatedAt = Now
    };

    private sealed class DuplicateEnqueueService(MyPetLinkDbContext db) : IEmailOutboxService
    {
        public Task EnqueuePaymentConfirmedAsync(
            TagOrder order,
            DateTimeOffset confirmedAt,
            CancellationToken cancellationToken = default)
        {
            db.EmailOutbox.Add(Message(order));
            return Task.CompletedTask;
        }

        public Task<EmailOutbox?> EnqueueOwnerWelcomeAsync(
            User user,
            OwnerWelcomeEmailTemplateData template,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<AdminEmailOutboxResponse> RetryFailedAsync(
            Guid orderId,
            Guid adminUserId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<AdminOwnerWelcomeEmailResponse> RetryOwnerWelcomeAsync(
            Guid ownerUserId,
            Guid adminUserId,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class StubRenderer : IEmailTemplateRenderer
    {
        public RenderedEmail Render(EmailOutbox message) => new("", "");
    }

    private sealed class StubSender : IEmailSender
    {
        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => Now;
    }
}
