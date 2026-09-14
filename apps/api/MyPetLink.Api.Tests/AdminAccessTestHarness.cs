using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

internal sealed class StubCurrentUserService : ICurrentUserService
{
    private readonly Guid? _userId;

    public StubCurrentUserService(Guid? userId)
    {
        _userId = userId;
    }

    public CurrentUser Current => new(
        _userId,
        _userId is null ? null : "operator@example.test",
        _userId is null ? [] : [RoleConstants.Admin]);
}

/// <summary>
/// Builds an in-memory database that already has the built-in roles seeded, so
/// authorization tests exercise the same role and capability rows a deployed
/// database has.
/// </summary>
internal static class AdminAccessTestHarness
{
    internal static MyPetLinkDbContext CreateDb(string? name = null)
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseInMemoryDatabase(name ?? $"admin-access-{Guid.NewGuid():N}")
            .ReplaceService<IModelCustomizer, ClientRowVersionModelCustomizer>()
            .Options;

        return new MyPetLinkDbContext(options);
    }

    /// <summary>
    /// SQL Server fills <c>rowversion</c> columns itself. The in-memory provider
    /// enforces the concurrency token but never generates a value, so these
    /// tests supply it from the client instead. That keeps the optimistic
    /// concurrency path genuinely exercised rather than silently skipped.
    /// </summary>
    private sealed class ClientRowVersionModelCustomizer : ModelCustomizer
    {
        public ClientRowVersionModelCustomizer(ModelCustomizerDependencies dependencies)
            : base(dependencies)
        {
        }

        public override void Customize(ModelBuilder modelBuilder, DbContext context)
        {
            base.Customize(modelBuilder, context);

            modelBuilder.Entity<AdminUser>()
                .Property(admin => admin.RowVersion)
                .ValueGeneratedNever();
            modelBuilder.Entity<AdminRoleDefinition>()
                .Property(role => role.RowVersion)
                .ValueGeneratedNever();
        }
    }

    /// <summary>One admin whose legacy role has been migrated onto a built-in role.</summary>
    internal static async Task<MyPetLinkDbContext> CreateAsync(AdminRole legacyRole)
    {
        var db = CreateDb();
        await AddAdminAsync(db, legacyRole, "operator@example.test", "Operator");
        await new AdminAccessSeeder(db).EnsureSeededAsync();
        await StampRowVersionsAsync(db);
        return db;
    }

    internal static async Task<AdminUser> AddAdminAsync(
        MyPetLinkDbContext db,
        AdminRole legacyRole,
        string email,
        string displayName,
        bool isActive = true)
    {
        var user = new User
        {
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = displayName,
            Status = UserStatus.Active,
        };

        var admin = new AdminUser
        {
            UserId = user.Id,
            User = user,
            Role = legacyRole,
            IsActive = isActive,
            DisabledAt = isActive ? null : DateTimeOffset.UtcNow,
        };

        db.Add(user);
        db.Add(admin);
        await db.SaveChangesAsync();
        await StampRowVersionsAsync(db);
        return admin;
    }

    /// <summary>
    /// SQL Server fills <c>rowversion</c> columns itself; the in-memory provider
    /// used by these tests does not, but it does enforce the concurrency token.
    /// Stamping any empty value keeps the optimistic-concurrency path exercised
    /// instead of silently skipped.
    /// </summary>
    internal static async Task StampRowVersionsAsync(MyPetLinkDbContext db)
    {
        var changed = false;

        foreach (var admin in await db.AdminUsers.Where(item => item.RowVersion.Length == 0).ToListAsync())
        {
            admin.RowVersion = Guid.NewGuid().ToByteArray().Take(8).ToArray();
            changed = true;
        }

        foreach (var role in await db.AdminRoles.Where(item => item.RowVersion.Length == 0).ToListAsync())
        {
            role.RowVersion = Guid.NewGuid().ToByteArray().Take(8).ToArray();
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }

    /// <summary>Replaces an admin's role assignments with the named built-in roles.</summary>
    internal static async Task SetRolesAsync(
        MyPetLinkDbContext db,
        AdminUser admin,
        params string[] roleCodes)
    {
        var existing = await db.AdminUserRoles
            .Where(assignment => assignment.AdminUserId == admin.Id)
            .ToListAsync();
        db.AdminUserRoles.RemoveRange(existing);

        foreach (var code in roleCodes)
        {
            var role = await db.AdminRoles.SingleAsync(item => item.Code == code);
            db.AdminUserRoles.Add(new AdminUserRoleAssignment
            {
                AdminUserId = admin.Id,
                AdminRoleId = role.Id,
            });
        }

        await db.SaveChangesAsync();
    }

    internal static async Task<AdminAccessSnapshot> ResolveAsync(MyPetLinkDbContext db, Guid userId) =>
        await new AdminAccessResolver(db, new StubCurrentUserService(userId)).ResolveAsync(userId);

    internal static AdminAccessManagementService ManagementFor(MyPetLinkDbContext db, Guid userId) =>
        new(
            db,
            new AdminAccessResolver(db, new StubCurrentUserService(userId)),
            new AuditLogService(db, new Microsoft.AspNetCore.Http.HttpContextAccessor()),
            TimeProvider.System);
}
