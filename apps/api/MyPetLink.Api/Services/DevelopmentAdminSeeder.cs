using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IDevelopmentAdminSeeder
{
    Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default);
}

public sealed class DevelopmentAdminSeeder : IDevelopmentAdminSeeder
{
    private const string FreePlanCode = "Free";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IHostEnvironment _environment;
    private readonly DevAuthOptions _options;

    public DevelopmentAdminSeeder(
        MyPetLinkDbContext dbContext,
        IHostEnvironment environment,
        IOptions<DevAuthOptions> options)
    {
        _dbContext = dbContext;
        _environment = environment;
        _options = options.Value;
    }

    public async Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default)
    {
        if (!_environment.IsDevelopment() || !_options.Enabled)
        {
            return false;
        }

        DevAuthOptions.ValidateForStartup(_environment, _options);
        var identity = _options.GetIdentity();

        var externalLogin = await _dbContext.ExternalLogins
            .Include(login => login.User)
                .ThenInclude(user => user.OwnerProfile)
                    .ThenInclude(profile => profile!.Plan)
            .Include(login => login.User.AdminUser)
            .SingleOrDefaultAsync(login =>
                login.Provider == ExternalLoginProviders.DevTest
                && login.ProviderSubjectId == identity.ProviderSubjectId,
                cancellationToken);

        User user;
        if (externalLogin is not null)
        {
            user = externalLogin.User;
            if (!string.Equals(
                    user.NormalizedEmail,
                    identity.NormalizedEmail,
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    "The configured Development Admin identity conflicts with an existing local login.");
            }
        }
        else
        {
            user = await _dbContext.Users
                .Include(item => item.OwnerProfile)
                    .ThenInclude(profile => profile!.Plan)
                .Include(item => item.AdminUser)
                .SingleOrDefaultAsync(
                    item => item.NormalizedEmail == identity.NormalizedEmail,
                    cancellationToken)
                ?? new User
                {
                    Email = identity.Email,
                    NormalizedEmail = identity.NormalizedEmail,
                    DisplayName = identity.DisplayName,
                    Status = UserStatus.Active
                };

            if (_dbContext.Entry(user).State == EntityState.Detached)
            {
                _dbContext.Users.Add(user);
            }

            externalLogin = new ExternalLogin
            {
                UserId = user.Id,
                User = user,
                Provider = ExternalLoginProviders.DevTest,
                ProviderSubjectId = identity.ProviderSubjectId,
                ProviderEmail = identity.Email,
                ProviderDisplayName = identity.DisplayName
            };
            _dbContext.ExternalLogins.Add(externalLogin);
        }

        if (user.Status != UserStatus.Active || user.DeletedAt.HasValue)
        {
            throw new InvalidOperationException(
                "The configured Development Admin email belongs to an inactive local user. Choose a different .local address.");
        }

        if (user.OwnerProfile is null)
        {
            var freePlan = await _dbContext.Plans
                .SingleOrDefaultAsync(
                    plan => plan.Code == FreePlanCode && plan.ArchivedAt == null,
                    cancellationToken)
                ?? throw new InvalidOperationException(
                    "The Free plan must exist before the Development Admin can be seeded. Apply the database migrations first.");

            user.OwnerProfile = new OwnerProfile
            {
                UserId = user.Id,
                User = user,
                PlanId = freePlan.Id,
                Plan = freePlan,
                OwnerDisplayName = identity.DisplayName
            };
            _dbContext.OwnerProfiles.Add(user.OwnerProfile);
        }

        var adminUser = user.AdminUser
            ?? await _dbContext.AdminUsers
                .SingleOrDefaultAsync(admin => admin.UserId == user.Id, cancellationToken);

        if (adminUser is null)
        {
            adminUser = new AdminUser
            {
                UserId = user.Id,
                User = user,
                Role = AdminRole.Admin,
                IsActive = true
            };
            _dbContext.AdminUsers.Add(adminUser);
        }
        else
        {
            adminUser.IsActive = true;
            adminUser.DisabledAt = null;
        }

        user.AdminUser = adminUser;

        await SeedDemoCatalogAsync(cancellationToken);

        await _dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    // Development-only demo catalog so the Product Catalog screens open with a
    // realistic example: one customer-facing product that owns two exact SKUs.
    // The Tag Types (Lightweight / Standard) are reused purely as
    // classifications — every price, capability, and specification lives on the
    // SKU, never on the Tag Type. Idempotent: keyed off the product's stable
    // link so re-running the seeder never duplicates rows.
    private async Task SeedDemoCatalogAsync(CancellationToken cancellationToken)
    {
        const string demoSlug = "mypetlink-paw-pet-tag";
        if (await _dbContext.TagProducts.AnyAsync(item => item.Slug == demoSlug, cancellationToken))
        {
            return;
        }

        var product = new TagProduct
        {
            Name = "MyPetLink Paw Pet Tag",
            Slug = demoSlug,
            ShortDescription = "Durable QR pet tag that links to your pet's Safety Profile.",
            Description = "Our everyday QR pet tag. A finder scans it to open the pet's Safety Profile and reach the owner through the contact options they have chosen to share.",
            IsPublished = true,
            IsArchived = false,
            SortOrder = 0
        };

        product.Variants.Add(new TagProductVariant
        {
            PublicKey = "PAWLWQRDEMO00001",
            Sku = "PAW-LW-QR",
            DisplayName = "Paw Pet Tag — Lightweight, QR",
            SupportsQr = true,
            SupportsNfc = false,
            TagVariantPresetId = MyPetLinkDbContext.LightweightVariantPresetId,
            TagVariant = "Lightweight",
            BasePrice = 39m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
            SortOrder = 0
        });

        product.Variants.Add(new TagProductVariant
        {
            PublicKey = "PAWSTDNFCDEMO001",
            Sku = "PAW-STD-NFC",
            DisplayName = "Paw Pet Tag — Standard, QR + NFC",
            SupportsQr = true,
            SupportsNfc = true,
            TagVariantPresetId = MyPetLinkDbContext.StandardVariantPresetId,
            TagVariant = "Standard",
            BasePrice = 59m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
            SortOrder = 1
        });

        _dbContext.TagProducts.Add(product);
    }
}
