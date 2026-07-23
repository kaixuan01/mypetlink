using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Middleware;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

// QuestPDF Community license (free for small businesses / open use). Must be
// set before any document is generated.
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);
const string FrontendCorsPolicy = "MyPetLinkFrontend";

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<GoogleAuthOptions>(builder.Configuration.GetSection(GoogleAuthOptions.SectionName));
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.AddOptions<CloudflareR2Options>()
    .Bind(builder.Configuration.GetSection(CloudflareR2Options.SectionName))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<CloudflareR2Options>, CloudflareR2OptionsValidator>();
builder.Services.Configure<FeatureOptions>(builder.Configuration.GetSection(FeatureOptions.SectionName));
builder.Services.Configure<PublicSiteOptions>(builder.Configuration.GetSection(PublicSiteOptions.SectionName));
builder.Services.Configure<AdminSeedOptions>(builder.Configuration.GetSection(AdminSeedOptions.SectionName));
builder.Services.Configure<DevAuthOptions>(builder.Configuration.GetSection(DevAuthOptions.SectionName));
builder.Services.Configure<DatabaseResilienceOptions>(
    builder.Configuration.GetSection(DatabaseResilienceOptions.SectionName));
builder.Services.Configure<SmartTagRateLimitingOptions>(
    builder.Configuration.GetSection(SmartTagRateLimitingOptions.SectionName));
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = Math.Clamp(
        builder.Configuration.GetValue("ForwardedHeaders:ForwardLimit", 2),
        1,
        5);

    foreach (var value in builder.Configuration
                 .GetSection("ForwardedHeaders:KnownProxies")
                 .Get<string[]>() ?? [])
    {
        if (IPAddress.TryParse(value, out var address))
        {
            options.KnownProxies.Add(address);
        }
    }

    foreach (var value in builder.Configuration
                 .GetSection("ForwardedHeaders:KnownNetworks")
                 .Get<string[]>() ?? [])
    {
        var parts = value.Split('/', 2, StringSplitOptions.TrimEntries);
        if (parts.Length == 2
            && IPAddress.TryParse(parts[0], out var prefix)
            && int.TryParse(parts[1], out var prefixLength))
        {
            options.KnownNetworks.Add(
                new Microsoft.AspNetCore.HttpOverrides.IPNetwork(
                    prefix,
                    prefixLength));
        }
    }
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(
        SmartTagRateLimitPolicies.PublicTagScan,
        context => FixedWindowPartition(
            SmartTagRateLimitPartitions.PublicScan(context),
            context.RequestServices
                .GetRequiredService<IOptions<SmartTagRateLimitingOptions>>()
                .Value
                .PublicTagScan));
    options.AddPolicy(
        SmartTagRateLimitPolicies.TagActivation,
        context => FixedWindowPartition(
            SmartTagRateLimitPartitions.Activation(context),
            context.RequestServices
                .GetRequiredService<IOptions<SmartTagRateLimitingOptions>>()
                .Value
                .TagActivation));
    options.OnRejected = async (context, cancellationToken) =>
    {
        var retryAfterSeconds = context.Lease.TryGetMetadata(
            MetadataName.RetryAfter,
            out var retryAfter)
            ? Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds))
            : (int?)null;

        context.HttpContext.Response.StatusCode =
            StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";
        context.HttpContext.Response.Headers["X-Request-Id"] =
            ApiEnvelope.GetRequestId(context.HttpContext);
        if (retryAfterSeconds.HasValue)
        {
            context.HttpContext.Response.Headers.RetryAfter =
                retryAfterSeconds.Value.ToString();
        }

        var response = ApiEnvelope.Error(
            context.HttpContext,
            "rate_limit_exceeded",
            "Too many requests. Please wait a moment and try again.",
            retryAfterSeconds: retryAfterSeconds);
        await JsonSerializer.SerializeAsync(
            context.HttpContext.Response.Body,
            response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web),
            cancellationToken);
    };
});

var devAuth = builder.Configuration
    .GetSection(DevAuthOptions.SectionName)
    .Get<DevAuthOptions>() ?? new DevAuthOptions();
DevAuthOptions.ValidateForStartup(builder.Environment, devAuth);

var databaseResilience = builder.Configuration
    .GetSection(DatabaseResilienceOptions.SectionName)
    .Get<DatabaseResilienceOptions>() ?? new DatabaseResilienceOptions();

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("PublicProfileSocialMedia")
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = System.Net.DecompressionMethods.All
    });
