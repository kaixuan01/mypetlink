using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class AuthService : SkeletonService, IAuthService
{
    private const string FreePlanCode = "Free";
    private const int DefaultAccessTokenMinutes = 15;
    private const int DefaultRefreshTokenDays = 30;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IExternalAuthService _externalAuthService;
    private readonly JwtOptions _jwtOptions;
    private readonly IHostEnvironment _environment;
    private readonly HashSet<string> _devAdminEmails;

    public AuthService(
        MyPetLinkDbContext dbContext,
        IExternalAuthService externalAuthService,
        IOptions<JwtOptions> jwtOptions,
        IOptions<AdminSeedOptions> adminSeedOptions,
        IHostEnvironment environment)
    {
        _dbContext = dbContext;
        _externalAuthService = externalAuthService;
        _jwtOptions = jwtOptions.Value;
        _environment = environment;
        _devAdminEmails = (adminSeedOptions.Value.Emails ?? [])
            .Where(email => !string.IsNullOrWhiteSpace(email))
            .Select(NormalizeEmail)
            .ToHashSet();
    }

    public async Task<AuthTokenResponse> SignInWithGoogleAsync(
        GoogleLoginRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default)
    {
        var externalUser = await _externalAuthService.ValidateAsync(
            ExternalLoginProviders.Google,
            request.IdToken,
            cancellationToken);

        return await SignInWithExternalUserAsync(externalUser, clientContext, cancellationToken);
    }

    public async Task<TokenRefreshResponse> RefreshAsync(
        RefreshTokenRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            throw ValidationFailed("refreshToken", "Refresh token is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var tokenHash = HashRefreshToken(request.RefreshToken);

        var storedToken = await _dbContext.RefreshTokens
            .Include(token => token.User)
                .ThenInclude(user => user.OwnerProfile)
                    .ThenInclude(profile => profile!.Plan)
            .Include(token => token.User.AdminUser)
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null)
        {
            throw InvalidRefreshToken();
        }

        if (storedToken.RevokedAt.HasValue)
        {
            await RevokeActiveRefreshTokensForUserAsync(
                storedToken.UserId,
                now,
                clientContext.IpAddress,
                cancellationToken);

            await _dbContext.SaveChangesAsync(cancellationToken);
            throw InvalidRefreshToken();
        }

        if (storedToken.ExpiresAt <= now)
        {
            throw InvalidRefreshToken();
        }

        EnsureUserCanAuthenticate(storedToken.User);

        var replacement = CreateRefreshToken(storedToken.UserId, clientContext, now);
        storedToken.RevokedAt = now;
        storedToken.RevokedByIp = clientContext.IpAddress;
        storedToken.ReplacedByTokenId = replacement.Entity.Id;

        _dbContext.RefreshTokens.Add(replacement.Entity);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var accessToken = CreateAccessToken(storedToken.User, now);

        return new TokenRefreshResponse(
            accessToken.Token,
            replacement.RawToken,
            accessToken.ExpiresIn);
    }

    public async Task LogoutAsync(
        LogoutRequest request,
        AuthClientContext clientContext,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            return;
        }

        var tokenHash = HashRefreshToken(request.RefreshToken);
        var storedToken = await _dbContext.RefreshTokens
            .SingleOrDefaultAsync(token => token.TokenHash == tokenHash, cancellationToken);

        if (storedToken is null || storedToken.RevokedAt.HasValue)
        {
            return;
        }

        storedToken.RevokedAt = DateTimeOffset.UtcNow;
        storedToken.RevokedByIp = clientContext.IpAddress;

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<CurrentSessionResponse> GetCurrentSessionAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadCurrentUserAsync(currentUserId, cancellationToken);

        return new CurrentSessionResponse(
            BuildUserSummary(user),
            BuildOwnerProfileSummary(user.OwnerProfile),
            BuildAdminProfileSummary(user.AdminUser));
    }

    public async Task<AdminAuthCheckResponse> GetAdminAuthCheckAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var user = await LoadCurrentUserAsync(currentUserId, cancellationToken);
        var admin = BuildAdminProfileSummary(user.AdminUser);

        if (admin is not { IsActive: true })
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "forbidden",
                "Admin access is required.");
        }

        return new AdminAuthCheckResponse(BuildUserSummary(user), admin);
    }

    private async Task<AuthTokenResponse> SignInWithExternalUserAsync(
        ExternalTokenUser externalUser,
        AuthClientContext clientContext,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedEmail = NormalizeEmail(externalUser.Email);

        var externalLogin = await _dbContext.ExternalLogins
            .Include(login => login.User)
                .ThenInclude(user => user.OwnerProfile)
                    .ThenInclude(profile => profile!.Plan)
            .Include(login => login.User.AdminUser)
            .SingleOrDefaultAsync(login =>
                login.Provider == externalUser.Provider
                && login.ProviderSubjectId == externalUser.SubjectId,
                cancellationToken);

        User user;

        if (externalLogin is not null)
        {
            user = externalLogin.User;
        }
        else
        {
            var existingUser = await _dbContext.Users
                .Include(item => item.OwnerProfile)
                    .ThenInclude(profile => profile!.Plan)
                .Include(item => item.AdminUser)
                .SingleOrDefaultAsync(item => item.NormalizedEmail == normalizedEmail, cancellationToken);

            if (existingUser is null)
            {
                user = CreateUser(externalUser, normalizedEmail);
                _dbContext.Users.Add(user);
            }
            else
            {
                user = existingUser;
            }

            externalLogin = new ExternalLogin
            {
                UserId = user.Id,
                Provider = externalUser.Provider,
                ProviderSubjectId = externalUser.SubjectId
            };

            _dbContext.ExternalLogins.Add(externalLogin);
        }

        await EnsureEmailCanBeAssignedAsync(user, normalizedEmail, cancellationToken);
        EnsureUserCanAuthenticate(user);
        UpdateUserFromExternalLogin(user, externalUser, normalizedEmail, now);
        UpdateExternalLogin(externalLogin, externalUser);

        await EnsureOwnerProfileAsync(user, externalUser.DisplayName, cancellationToken);
        await EnsureDevAdminAsync(user, normalizedEmail, cancellationToken);

        var refreshToken = CreateRefreshToken(user.Id, clientContext, now);
        _dbContext.RefreshTokens.Add(refreshToken.Entity);

        var accessToken = CreateAccessToken(user, now);

        await _dbContext.SaveChangesAsync(cancellationToken);

        return new AuthTokenResponse(
            accessToken.Token,
            refreshToken.RawToken,
            accessToken.ExpiresIn,
            BuildUserSummary(user),
            BuildOwnerProfileSummary(user.OwnerProfile));
    }

    private async Task EnsureEmailCanBeAssignedAsync(
        User user,
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        if (string.Equals(user.NormalizedEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var emailInUse = await _dbContext.Users
            .AnyAsync(item => item.Id != user.Id && item.NormalizedEmail == normalizedEmail, cancellationToken);

        if (emailInUse)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "email_already_linked",
                "This email address is already linked to another user.");
        }
    }

    private async Task<User> LoadCurrentUserAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken)
    {
        if (!currentUserId.HasValue)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .Include(item => item.OwnerProfile)
                .ThenInclude(profile => profile!.Plan)
            .Include(item => item.AdminUser)
            .SingleOrDefaultAsync(item => item.Id == currentUserId.Value, cancellationToken);

        if (user is null || user.DeletedAt.HasValue)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        }

        EnsureUserCanAuthenticate(user);
        return user;
    }

    private static User CreateUser(ExternalTokenUser externalUser, string normalizedEmail)
    {
        var displayName = CleanDisplayName(externalUser.DisplayName, externalUser.Email);

        return new User
        {
            Email = externalUser.Email.Trim(),
            NormalizedEmail = normalizedEmail,
            DisplayName = displayName,
            Status = UserStatus.Active
        };
    }

    private static void UpdateUserFromExternalLogin(
        User user,
        ExternalTokenUser externalUser,
        string normalizedEmail,
        DateTimeOffset now)
    {
        user.Email = externalUser.Email.Trim();
        user.NormalizedEmail = normalizedEmail;

        var displayName = CleanDisplayName(externalUser.DisplayName, externalUser.Email);
        if (string.IsNullOrWhiteSpace(user.DisplayName) || user.DisplayName == user.Email)
        {
            user.DisplayName = displayName;
        }

        user.LastLoginAt = now;
    }

    private static void UpdateExternalLogin(ExternalLogin login, ExternalTokenUser externalUser)
    {
        login.ProviderEmail = externalUser.Email.Trim();
        login.ProviderDisplayName = externalUser.DisplayName;
    }

    private async Task EnsureOwnerProfileAsync(
        User user,
        string? displayName,
        CancellationToken cancellationToken)
    {
        if (user.OwnerProfile is not null)
        {
            return;
        }

        var freePlan = await _dbContext.Plans
            .SingleOrDefaultAsync(plan => plan.Code == FreePlanCode && plan.ArchivedAt == null, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status500InternalServerError,
                "default_plan_not_configured",
                "The default owner plan is not configured.");

        var ownerProfile = new OwnerProfile
        {
            UserId = user.Id,
            PlanId = freePlan.Id,
            Plan = freePlan,
            OwnerDisplayName = CleanDisplayName(displayName, user.Email)
        };

        user.OwnerProfile = ownerProfile;
        _dbContext.OwnerProfiles.Add(ownerProfile);
    }

    // Development-only convenience: promote a configured email to an active
    // admin on login so /admin is reachable locally without a manual SQL step.
    // Guarded by IsDevelopment(), so it can never run in production. Idempotent:
    // an existing AdminUsers row is reactivated rather than duplicated.
    private async Task EnsureDevAdminAsync(
        User user,
        string normalizedEmail,
        CancellationToken cancellationToken)
    {
        if (!_environment.IsDevelopment()
            || _devAdminEmails.Count == 0
            || !_devAdminEmails.Contains(normalizedEmail))
        {
            return;
        }

        var adminUser = user.AdminUser
            ?? await _dbContext.AdminUsers
                .SingleOrDefaultAsync(admin => admin.UserId == user.Id, cancellationToken);

        if (adminUser is null)
        {
            adminUser = new AdminUser
            {
                UserId = user.Id,
                Role = AdminRole.SuperAdmin,
                IsActive = true
            };

            _dbContext.AdminUsers.Add(adminUser);
        }
        else
        {
            adminUser.IsActive = true;
            adminUser.DisabledAt = null;
        }

        // Attach so this same login's token/`/auth/me` reflect admin immediately.
        user.AdminUser = adminUser;
    }

    private static void EnsureUserCanAuthenticate(User user)
    {
        if (user.DeletedAt.HasValue || user.Status == UserStatus.Deleted)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        }

        if (user.Status != UserStatus.Active)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "user_inactive",
                "This user account is not active.");
        }
    }

    private RefreshTokenPair CreateRefreshToken(
        Guid userId,
        AuthClientContext clientContext,
        DateTimeOffset now)
    {
        var rawToken = GenerateSecureToken();
        var entity = new RefreshToken
        {
            UserId = userId,
            TokenHash = HashRefreshToken(rawToken),
            ExpiresAt = now.AddDays(GetRefreshTokenDays()),
            CreatedAt = now,
            CreatedByIp = clientContext.IpAddress,
            UserAgent = clientContext.UserAgent
        };

        return new RefreshTokenPair(rawToken, entity);
    }

    private AccessTokenResult CreateAccessToken(User user, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(_jwtOptions.SigningKey))
        {
            throw new ApiException(
                StatusCodes.Status500InternalServerError,
                "auth_not_configured",
                "Token signing is not configured.");
        }

        var accessTokenMinutes = GetAccessTokenMinutes();
        var expiresAt = now.AddMinutes(accessTokenMinutes);
        var roles = ResolveRoles(user);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email)
        };

        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.SigningKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new AccessTokenResult(
            new JwtSecurityTokenHandler().WriteToken(token),
            checked(accessTokenMinutes * 60));
    }

    private async Task RevokeActiveRefreshTokensForUserAsync(
        Guid userId,
        DateTimeOffset now,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var activeTokens = await _dbContext.RefreshTokens
            .Where(token =>
                token.UserId == userId
                && token.RevokedAt == null
                && token.ExpiresAt > now)
            .ToListAsync(cancellationToken);

        foreach (var token in activeTokens)
        {
            token.RevokedAt = now;
            token.RevokedByIp = ipAddress;
        }
    }

    private static CurrentUserSummaryResponse BuildUserSummary(User user)
    {
        return new CurrentUserSummaryResponse(
            user.Id,
            user.Email,
            user.DisplayName,
            ResolveRoles(user),
            user.Status.ToString());
    }

    private static OwnerProfileSummaryResponse? BuildOwnerProfileSummary(OwnerProfile? ownerProfile)
    {
        if (ownerProfile is null || ownerProfile.ArchivedAt.HasValue)
        {
            return null;
        }

        return new OwnerProfileSummaryResponse(
            ownerProfile.Id,
            ownerProfile.OwnerDisplayName,
            ownerProfile.Plan.Code,
            ownerProfile.Plan.Name);
    }

    private static AdminProfileSummaryResponse? BuildAdminProfileSummary(AdminUser? adminUser)
    {
        if (adminUser is null)
        {
            return null;
        }

        return new AdminProfileSummaryResponse(
            adminUser.Role.ToString(),
            adminUser.IsActive && adminUser.DisabledAt == null);
    }

    private static string[] ResolveRoles(User user)
    {
        var roles = new List<string>();

        if (user.OwnerProfile is { ArchivedAt: null })
        {
            roles.Add(RoleConstants.Owner);
        }

        if (user.AdminUser is { IsActive: true, DisabledAt: null })
        {
            roles.Add(RoleConstants.Admin);
        }

        return roles.ToArray();
    }

    private int GetAccessTokenMinutes()
    {
        return _jwtOptions.AccessTokenMinutes > 0
            ? _jwtOptions.AccessTokenMinutes
            : DefaultAccessTokenMinutes;
    }

    private int GetRefreshTokenDays()
    {
        return _jwtOptions.RefreshTokenDays > 0
            ? _jwtOptions.RefreshTokenDays
            : DefaultRefreshTokenDays;
    }

    private static string NormalizeEmail(string email)
    {
        return email.Trim().ToUpper(CultureInfo.InvariantCulture);
    }

    private static string CleanDisplayName(string? displayName, string email)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        var atIndex = email.IndexOf('@', StringComparison.Ordinal);
        return atIndex > 0 ? email[..atIndex] : email.Trim();
    }

    private static string GenerateSecureToken()
    {
        return Base64UrlEncode(RandomNumberGenerator.GetBytes(64));
    }

    private static string HashRefreshToken(string refreshToken)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken))).ToLowerInvariant();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static ApiException ValidationFailed(string field, string message)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]>
            {
                [field] = [message]
            });
    }

    private static ApiException InvalidRefreshToken()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "invalid_refresh_token",
            "Refresh token is invalid or expired.");
    }

    private sealed record AccessTokenResult(string Token, int ExpiresIn);

    private sealed record RefreshTokenPair(string RawToken, RefreshToken Entity);
}
