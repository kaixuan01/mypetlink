using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Auth;

/// <summary>
/// Refuses an access token whose account is no longer active — suspended by an
/// administrator or deleted — on the next request, rather than when the token
/// expires.
///
/// Sign-in and refresh already refuse a non-active account; this closes the
/// window an access token issued before the change would otherwise leave open
/// (up to its lifetime). It is one primary-key read, made only for requests
/// that carry a bearer token: anonymous requests — finders opening a Safety
/// Profile, Smart Tag QR and NFC scans — never reach it. A refused token on an
/// endpoint that allows anonymous access simply continues as anonymous, so
/// public pages keep working for everyone.
///
/// Account status only. A Community restriction is not an account status and
/// never reaches here.
/// </summary>
public static class ActiveAccountTokenCheck
{
    public const string ErrorCode = "user_inactive";
    public const string ErrorMessage = "This user account is not active.";

    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        var subject = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(subject, out var userId))
        {
            context.Fail(new InactiveAccountException());
            return;
        }

        var dbContext = context.HttpContext.RequestServices.GetRequiredService<MyPetLinkDbContext>();
        var active = await dbContext.Users
            .AsNoTracking()
            .AnyAsync(
                user => user.Id == userId && user.DeletedAt == null && user.Status == UserStatus.Active,
                context.HttpContext.RequestAborted);

        if (!active)
        {
            context.Fail(new InactiveAccountException());
        }
    }
}

/// <summary>The authentication failure for a token whose account is no longer active.</summary>
public sealed class InactiveAccountException : Exception
{
    public InactiveAccountException()
        : base(ActiveAccountTokenCheck.ErrorMessage)
    {
    }
}
