using System.Globalization;
using System.Net;
using Microsoft.Extensions.Hosting;

namespace MyPetLink.Api.Auth;

public sealed class DevAuthOptions
{
    public const string SectionName = "DevAuth";

    public bool Enabled { get; init; }
    public string AdminEmail { get; init; } = "";
    public string DisplayName { get; init; } = "MyPetLink Dev Admin";

    public static void ValidateForStartup(IHostEnvironment environment, DevAuthOptions options)
    {
        if (!options.Enabled)
        {
            return;
        }

        if (!environment.IsDevelopment())
        {
            throw new InvalidOperationException(
                "DevAuth:Enabled may only be true when the application environment is Development.");
        }

        _ = options.GetIdentity();
    }

    public DevelopmentAdminIdentity GetIdentity()
    {
        var email = AdminEmail.Trim();
        var displayName = DisplayName.Trim();

        if (email.Length == 0
            || email.Length > 160
            || !System.Net.Mail.MailAddress.TryCreate(email, out var parsedEmail)
            || !string.Equals(parsedEmail.Address, email, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "DevAuth:AdminEmail must be a valid local Development email address.");
        }

        var domain = email[(email.LastIndexOf('@') + 1)..];
        if (!domain.EndsWith(".local", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "DevAuth:AdminEmail must use a reserved .local domain so real personal data is never seeded.");
        }

        if (displayName.Length == 0 || displayName.Length > 200)
        {
            throw new InvalidOperationException(
                "DevAuth:DisplayName must contain between 1 and 200 characters.");
        }

        var normalizedEmail = email.ToUpper(CultureInfo.InvariantCulture);
        return new DevelopmentAdminIdentity(
            email,
            normalizedEmail,
            displayName,
            $"devadmin:{normalizedEmail.ToLowerInvariant()}");
    }
}

public sealed record DevelopmentAdminIdentity(
    string Email,
    string NormalizedEmail,
    string DisplayName,
    string ProviderSubjectId);

public interface IDevelopmentAuthRequestGuard
{
    bool IsLoopback(HttpContext httpContext);
}

public sealed class DevelopmentAuthRequestGuard : IDevelopmentAuthRequestGuard
{
    public bool IsLoopback(HttpContext httpContext)
    {
        var remoteIp = httpContext.Connection.RemoteIpAddress;
        if (remoteIp is null || !IPAddress.IsLoopback(remoteIp))
        {
            return false;
        }

        var host = httpContext.Request.Host.Host;
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return IPAddress.TryParse(host, out var hostAddress)
            && IPAddress.IsLoopback(hostAddress);
    }
}