builder.Services.AddDbContext<MyPetLinkDbContext>(options =>
{
    var configuredConnectionString = builder.Configuration.GetConnectionString("MyPetLinkDb");
    var connectionString = string.IsNullOrWhiteSpace(configuredConnectionString)
        ? "Server=(localdb)\\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;"
        : configuredConnectionString;

    options.UseSqlServer(connectionString, sqlOptions =>
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: Math.Clamp(databaseResilience.MaxRetryCount, 0, 20),
            maxRetryDelay: TimeSpan.FromSeconds(Math.Clamp(
                databaseResilience.MaxRetryDelaySeconds,
                1,
                60)),
            errorNumbersToAdd: null));
});
builder.Services.AddScoped<IDatabaseTransientExceptionClassifier, DatabaseTransientExceptionClassifier>();
builder.Services.AddScoped<IDatabaseReadinessProbe, DatabaseReadinessProbe>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var errors = ApiEnvelope.ModelStateErrors(context);
        var response = ApiEnvelope.Error(
            context.HttpContext,
            "validation_failed",
            "Please check the submitted fields.",
            errors);

        return new BadRequestObjectResult(response);
    };
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCorsPolicy, policy =>
    {
        var configuredOrigins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? Array.Empty<string>();
        var origins = configuredOrigins
            .Where(origin => !string.IsNullOrWhiteSpace(origin))
            .Select(origin => origin.Trim().TrimEnd('/'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (origins.Length == 0 && builder.Environment.IsDevelopment())
        {
            origins =
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3001"
            ];
        }

        if (origins.Length > 0)
        {
            policy
                .WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.SigningKey))
{
    throw new InvalidOperationException("Jwt:SigningKey must be configured before starting the API.");
}

var apiJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            ClockSkew = TimeSpan.FromMinutes(2)
        };

        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();

                if (context.Response.HasStarted)
                {
                    return;
                }

                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json";

                var response = ApiEnvelope.Error(
                    context.HttpContext,
                    "unauthorized",
                    "Authentication is required.");

                await JsonSerializer.SerializeAsync(
                    context.Response.Body,
                    response,
                    apiJsonOptions,
                    context.HttpContext.RequestAborted);
            },
            OnForbidden = async context =>
            {
                if (context.Response.HasStarted)
                {
                    return;
                }

                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json";

                var response = ApiEnvelope.Error(
                    context.HttpContext,
                    "forbidden",
                    "You do not have permission to access this resource.");

                await JsonSerializer.SerializeAsync(
                    context.Response.Body,
                    response,
                    apiJsonOptions,
                    context.HttpContext.RequestAborted);
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(AuthorizationPolicies.Owner, policy =>
        policy.RequireAuthenticatedUser());

    options.AddPolicy(AuthorizationPolicies.Admin, policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.Requirements.Add(new ActiveAdminRequirement());
    });
});

builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IDevelopmentAdminSeeder, DevelopmentAdminSeeder>();
builder.Services.AddSingleton<IDevelopmentAuthRequestGuard, DevelopmentAuthRequestGuard>();
builder.Services.AddScoped<IOwnerProfileService, OwnerProfileService>();
builder.Services.AddScoped<IExternalAuthService, ExternalAuthService>();
builder.Services.AddScoped<IExternalTokenValidator, GoogleTokenValidator>();
builder.Services.AddScoped<IAuthorizationHandler, ActiveAdminRequirementHandler>();
builder.Services.AddScoped<IPetService, PetService>();
builder.Services.AddScoped<IPublicProfileService, PublicProfileService>();
builder.Services.AddSingleton<IPublicProfileSocialCardRenderer, PublicProfileSocialCardRenderer>();
builder.Services.AddScoped<IMemoryService, MemoryService>();
builder.Services.AddScoped<ICareRecordService, CareRecordService>();
builder.Services.AddScoped<IMediaService, MediaService>();
builder.Services.AddScoped<IQrSafetyService, QrSafetyService>();
builder.Services.AddScoped<ITagScanService, TagScanService>();
builder.Services.AddScoped<ISmartTagService, SmartTagService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<ITagPricingService, TagPricingService>();
builder.Services.AddScoped<ITagCatalogService, TagCatalogService>();
builder.Services.AddScoped<IOrderDocumentService, OrderDocumentService>();
builder.Services.AddScoped<IPaymentProofService, PaymentProofService>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IAdminOrderQueryService, AdminOrderQueryService>();
builder.Services.AddScoped<IAdminPaymentProofQueryService, AdminPaymentProofQueryService>();
builder.Services.AddScoped<IAdminPetProfileQueryService, AdminPetProfileQueryService>();
builder.Services.AddScoped<IAdminOwnerQueryService, AdminOwnerQueryService>();
builder.Services.AddScoped<IAdminPlanQueryService, AdminPlanQueryService>();
builder.Services.AddScoped<IAdminTagInventoryService, AdminTagInventoryService>();
builder.Services.AddScoped<IAdminSmartTagService, AdminSmartTagService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IFileStorageProvider, LocalFileStorageProvider>();
builder.Services.AddSingleton<IObjectStorageService, CloudflareR2StorageService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "MyPetLink API",
        Version = "v1",
        Description = "Initial .NET 8 backend API skeleton for MyPetLink."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });

    options.OperationFilter<AuthorizeOperationFilter>();
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseMiddleware<RequestContextMiddleware>();
app.UseMiddleware<ErrorHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseCors(FrontendCorsPolicy);
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

