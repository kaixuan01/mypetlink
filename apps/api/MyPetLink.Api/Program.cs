using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Middleware;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

var builder = WebApplication.CreateBuilder(args);
const string FrontendCorsPolicy = "MyPetLinkFrontend";

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<GoogleAuthOptions>(builder.Configuration.GetSection(GoogleAuthOptions.SectionName));
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection(StorageOptions.SectionName));

builder.Services.AddHttpContextAccessor();
builder.Services.AddDbContext<MyPetLinkDbContext>(options =>
{
    var configuredConnectionString = builder.Configuration.GetConnectionString("MyPetLinkDb");
    var connectionString = string.IsNullOrWhiteSpace(configuredConnectionString)
        ? "Server=(localdb)\\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;"
        : configuredConnectionString;

    options.UseSqlServer(connectionString);
});

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
builder.Services.AddScoped<IOwnerProfileService, OwnerProfileService>();
builder.Services.AddScoped<IExternalAuthService, ExternalAuthService>();
builder.Services.AddScoped<IExternalTokenValidator, GoogleTokenValidator>();
builder.Services.AddScoped<IAuthorizationHandler, ActiveAdminRequirementHandler>();
builder.Services.AddScoped<IPetService, PetService>();
builder.Services.AddScoped<IPublicProfileService, PublicProfileService>();
builder.Services.AddScoped<IQrSafetyService, QrSafetyService>();
builder.Services.AddScoped<ITagScanService, TagScanService>();
builder.Services.AddScoped<ISmartTagService, SmartTagService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IPaymentProofService, PaymentProofService>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IFileStorageProvider, LocalFileStorageProvider>();

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

app.UseMiddleware<RequestContextMiddleware>();
app.UseMiddleware<ErrorHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors(FrontendCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok" }, context))).AllowAnonymous();
app.MapGet("/api/v1/health", (HttpContext context) =>
    Results.Ok(ApiEnvelope.Ok(new { status = "ok", service = "MyPetLink.Api" }, context))).AllowAnonymous();

app.Run();
