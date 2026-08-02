using System.Net.Sockets;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public sealed class MailKitEmailSender : IEmailSender
{
    private readonly EmailOptions _options;

    public MailKitEmailSender(IOptions<EmailOptions> options)
    {
        _options = options.Value;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (!MailboxAddress.TryParse(message.RecipientEmail, out var recipient)
            || ContainsHeaderBreak(message.RecipientEmail)
            || ContainsHeaderBreak(message.RecipientName)
            || ContainsHeaderBreak(message.Subject))
        {
            throw new EmailDeliveryException("The recipient email address is invalid.", false);
        }

        var mimeMessage = new MimeMessage();
        mimeMessage.From.Add(new MailboxAddress(_options.FromName, _options.FromAddress));
        mimeMessage.To.Add(new MailboxAddress(
            string.IsNullOrWhiteSpace(message.RecipientName) ? recipient.Name : message.RecipientName,
            recipient.Address));
        mimeMessage.Subject = message.Subject;
        var body = new BodyBuilder
        {
            HtmlBody = message.HtmlBody,
            TextBody = message.TextBody
        };
        foreach (var attachment in message.Attachments)
        {
            body.Attachments.Add(
                attachment.FileName,
                attachment.Content,
                ContentType.Parse(attachment.ContentType));
        }
        mimeMessage.Body = body.ToMessageBody();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.Smtp.ConnectionTimeoutSeconds));
        using var client = new SmtpClient
        {
            Timeout = checked(_options.Smtp.ConnectionTimeoutSeconds * 1000)
        };

        try
        {
            await client.ConnectAsync(
                _options.Smtp.Host,
                _options.Smtp.Port,
                SecureSocketOptions.StartTls,
                timeout.Token);
            await client.AuthenticateAsync(
                _options.Smtp.Username,
                _options.Smtp.Password,
                timeout.Token);
            await client.SendAsync(mimeMessage, timeout.Token);
            await client.DisconnectAsync(true, timeout.Token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException exception)
        {
            throw new EmailDeliveryException("The mail server timed out.", true, exception);
        }
        catch (SmtpCommandException exception)
        {
            var statusCode = (int)exception.StatusCode;
            var transient = statusCode is >= 400 and < 500;
            throw new EmailDeliveryException(
                transient
                    ? "The mail server temporarily rejected the message."
                    : "The mail server rejected the message.",
                transient,
                exception);
        }
        catch (MailKit.Security.AuthenticationException exception)
        {
            throw new EmailDeliveryException("The mail server authentication failed.", false, exception);
        }
        catch (System.Security.Authentication.AuthenticationException exception)
        {
            throw new EmailDeliveryException("A secure connection to the mail server could not be established.", false, exception);
        }
        catch (Exception exception) when (
            exception is SmtpProtocolException
                or SocketException
                or IOException)
        {
            throw new EmailDeliveryException("The mail server could not be reached.", true, exception);
        }
        finally
        {
            if (client.IsConnected)
            {
                try
                {
                    await client.DisconnectAsync(false, CancellationToken.None);
                }
                catch
                {
                    // The send result is handled above; disconnect failures are
                    // never allowed to expose credentials or replace it.
                }
            }
        }
    }

    private static bool ContainsHeaderBreak(string value) =>
        value.Contains('\r') || value.Contains('\n');
}
