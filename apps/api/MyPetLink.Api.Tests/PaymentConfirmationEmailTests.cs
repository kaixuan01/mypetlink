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
    public async Task PaymentProofSubmission_QueuesOneOperationalMessageAndReplayIsIdempotent()
    {
        using var harness = await Harness.CreateAsync();
        var (order, media) = await harness.AddPendingOrderWithMediaAsync("MPL-ORD-PROOF-NOTIFY");
        var request = new DTOs.UploadPaymentProofRequest(
            media.Id,
            media.OriginalFileName,
            "DuitNow QR",
            "PAY-REF-123",
            "Paid this morning",
            47m);

        Assert.Empty(await harness.Db.EmailOutbox.Where(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted).ToListAsync());

        await harness.Orders.SubmitPaymentProofAsync(Harness.OwnerUserId, order.OrderNumber, request);
        await harness.Orders.SubmitPaymentProofAsync(Harness.OwnerUserId, order.OrderNumber, request);

        var message = Assert.Single(await harness.Db.EmailOutbox
            .Where(item => item.MessageType == EmailMessageType.AdminPaymentProofSubmitted)
            .ToListAsync());
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Equal("operations@example.com", message.RecipientEmail);
        Assert.NotNull(message.RelatedPaymentProofId);
        Assert.Single(await harness.Db.PaymentProofs.Where(proof => proof.OrderId == order.Id).ToListAsync());
        var data = JsonSerializer.Deserialize<AdminPaymentProofSubmittedEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal(order.OrderNumber, data!.OrderNumber);
        Assert.Equal("Aina", data.CustomerName);
        Assert.Equal("owner@example.com", data.CustomerEmail);
        Assert.Equal(47m, data.Amount);
        Assert.Equal("PAY-REF-123", data.PaymentReference);
        Assert.Contains(data.Items, item => item.PetName == "Topu" && item.Quantity == 1);
        Assert.DoesNotContain(media.StoragePath, message.TemplateDataJson);

        var rendered = new AdminPaymentProofSubmittedEmailTemplateRenderer(
            Microsoft.Extensions.Options.Options.Create(Harness.Options(true)),
            new TransactionalEmailLayout(Microsoft.Extensions.Options.Options.Create(Harness.Options(true))))
            .Render(message);
        Assert.Contains($"admin/payment-proofs?proof={message.RelatedPaymentProofId}", rendered.TextBody);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    public async Task MissingOrInvalidOperationsRecipient_DoesNotFailSubmission(string recipient)
    {
        using var harness = await Harness.CreateAsync(operationsRecipient: recipient);
        var (order, media) = await harness.AddPendingOrderWithMediaAsync($"MPL-ORD-NO-OPS-{Guid.NewGuid():N}");

        var result = await harness.Orders.SubmitPaymentProofAsync(
            Harness.OwnerUserId,
            order.OrderNumber,
            new DTOs.UploadPaymentProofRequest(media.Id, media.OriginalFileName, "QR Payment", null, null, 47m));

        Assert.Equal(PaymentStatus.ProofSubmitted, result.PaymentStatus);
        var message = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted);
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(EmailSuppressionReasons.OperationsRecipientUnavailable, message.SuppressionReason);
        Assert.Equal("", message.RecipientEmail);
    }

    [Fact]
    public async Task MissingSubmissionTemplate_SuppressesEmailWithoutFailingCustomerRequest()
    {
        using var harness = await Harness.CreateAsync(templatesEnabled: false);
        var (order, media) = await harness.AddPendingOrderWithMediaAsync("MPL-ORD-NO-TEMPLATE");

        await harness.Orders.SubmitPaymentProofAsync(
            Harness.OwnerUserId,
            order.OrderNumber,
            new DTOs.UploadPaymentProofRequest(media.Id, media.OriginalFileName, "QR Payment", null, null, 47m));

        var message = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted);
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, message.SuppressionReason);
    }

    [Fact]
    public async Task AdminProofTemplateEnabled_GlobalDeliveryOff_QueuesPendingWithoutSending()
    {
        using var harness = await Harness.CreateAsync(globalEmailEnabled: false);
        var (order, media) = await harness.AddPendingOrderWithMediaAsync("MPL-ORD-OPS-PAUSED");

        await harness.Orders.SubmitPaymentProofAsync(
            Harness.OwnerUserId,
            order.OrderNumber,
            new DTOs.UploadPaymentProofRequest(media.Id, media.OriginalFileName, "QR Payment", null, null, 47m));

        var message = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Null(message.SuppressionReason);
        Assert.Empty(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));
    }

    [Fact]
    public async Task OperationsRecipientRecovery_RequeuesOnlyEligibleOriginalRowsAndIsIdempotent()
    {
        using var harness = await Harness.CreateAsync(
            globalEmailEnabled: false,
            operationsRecipient: "");
        var (order, media) = await harness.AddPendingOrderWithMediaAsync("MPL-ORD-OPS-RECOVERY");
        await harness.Orders.SubmitPaymentProofAsync(
            Harness.OwnerUserId,
            order.OrderNumber,
            new DTOs.UploadPaymentProofRequest(media.Id, media.OriginalFileName, "QR Payment", null, null, 47m));
        var original = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted);
        var originalId = original.Id;
        var originalCreatedAt = original.CreatedAt;
        var originalProofId = original.RelatedPaymentProofId;

        harness.EmailOptions.OperationsRecipient = "fixed-operations@example.com";
        var forbidden = await Assert.ThrowsAsync<ApiException>(() =>
            harness.AdminTemplates.RecoverAdminPaymentProofAlertsAsync(Harness.OtherOwnerUserId));
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);

        var recovered = await harness.AdminTemplates.RecoverAdminPaymentProofAlertsAsync(
            Harness.AdminUserId);
        var replay = await harness.AdminTemplates.RecoverAdminPaymentProofAlertsAsync(
            Harness.AdminUserId);

        Assert.Equal(1, recovered.RecoveredCount);
        Assert.Equal(0, replay.RecoveredCount);
        var message = Assert.Single(await harness.Db.EmailOutbox.ToListAsync());
        Assert.Equal(originalId, message.Id);
        Assert.Equal(originalCreatedAt, message.CreatedAt);
        Assert.Equal(originalProofId, message.RelatedPaymentProofId);
        Assert.Equal("fixed-operations@example.com", message.RecipientEmail);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Null(message.SuppressionReason);
        Assert.Empty(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));

        message.Status = EmailOutboxStatus.Suppressed;
        message.SuppressionReason = EmailSuppressionReasons.TemplateDisabled;
        await harness.Db.SaveChangesAsync();
        var templateDisabledReplay = await harness.AdminTemplates
            .RecoverAdminPaymentProofAlertsAsync(Harness.AdminUserId);
        Assert.Equal(0, templateDisabledReplay.RecoveredCount);
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, message.SuppressionReason);
        Assert.Single(await harness.Db.AuditLogs.Where(item =>
            item.Action == "email.admin-payment-proof-submitted.recover-recipient").ToListAsync());
    }

    [Fact]
    public async Task OtherOwnerCannotSubmitProofOrLeakAnOperationalMessage()
    {
        using var harness = await Harness.CreateAsync();
        var (order, media) = await harness.AddPendingOrderWithMediaAsync("MPL-ORD-PRIVATE-PROOF");

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Orders.SubmitPaymentProofAsync(
                Harness.OtherOwnerUserId,
                order.OrderNumber,
                new DTOs.UploadPaymentProofRequest(media.Id, media.OriginalFileName, "QR Payment", null, null, 47m)));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Empty(await harness.Db.EmailOutbox.Where(item =>
            item.MessageType == EmailMessageType.AdminPaymentProofSubmitted).ToListAsync());
    }

    [Fact]
    public async Task PaymentProofRejection_QueuesExactlyOneCustomerMessageWithNewDeadline()
    {
        using var harness = await Harness.CreateAsync();

        var result = await harness.Admin.RejectPaymentProofAsync(
            Harness.AdminUserId,
            Harness.OrderId,
            "The payment reference does not match the receipt.");

        var message = Assert.Single(await harness.Db.EmailOutbox
            .Where(item => item.MessageType == EmailMessageType.PaymentProofRejected)
            .ToListAsync());
        Assert.Equal("owner@example.com", message.RecipientEmail);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        var data = JsonSerializer.Deserialize<PaymentProofRejectedEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(data);
        Assert.Equal("MPL-ORD-EMAIL", data!.OrderNumber);
        Assert.Equal("The payment reference does not match the receipt.", data.RejectionReason);
        Assert.Equal(result.Order.PaymentReservationExpiresAt, data.PaymentDeadline);

        await Assert.ThrowsAsync<ApiException>(() => harness.Admin.RejectPaymentProofAsync(
            Harness.AdminUserId,
            Harness.OrderId,
            "Replay"));
        Assert.Single(await harness.Db.EmailOutbox.Where(item =>
            item.MessageType == EmailMessageType.PaymentProofRejected).ToListAsync());

        var options = Microsoft.Extensions.Options.Options.Create(Harness.Options(true));
        var rendered = new PaymentProofRejectedEmailTemplateRenderer(
            options,
            new TransactionalEmailLayout(options)).Render(message);
        Assert.Contains("View Order and Resubmit", rendered.TextBody);
        Assert.Contains("The payment reference does not match the receipt.", rendered.TextBody);
    }

    [Fact]
    public async Task RejectionTemplateEnabled_GlobalDeliveryOff_QueuesPendingWithoutSending()
    {
        using var harness = await Harness.CreateAsync(globalEmailEnabled: false);

        await harness.Admin.RejectPaymentProofAsync(
            Harness.AdminUserId,
            Harness.OrderId,
            "Please upload a clearer proof.");

        var message = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.PaymentProofRejected);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Null(message.SuppressionReason);
        Assert.Empty(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));
    }

    [Fact]
    public async Task RejectionTemplateDisabled_IsSuppressed()
    {
        using var harness = await Harness.CreateAsync(templatesEnabled: false);

        await harness.Admin.RejectPaymentProofAsync(
            Harness.AdminUserId,
            Harness.OrderId,
            "Please upload a clearer proof.");

        var message = await harness.Db.EmailOutbox.SingleAsync(item =>
            item.MessageType == EmailMessageType.PaymentProofRejected);
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, message.SuppressionReason);
    }

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
    public async Task DisabledTemplate_RecordsSuppressedMessageAndDoesNotClaimOrSend()
    {
        using var harness = await Harness.CreateAsync(templatesEnabled: false);
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
    public async Task EnabledFromBoundary_KeepsHistoricalPendingMessagesBlocked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        Assert.Equal(EmailMessageType.PaymentConfirmed, message.MessageType);
        var setting = await harness.Db.EmailTemplateSettings.SingleAsync(item =>
            item.MessageType == EmailMessageType.PaymentConfirmed);
        setting.EnabledFromUtc = message.CreatedAt.AddMinutes(1);
        await harness.Db.SaveChangesAsync();
        Assert.True(message.CreatedAt < setting.EnabledFromUtc!.Value);
        // Match the worker's scoped DbContext rather than letting the
        // in-memory provider satisfy queries from this test's tracked graph.
        harness.Db.ChangeTracker.Clear();

        Assert.Empty(await harness.Db.EmailOutbox.AsNoTracking().Where(item =>
            item.MessageType == EmailMessageType.PaymentConfirmed
            && item.CreatedAt >= setting.EnabledFromUtc).ToListAsync());

        Assert.Empty(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));
        var template = (await harness.AdminTemplates.ListAsync()).Templates.Single(item =>
            item.MessageType == EmailMessageType.PaymentConfirmed.ToString());
        Assert.Equal(1, template.BlockedCount);
        Assert.Equal(0, template.EligibleCount);
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

    [Fact]
    public async Task Template_RendersMultiplePetLinesAndCompletePriceBreakdown()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Admin.ConfirmPaymentAsync(Harness.AdminUserId, Harness.OrderId);
        var message = await harness.Db.EmailOutbox.SingleAsync();
        var data = JsonSerializer.Deserialize<PaymentConfirmedEmailTemplateData>(
            message.TemplateDataJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        message.TemplateDataJson = JsonSerializer.Serialize(data with
        {
            AmountPaid = 85m,
            MerchandiseSubtotal = 90m,
            DiscountTotal = 13m,
            DeliveryFee = 8m,
            Items =
            [
                new PaymentConfirmedEmailItemData("Standard Smart Tag", "Standard NFC", "Topu", 1, 39m, 39m),
                new PaymentConfirmedEmailItemData("Lightweight QR Tag", "Lightweight", "Luna", 2, 19m, 38m)
            ]
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        var rendered = harness.Renderer.Render(message);

        Assert.Contains("Standard Smart Tag", rendered.TextBody);
        Assert.Contains("Topu", rendered.TextBody);
        Assert.Contains("Lightweight QR Tag", rendered.TextBody);
        Assert.Contains("Luna", rendered.TextBody);
        Assert.Contains("Merchandise subtotal: MYR 90.00", rendered.TextBody);
        Assert.Contains("Discount: − MYR 13.00", rendered.TextBody);
        Assert.Contains("Delivery: MYR 8.00", rendered.TextBody);
        Assert.Contains("Amount paid: MYR 85.00", rendered.TextBody);
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

    [Fact]
    public void InvalidOperationsRecipient_IsHandledAtEnqueueInsteadOfBlockingStartup()
    {
        var options = Harness.Options(true);
        options.OperationsRecipient = "not-an-email";

        var result = new EmailOptionsValidator().Validate(null, options);

        Assert.True(result.Succeeded);
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
        public AdminEmailTemplateService AdminTemplates { get; }
        public EmailOptions EmailOptions { get; }

        private Harness(MyPetLinkDbContext db, bool globalEmailEnabled, string operationsRecipient)
        {
            Db = db;
            Clock = new MutableTimeProvider(DateTimeOffset.Parse("2026-07-27T02:00:00Z"));
            Sender = new RecordingEmailSender();
            var options = Options(globalEmailEnabled);
            options.OperationsRecipient = operationsRecipient;
            EmailOptions = options;
            var emailOptions = Microsoft.Extensions.Options.Options.Create(options);
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
                new EmailAttachmentResolver(new OrderDocumentService(db), new MerchantDocumentService(db)));
            var gate = new EmailTemplateGate(db, emailOptions);
            var outbox = new EmailOutboxService(db, audit, Clock, gate, options: emailOptions);
            AdminTemplates = new AdminEmailTemplateService(
                db,
                audit,
                emailOptions,
                NullLogger<AdminEmailTemplateService>.Instance,
                Clock,
                outbox);
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
                new DeliveryService(db, new TagPricingService(db), audit),
                new BusinessReferenceGenerator(new CryptographicBusinessReferenceSuffixSource()),
                Clock,
                auditLogService: audit,
                emailOutboxService: outbox);
        }

        public static async Task<Harness> CreateAsync(
            bool globalEmailEnabled = true,
            bool templatesEnabled = true,
            string operationsRecipient = "operations@example.com")
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
            if (templatesEnabled)
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
                db.EmailTemplateSettings.AddRange(
                    EnabledTemplate(EmailMessageType.AdminPaymentProofSubmitted),
                    EnabledTemplate(EmailMessageType.PaymentProofRejected));
            }

            await db.SaveChangesAsync();
            return new Harness(db, globalEmailEnabled, operationsRecipient);
        }

        public async Task<(TagOrder Order, MediaFile Media)> AddPendingOrderWithMediaAsync(string orderNumber)
        {
            var order = NewOrder(orderNumber, OrderStatus.PendingPayment, PaymentStatus.Pending);
            order.PaymentReservationExpiresAt = Clock.GetUtcNow().AddHours(2);
            order.Items.Add(new TagOrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                PetId = PetId,
                PetNameSnapshot = "Topu",
                ProductNameSnapshot = "MyPetLink QR + NFC Smart Tag",
                VariantNameSnapshot = "Standard Tag",
                SkuSnapshot = "MPL-NFC-STANDARD",
                SupportsQrSnapshot = true,
                SupportsNfcSnapshot = true,
                UnitBasePrice = 39m,
                Quantity = 1,
                Subtotal = 39m,
                FinalUnitPrice = 39m,
                FinalAmount = 39m,
                Currency = "MYR"
            });
            var media = new MediaFile
            {
                Id = Guid.NewGuid(),
                OwnerUserId = OwnerUserId,
                OriginalFileName = "proof.jpg",
                StorageFileName = "proof-private.jpg",
                ContentType = "image/jpeg",
                FileSize = 1024,
                StorageProvider = "Local",
                StoragePath = "private/orders/proof-private.jpg",
                Category = MediaUploadCategory.OrderReceipt,
                UploadStatus = MediaUploadStatus.Ready,
                IsPublic = false,
                Sha256 = "proof-sha"
            };
            var link = new MediaFileLink
            {
                Id = Guid.NewGuid(),
                MediaFileId = media.Id,
                MediaFile = media,
                OwnerType = MediaOwnerType.TagOrder,
                OwnerId = order.Id
            };
            Db.TagOrders.Add(order);
            Db.MediaFiles.Add(media);
            Db.MediaFileLinks.Add(link);
            await Db.SaveChangesAsync();
            return (order, media);
        }

        private static EmailTemplateSetting EnabledTemplate(EmailMessageType type) => new()
        {
            Id = Guid.NewGuid(),
            MessageType = type,
            IsEnabled = true,
            EnabledFromUtc = DateTimeOffset.Parse("2026-07-27T00:00:00Z"),
            CreatedAt = DateTimeOffset.Parse("2026-07-27T00:00:00Z"),
            UpdatedAt = DateTimeOffset.Parse("2026-07-27T00:00:00Z")
        };

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