if (app.Environment.IsDevelopment() && devAuth.Enabled)
{
    // The explicit Development opt-in seeds only the configured .local user.
    // Missing schema/default plan errors stop local startup instead of silently
    // creating a partial identity or applying migrations automatically.
    await using (var scope = app.Services.CreateAsyncScope())
    {
        await scope.ServiceProvider
            .GetRequiredService<IDevelopmentAdminSeeder>()
            .EnsureSeededAsync();
    }

    app.MapPost(
            "/api/v1/dev-auth/admin-login",
            async (
                HttpContext context,
                IDevelopmentAuthRequestGuard requestGuard,
                IAuthService authService,
                CancellationToken cancellationToken) =>
            {
                if (!requestGuard.IsLoopback(context))
                {
                    return Results.Json(
                        ApiEnvelope.Error(context, "not_found", "Not found."),
                        statusCode: StatusCodes.Status404NotFound);
                }

                var userAgent = context.Request.Headers.TryGetValue("User-Agent", out var values)
                    ? values.ToString()
                    : null;
                var response = await authService.SignInWithDevelopmentAdminAsync(
                    new AuthClientContext(
                        context.Connection.RemoteIpAddress?.ToString(),
                        userAgent),
                    cancellationToken);

                return Results.Ok(ApiEnvelope.Ok(response, context));
            })
        .AllowAnonymous();
}

app.MapControllers();
app.MapGet("/health", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok" }, context))).AllowAnonymous();
app.MapGet("/health/live", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok" }, context))).AllowAnonymous();
app.MapGet("/api/v1/health", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok", service = "MyPetLink.Api" }, context))).AllowAnonymous();
app.MapGet("/api/v1/health/live", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok" }, context))).AllowAnonymous();

// Readiness probe: verifies the database is reachable. Returns 200 when ready,
// 503 when the database is unavailable. CanConnectAsync never throws, so a DB
// outage yields a clean 503 rather than an exception.
static async Task<IResult> ReadinessResult(
    HttpContext context,
    IDatabaseReadinessProbe readinessProbe,
    IOptions<DatabaseResilienceOptions> resilienceOptions)
{
    var databaseReady = await readinessProbe.IsReadyAsync(context.RequestAborted);

    if (!databaseReady)
    {
        var retryAfterSeconds = Math.Clamp(resilienceOptions.Value.ApiRetryAfterSeconds, 1, 60);
        context.Response.Headers.RetryAfter = retryAfterSeconds.ToString();

        return Results.Json(
            ApiEnvelope.Error(
                context,
                "not_ready",
                "MyPetLink is not ready yet.",
                retryAfterSeconds: retryAfterSeconds),
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    return Results.Ok(ApiEnvelope.Ok(new { status = "ready" }, context));
}

app.MapGet("/health/ready", ReadinessResult).AllowAnonymous();
app.MapGet("/api/v1/health/ready", ReadinessResult).AllowAnonymous();

app.Run();

static RateLimitPartition<string> FixedWindowPartition(
    string partitionKey,
    RequestRateLimitOptions configured)
{
    var permitLimit = Math.Clamp(configured.PermitLimit, 1, 10_000);
    var windowSeconds = Math.Clamp(configured.WindowSeconds, 1, 3_600);
    var queueLimit = Math.Clamp(configured.QueueLimit, 0, 10_000);

    return RateLimitPartition.GetFixedWindowLimiter(
        partitionKey,
        _ => new FixedWindowRateLimiterOptions
        {
            AutoReplenishment = true,
            PermitLimit = permitLimit,
            Window = TimeSpan.FromSeconds(windowSeconds),
            QueueLimit = queueLimit,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        });
}

public partial class Program;
