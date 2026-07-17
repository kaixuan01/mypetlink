using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class AdminPlanQueryServiceTests
{
    private static readonly Guid AdminUserId = Guid.Parse("61111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerLightId = Guid.Parse("62222222-2222-2222-2222-222222222222");
    private static readonly Guid OwnerFullId = Guid.Parse("63333333-3333-3333-3333-333333333333");
    private static readonly Guid OwnerLegacyId = Guid.Parse("64444444-4444-4444-4444-444444444444");
    private static readonly Guid OwnerOverrideId = Guid.Parse("65555555-5555-5555-5555-555555555555");

    // --- Plan definitions -----------------------------------------------------------

    [Fact]
    public async Task ListDefinitions_ReturnsSeededLimitsEntitlementsAndOwnerCounts()
    {
        using var harness = await PlanHarness.CreateAsync();

        var definitions = await harness.Service.ListDefinitionsAsync();
        var free = definitions.Single(plan => plan.Code == "Free");
        var premium = definitions.Single(plan => plan.Code == "Premium");

        Assert.Equal(3, free.MaxPets);
        Assert.Equal(10, free.MaxMemoriesPerPet);
        Assert.Equal(100, free.MaxCareRecords);
        Assert.True(free.AllowsSmartTagAddOns);
        Assert.False(free.AllowsAdvancedThemes);
        Assert.Equal("Available", free.Status);
        Assert.Equal(4, free.OwnerCount);
        Assert.Equal("ComingSoon", premium.Status);
        Assert.Equal(0, premium.OwnerCount);
    }

    // --- Owner-plan list: search, filters, sorting, pagination -------------------------

    [Fact]
    public async Task ListOwners_DefaultsToMostRecentlyUpdatedFirst()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (items, total) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery());

        Assert.Equal(4, total);
        Assert.Equal(
            items.OrderByDescending(item => item.UpdatedAt).Select(item => item.OwnerUserId),
            items.Select(item => item.OwnerUserId));
    }

    [Fact]
    public async Task ListOwners_SearchMatchesOwnerNameEmailAndPlanCode()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (byName, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { Search = "Aina" });
        var (byEmail, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { Search = "legacy@example.com" });
        var (byPlan, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { Search = "Free" });

        Assert.Equal([OwnerLightId], byName.Select(item => item.OwnerUserId));
        Assert.Equal([OwnerLegacyId], byEmail.Select(item => item.OwnerUserId));
        Assert.Equal(4, byPlan.Count);
    }

    [Fact]
    public async Task ListOwners_FiltersByPlanCode()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (items, total) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { Plan = "Free" });

        Assert.Equal(4, total);
        Assert.All(items, item => Assert.Equal("Free", item.PlanCode));
    }

    [Fact]
    public async Task ListOwners_PetUsageStateFiltersMatchEnforcementCounting()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (within, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { PetUsage = "within" });
        var (at, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { PetUsage = "at" });
        var (over, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { PetUsage = "over" });

        // Archived and memorial pets never count toward the limit.
        Assert.Equal(
            new[] { OwnerLightId, OwnerOverrideId }.OrderBy(id => id),
            within.Select(item => item.OwnerUserId).OrderBy(id => id));
        Assert.Equal([OwnerFullId], at.Select(item => item.OwnerUserId));
        Assert.Equal([OwnerLegacyId], over.Select(item => item.OwnerUserId));
    }

    [Fact]
    public async Task ListOwners_MemoryUsageStateUsesBusiestPet()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (near, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { MemoryUsage = "near" });
        var (over, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { MemoryUsage = "over" });

        Assert.Equal([OwnerFullId], near.Select(item => item.OwnerUserId));
        Assert.Equal([OwnerLegacyId], over.Select(item => item.OwnerUserId));
    }

    [Fact]
    public async Task ListOwners_OverrideFilterCoversOverridesAndLegacyAllowances()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (withOverride, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { HasOverride = true });
        var (without, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { HasOverride = false });

        Assert.Equal(
            new[] { OwnerLegacyId, OwnerOverrideId }.OrderBy(id => id),
            withOverride.Select(item => item.OwnerUserId).OrderBy(id => id));
        Assert.Equal(2, without.Count);
    }

    [Fact]
    public async Task ListOwners_CombinedFiltersIntersect()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (items, total) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery
        {
            Plan = "Free",
            PetUsage = "over",
            HasOverride = true
        });

        Assert.Equal(1, total);
        Assert.Equal(OwnerLegacyId, items.Single().OwnerUserId);
    }

    [Fact]
    public async Task ListOwners_RejectsUnknownUsageStateSortFieldAndInvertedRanges()
    {
        using var harness = await PlanHarness.CreateAsync();

        var badUsage = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { PetUsage = "sideways" }));
        var badSort = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { SortBy = "PlanOverrideJson; DROP TABLE" }));
        var badDir = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery { SortDir = "up" }));
        var badRange = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery
            {
                AssignedFrom = DateTimeOffset.Parse("2026-07-10T00:00:00Z"),
                AssignedTo = DateTimeOffset.Parse("2026-07-01T00:00:00Z")
            }));

        Assert.All(
            new[] { badUsage, badSort, badDir, badRange },
            error => Assert.Equal("validation_failed", error.Code));
    }

    [Fact]
    public async Task ListOwners_PaginationIsDeterministic()
    {
        using var harness = await PlanHarness.CreateAsync();
        var query = new AdminOwnerPlanQuery { SortBy = "email", SortDir = "asc", PageSize = 2 };

        var (page1, total) = await harness.Service.ListOwnersAsync(query);
        var (page2, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery
        {
            SortBy = "email",
            SortDir = "asc",
            PageSize = 2,
            Page = 2
        });

        Assert.Equal(4, total);
        Assert.Empty(page1.Select(item => item.OwnerUserId).Intersect(page2.Select(item => item.OwnerUserId)));

        var emails = page1.Concat(page2).Select(item => item.Email).ToArray();
        Assert.Equal(emails.OrderBy(email => email, StringComparer.OrdinalIgnoreCase), emails);
    }

    [Fact]
    public async Task ListOwners_UsageProjectionMatchesEnforcementRules()
    {
        using var harness = await PlanHarness.CreateAsync();

        var (items, _) = await harness.Service.ListOwnersAsync(new AdminOwnerPlanQuery());
        var full = items.Single(item => item.OwnerUserId == OwnerFullId);
        var legacy = items.Single(item => item.OwnerUserId == OwnerLegacyId);

        // Full owner: 3 active + 1 archived pet, busiest pet has 8 live
        // memories (2 archived/deleted excluded), 2 care records.
        Assert.Equal(4, full.PetCount);
        Assert.Equal(3, full.ActivePetCount);
        Assert.Equal("At", full.PetUsageState);
        Assert.Equal(8, full.HighestMemoriesOnPet);
        Assert.Equal("Near", full.MemoryUsageState);
        Assert.Equal(2, full.CareRecordCount);

        // Legacy owner: over both limits but still fully listed, never blocked.
        Assert.Equal(4, legacy.ActivePetCount);
        Assert.Equal("Over", legacy.PetUsageState);
        Assert.Equal(12, legacy.HighestMemoriesOnPet);
        Assert.Equal("Over", legacy.MemoryUsageState);
        Assert.True(legacy.Grandfathered);
    }

    [Fact]
    public async Task Counts_SummarizeUsageAndOverrides()
    {
        using var harness = await PlanHarness.CreateAsync();

        var counts = await harness.Service.CountAsync(new AdminOwnerPlanQuery());

        Assert.Equal(4, counts.All);
        Assert.Equal(0, counts.NearPetLimit);
        Assert.Equal(1, counts.AtPetLimit);
        Assert.Equal(1, counts.OverPetLimit);
        Assert.Equal(2, counts.WithOverride);
    }

    [Fact]
    public void DeriveUsageState_CoversAllBandsAndMissingLimits()
    {
        Assert.Equal("Within", AdminPlanQueryService.DeriveUsageState(1, 3));
        Assert.Equal("Near", AdminPlanQueryService.DeriveUsageState(8, 10));
        Assert.Equal("At", AdminPlanQueryService.DeriveUsageState(3, 3));
        Assert.Equal("Over", AdminPlanQueryService.DeriveUsageState(4, 3));
        // A missing/zero limit must fall back safely instead of flagging.
        Assert.Equal("Within", AdminPlanQueryService.DeriveUsageState(5, 0));
    }

    // --- Detail ---------------------------------------------------------------------

    [Fact]
    public async Task GetOwner_ReturnsPlanUsageOverrideAndHistoryAndAuditsTheView()
    {
        using var harness = await PlanHarness.CreateAsync();

        var detail = await harness.Service.GetOwnerAsync(AdminUserId, OwnerLegacyId);

        Assert.Equal("Free", detail.Plan.Code);
        Assert.Equal(3, detail.Plan.MaxPets);
        Assert.Equal("Over", detail.Item.PetUsageState);
        Assert.NotNull(detail.GrandfatheredAt);
        Assert.Contains(detail.History, item => item.Label.Contains("assigned"));
        Assert.Contains(detail.History, item => item.Label.Contains("Legacy allowance"));

        var audit = await harness.Db.AuditLogs.SingleAsync(log => log.Action == "plans.owner-detail-view");
        Assert.Equal(ActorType.Admin, audit.ActorType);
    }

    [Fact]
    public async Task GetOwner_RequiresAdmin()
    {
        using var harness = await PlanHarness.CreateAsync();

        var unauthorized = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetOwnerAsync(null, OwnerLightId));
        var forbidden = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetOwnerAsync(OwnerLightId, OwnerLightId));

        Assert.Equal("unauthorized", unauthorized.Code);
        Assert.Equal("forbidden", forbidden.Code);
    }

    [Fact]
    public async Task GetOwner_UnknownOwnerIsNotFound()
    {
        using var harness = await PlanHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.GetOwnerAsync(AdminUserId, Guid.NewGuid()));

        Assert.Equal("owner_plan_not_found", error.Code);
    }

    // --- Export ---------------------------------------------------------------------

    [Fact]
    public async Task Export_CsvUsesFiltersReadableColumnsAndNoGuids()
    {
        using var harness = await PlanHarness.CreateAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId, new AdminOwnerPlanQuery { PetUsage = "over" }, "csv", null);

        var text = System.Text.Encoding.UTF8.GetString(export.Content);
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        Assert.Contains("Pet Limit", lines[0]);
        Assert.Contains("Plan Status", lines[0]);
        Assert.Contains("Manual Override", lines[0]);
        Assert.Equal(2, lines.Length);
        Assert.Contains("legacy@example.com", lines[1]);
        Assert.Contains("Over limit", lines[1]);
        Assert.Contains("Assigned", lines[1]);
        Assert.DoesNotContain(OwnerLegacyId.ToString(), text);

        var audit = await harness.Db.AuditLogs.SingleAsync(log => log.Action == "plans.export");
        Assert.Contains("csv", audit.NewValue!);
    }

    [Fact]
    public async Task Export_SelectedRowsOnlyAndXlsxSignature()
    {
        using var harness = await PlanHarness.CreateAsync();

        var csv = await harness.Service.ExportAsync(
            AdminUserId, new AdminOwnerPlanQuery(), "csv", [OwnerLightId]);
        var lines = System.Text.Encoding.UTF8.GetString(csv.Content)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        Assert.Equal(2, lines.Length);
        Assert.Contains("aina@example.com", lines[1]);

        var xlsx = await harness.Service.ExportAsync(AdminUserId, new AdminOwnerPlanQuery(), "xlsx", null);
        Assert.Equal(0x50, xlsx.Content[0]);
        Assert.Equal(0x4B, xlsx.Content[1]);
        Assert.Equal(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            xlsx.ContentType);
    }

    [Fact]
    public async Task Export_ProtectsAgainstSpreadsheetFormulaInjection()
    {
        using var harness = await PlanHarness.CreateAsync();
        var owner = await harness.Db.OwnerProfiles.SingleAsync(profile => profile.UserId == OwnerLightId);
        owner.OwnerDisplayName = "=HYPERLINK(\"https://evil.example\")";
        await harness.Db.SaveChangesAsync();

        var export = await harness.Service.ExportAsync(
            AdminUserId, new AdminOwnerPlanQuery(), "csv", [OwnerLightId]);
        var text = System.Text.Encoding.UTF8.GetString(export.Content);

        Assert.Contains("\"'=HYPERLINK", text);
        Assert.DoesNotContain("\n\"=HYPERLINK", text);
    }

    [Fact]
    public async Task Export_RequiresAdminAndKnownFormat()
    {
        using var harness = await PlanHarness.CreateAsync();

        var forbidden = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ExportAsync(OwnerLightId, new AdminOwnerPlanQuery(), "csv", null));
        var badFormat = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.ExportAsync(AdminUserId, new AdminOwnerPlanQuery(), "pdf", null));

        Assert.Equal("forbidden", forbidden.Code);
        Assert.Equal("validation_failed", badFormat.Code);
    }

    // --- Harness --------------------------------------------------------------------

    private sealed class PlanHarness : IDisposable
    {
        private PlanHarness(MyPetLinkDbContext db)
        {
            Db = db;
            Service = new AdminPlanQueryService(db, new AuditLogService(db, new HttpContextAccessor()));
        }

        public MyPetLinkDbContext Db { get; }
        public AdminPlanQueryService Service { get; }

        public static async Task<PlanHarness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            // The InMemory provider does not apply HasData seeds automatically
            // here, so seed the same Free/Premium shape the real database has.
            var freePlanId = Guid.Parse("66666666-6666-6666-6666-666666666666");
            var premiumPlanId = Guid.Parse("67777777-7777-7777-7777-777777777777");
            db.Plans.AddRange(
                new Plan
                {
                    Id = freePlanId,
                    Code = "Free",
                    Name = "Free Plan",
                    Status = PlanStatus.Available,
                    PriceLabel = "RM0",
                    Limit = new PlanLimit
                    {
                        PlanId = freePlanId,
                        MaxPets = 3,
                        MaxMemoriesPerPet = 10,
                        MaxMediaPerMemory = 5,
                        MaxCareRecords = 100,
                        AllowsSmartTagAddOns = true,
                        AllowsFoundReports = true
                    }
                },
                new Plan
                {
                    Id = premiumPlanId,
                    Code = "Premium",
                    Name = "Premium Plan",
                    Status = PlanStatus.ComingSoon,
                    PriceLabel = "Coming Soon",
                    Limit = new PlanLimit
                    {
                        PlanId = premiumPlanId,
                        MaxPets = 10,
                        MaxMemoriesPerPet = 100,
                        MaxMediaPerMemory = 20,
                        MaxCareRecords = 500,
                        AllowsSmartTagAddOns = true,
                        AllowsFoundReports = true,
                        AllowsAdvancedThemes = true
                    }
                });

            db.Users.Add(new User
            {
                Id = AdminUserId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                AdminUser = new AdminUser { UserId = AdminUserId, IsActive = true }
            });

            AddOwner(db, freePlanId, OwnerLightId, "Aina", "aina@example.com",
                activePets: 1, archivedPets: 0, busiestPetMemories: 2, careRecords: 0);
            AddOwner(db, freePlanId, OwnerFullId, "Farid", "farid@example.com",
                activePets: 3, archivedPets: 1, busiestPetMemories: 8, careRecords: 2,
                extraArchivedMemoriesOnBusiestPet: 2);
            AddOwner(db, freePlanId, OwnerLegacyId, "Legacy Lee", "legacy@example.com",
                activePets: 4, archivedPets: 0, busiestPetMemories: 12, careRecords: 0,
                grandfathered: true);
            AddOwner(db, freePlanId, OwnerOverrideId, "Ovi", "ovi@example.com",
                activePets: 2, archivedPets: 0, busiestPetMemories: 1, careRecords: 1,
                overrideJson: "{\"note\":\"support exception\"}");

            await db.SaveChangesAsync();

            // Distinct UpdatedAt values so default-sort assertions are meaningful.
            var offset = 0;
            foreach (var profile in db.OwnerProfiles.OrderBy(item => item.UserId))
            {
                profile.UpdatedAt = DateTimeOffset.Parse("2026-07-01T00:00:00Z").AddDays(offset++);
            }

            await db.SaveChangesAsync();
            return new PlanHarness(db);
        }

        private static void AddOwner(
            MyPetLinkDbContext db,
            Guid planId,
            Guid ownerId,
            string name,
            string email,
            int activePets,
            int archivedPets,
            int busiestPetMemories,
            int careRecords,
            int extraArchivedMemoriesOnBusiestPet = 0,
            bool grandfathered = false,
            string? overrideJson = null)
        {
            var user = new User
            {
                Id = ownerId,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = name
            };
            user.OwnerProfile = new OwnerProfile
            {
                UserId = ownerId,
                PlanId = planId,
                OwnerDisplayName = name,
                User = user,
                GrandfatheredAt = grandfathered ? DateTimeOffset.Parse("2026-06-01T00:00:00Z") : null,
                PlanOverrideJson = overrideJson
            };
            db.Users.Add(user);

            for (var index = 0; index < activePets + archivedPets; index++)
            {
                var pet = new Pet
                {
                    OwnerUserId = ownerId,
                    OwnerUser = user,
                    Name = $"{name} Pet {index}",
                    Slug = $"{name.ToLowerInvariant().Replace(" ", "-")}-pet-{index}",
                    Species = "Dog",
                    LifecycleStatus = index < activePets
                        ? PetLifecycleStatus.Active
                        : PetLifecycleStatus.Archived
                };
                db.Pets.Add(pet);

                if (index == 0)
                {
                    for (var memory = 0; memory < busiestPetMemories; memory++)
                    {
                        db.PetMemories.Add(new PetMemory { Pet = pet, Title = $"Memory {memory}" });
                    }

                    // Archived/deleted memories must never count toward usage.
                    for (var memory = 0; memory < extraArchivedMemoriesOnBusiestPet; memory++)
                    {
                        db.PetMemories.Add(new PetMemory
                        {
                            Pet = pet,
                            Title = $"Archived {memory}",
                            ArchivedAt = memory % 2 == 0 ? DateTimeOffset.UtcNow : null,
                            DeletedAt = memory % 2 == 0 ? null : DateTimeOffset.UtcNow
                        });
                    }

                    for (var record = 0; record < careRecords; record++)
                    {
                        db.CareRecords.Add(new CareRecord { Pet = pet, Title = $"Care {record}" });
                    }
                }
            }
        }

        public void Dispose() => Db.Dispose();
    }
}
