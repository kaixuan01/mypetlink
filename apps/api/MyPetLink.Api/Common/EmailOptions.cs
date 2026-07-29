using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Common;

public sealed class EmailOptions
{
    public const string SectionName = "Email";
    public const string SmtpProvider = "Smtp";
    public const string DevelopmentProvider = "Development";

    public bool Enabled { get; set; }
    public string Provider { get; set; } = SmtpProvider;
    public string FromAddress { get; set; } = "support@mypetlink.com.my";
    public string FromName { get; set; } = "MyPetLink";
    public string OwnerPortalBaseUrl { get; set; } = "https://mypetlink.com.my";
    public string BrandLogoUrl { get; set; } = "https://mypetlink.com.my/logo-horizontal.png";
    public string BrandAssetBaseUrl { get; set; } = "https://mypetlink.com.my/email-assets";
    public SmtpEmailOptions Smtp { get; set; } = new();
    public EmailDispatchOptions Dispatch { get; set; } = new();
}

public sealed class SmtpEmailOptions
{
    public string Host { get; set; } = "smtppro.zoho.com";
    public int Port { get; set; } = 587;
    public bool UseStartTls { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public int ConnectionTimeoutSeconds { get; set; } = 30;
}

public sealed class EmailDispatchOptions
{
    public int PollIntervalSeconds { get; set; } = 10;
    public int BatchSize { get; set; } = 10;
    public int MaxConcurrency { get; set; } = 2;
    public int VisibilityTimeoutSeconds { get; set; } = 120;
}

public sealed class EmailOptionsValidator : IValidateOptions<EmailOptions>
{
    public ValidateOptionsResult Validate(string? name, EmailOptions options)
    {
        // Per-template enablement lives in the EmailTemplateSettings table, so
        // the only switch here is the global emergency stop.
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        var failures = new List<string>();
        ValidateLinks(options, failures);

        var provider = options.Provider?.Trim();
        if (!string.Equals(provider, EmailOptions.SmtpProvider, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(provider, EmailOptions.DevelopmentProvider, StringComparison.OrdinalIgnoreCase))
        {
            failures.Add("Email:Provider must be Smtp or Development.");
        }

        if (!new EmailAddressAttribute().IsValid(options.FromAddress))
        {
            failures.Add("Email:FromAddress must be a valid email address.");
        }

        if (string.IsNullOrWhiteSpace(options.FromName)
            || ContainsHeaderBreak(options.FromName))
        {
            failures.Add("Email:FromName must be set and cannot contain line breaks.");
        }

        if (string.Equals(provider, EmailOptions.SmtpProvider, StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(options.Smtp.Host)
                || ContainsHeaderBreak(options.Smtp.Host))
            {
                failures.Add("Email:Smtp:Host must be set.");
            }

            if (options.Smtp.Port is < 1 or > 65535)
            {
                failures.Add("Email:Smtp:Port must be between 1 and 65535.");
            }

            if (!options.Smtp.UseStartTls)
            {
                failures.Add("Email:Smtp:UseStartTls must be true.");
            }

            if (string.IsNullOrWhiteSpace(options.Smtp.Username))
            {
                failures.Add("Email:Smtp:Username must be set.");
            }

            if (string.IsNullOrWhiteSpace(options.Smtp.Password))
            {
                failures.Add("Email:Smtp:Password must be supplied through secret storage.");
            }
        }

        if (options.Smtp.ConnectionTimeoutSeconds is < 1 or > 120)
        {
            failures.Add("Email:Smtp:ConnectionTimeoutSeconds must be between 1 and 120.");
        }

        if (options.Dispatch.PollIntervalSeconds is < 1 or > 300
            || options.Dispatch.BatchSize is < 1 or > 100
            || options.Dispatch.MaxConcurrency is < 1 or > 10
            || options.Dispatch.VisibilityTimeoutSeconds is < 30 or > 1800)
        {
            failures.Add("Email dispatch settings are outside their supported ranges.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateLinks(EmailOptions options, List<string> failures)
    {
        if (!Uri.TryCreate(options.OwnerPortalBaseUrl, UriKind.Absolute, out var portalUri)
            || (portalUri.Scheme != Uri.UriSchemeHttps
                && !(portalUri.Scheme == Uri.UriSchemeHttp && portalUri.IsLoopback))
            || !string.IsNullOrEmpty(portalUri.UserInfo)
            || !string.IsNullOrEmpty(portalUri.Query)
            || !string.IsNullOrEmpty(portalUri.Fragment))
        {
            failures.Add("Email:OwnerPortalBaseUrl must be an absolute HTTPS origin (or loopback HTTP for development) without credentials, a query, or a fragment.");
        }

        if (!Uri.TryCreate(options.BrandLogoUrl, UriKind.Absolute, out var logoUri)
            || logoUri.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(logoUri.UserInfo)
            || !string.IsNullOrEmpty(logoUri.Query)
            || !string.IsNullOrEmpty(logoUri.Fragment))
        {
            failures.Add("Email:BrandLogoUrl must be an absolute HTTPS URL without credentials, a query, or a fragment.");
        }

        if (!Uri.TryCreate(options.BrandAssetBaseUrl, UriKind.Absolute, out var assetUri)
            || assetUri.Scheme != Uri.UriSchemeHttps
            || !string.IsNullOrEmpty(assetUri.UserInfo)
            || !string.IsNullOrEmpty(assetUri.Query)
            || !string.IsNullOrEmpty(assetUri.Fragment))
        {
            failures.Add("Email:BrandAssetBaseUrl must be an absolute HTTPS URL without credentials, a query, or a fragment.");
        }
    }

    private static bool ContainsHeaderBreak(string value) =>
        value.Contains('\r') || value.Contains('\n');
}
