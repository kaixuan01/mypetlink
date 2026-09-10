using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

// Admin Smart Tag assignment under the SAME DbContext configuration production
// uses. Program.cs registers the context with EnableRetryOnFailure, and a
// retrying execution strategy throws on the first database call made while a
// user-initiated transaction is open. Every other relational test builds its
// context without retries, so an assignment path that opens its own transaction
// passes there and fails in a deployed environment.
//
// These tests exist to keep the two configurations honest: the assignment flow
// must work with retries enabled, not only with them off.
public sealed class SmartTagAssignmentRetryRelationalTests
{
    private static readonly Guid AdminId = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    private static readonly Guid OwnerId = Guid.Parse("b2222222-2222-2222-2222-222222222222");
    private static readonly Guid PetId = Guid.Parse("b3333333-3333-3333-3333-333333333333");
    private static readonly Guid OtherOwnerId = Guid.Parse("b4444444-4444-4444-4444-444444444444");
    private static readonly Guid OtherPetId = Guid.Parse("b5555555-5555-5555-5555-555555555555");

    [RelationalFact]
    public async Task Claim_WithRetryingExecutionStrategy_AssignsOwnerAndPetWithoutActivating()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);

        await using (var act = scope.NewContext())
        {
            // Reason omitted on purpose: the Admin dialog marks it optional.
            var result = await SmartTagService(act).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = updatedAt,
            });

            Assert.Equal(OwnerId, result.OwnerUserId);
            Assert.Equal(PetId, result.PetId);
        }

        await using (var verify = scope.NewContext())
        {
            var tag = await verify.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tagId);
            Assert.Equal(OwnerId, tag.OwnerUserId);
            Assert.Equal(PetId, tag.PetId);
            // An administrative claim links the tag. The owner still activates.
            Assert.Equal(SmartTagStatus.Pending, tag.Status);
            Assert.Null(tag.ActivatedAt);
        }
    }

    [RelationalFact]
    public async Task Claim_WithRetryingExecutionStrategy_RecordsAuditWithSuppliedReason()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);

        await using (var act = scope.NewContext())
        {
            await SmartTagService(act).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = updatedAt,
                Reason = "Replacement issued at the counter.",
            });
        }

        await using (var verify = scope.NewContext())
        {
            var entry = await verify.AuditLogs.AsNoTracking()
                .SingleAsync(item => item.Entity == "SmartTag" && item.EntityId == tagId);
            Assert.Equal("smart-tags.owner-and-pet-assigned", entry.Action);
            Assert.Equal(ActorType.Admin, entry.ActorType);
            // Admin audit entries in this service record the AdminUser row id,
            // not the underlying user id. Resolved here rather than hardcoded so
            // the test states the convention instead of restating a constant.
            var adminRowId = await verify.AdminUsers.AsNoTracking()
                .Where(item => item.UserId == AdminId)
                .Select(item => item.Id)
                .SingleAsync();
            Assert.Equal(adminRowId, entry.ActorId);
            Assert.Contains("Replacement issued at the counter.", entry.NewValue);
            Assert.Contains("Unclaimed", entry.OldValue);
        }
    }

    [RelationalFact]
    public async Task Claim_WithRetryingExecutionStrategy_RejectsPetBelongingToAnotherOwner()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);

        await using (var act = scope.NewContext())
        {
            var failure = await Assert.ThrowsAsync<ApiException>(() =>
                SmartTagService(act).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
                {
                    OwnerUserId = OwnerId,
                    PetId = OtherPetId,
                    ExpectedUpdatedAt = updatedAt,
                }));
            Assert.Equal(StatusCodes.Status400BadRequest, failure.StatusCode);
        }

        // A rejected claim leaves the tag exactly as it was — no partial write.
        await using (var verify = scope.NewContext())
        {
            var tag = await verify.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tagId);
            Assert.Null(tag.OwnerUserId);
            Assert.Null(tag.PetId);
            Assert.Equal(SmartTagStatus.Unclaimed, tag.Status);
            Assert.False(await verify.AuditLogs.AsNoTracking().AnyAsync(item => item.EntityId == tagId));
        }
    }

    [RelationalFact]
    public async Task Claim_WithRetryingExecutionStrategy_RejectsAlreadyClaimedTag()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);

        await using (var first = scope.NewContext())
        {
            await SmartTagService(first).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = updatedAt,
            });
        }

        // A second Confirm from a dialog opened before the first one landed.
        await using (var second = scope.NewContext())
        {
            var failure = await Assert.ThrowsAsync<ApiException>(() =>
                SmartTagService(second).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
                {
                    OwnerUserId = OtherOwnerId,
                    PetId = OtherPetId,
                    ExpectedUpdatedAt = updatedAt,
                }));
            Assert.Equal(StatusCodes.Status409Conflict, failure.StatusCode);
        }

        await using (var verify = scope.NewContext())
        {
            var tag = await verify.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tagId);
            Assert.Equal(OwnerId, tag.OwnerUserId);
            Assert.Equal(PetId, tag.PetId);
        }
    }

    [RelationalFact]
    public async Task AssignmentOperations_WithRetryingExecutionStrategy_RemainUsableAfterClaim()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);
        var secondPetId = Guid.Parse("b6666666-6666-6666-6666-666666666666");

        await using (var seed = scope.NewContext())
        {
            seed.Pets.Add(new Pet
            {
                Id = secondPetId,
                OwnerUserId = OwnerId,
                Slug = "nala-p124",
                Name = "Nala",
                Species = "Cat",
                LifecycleStatus = PetLifecycleStatus.Active,
            });
            await seed.SaveChangesAsync();
        }

        await using (var claim = scope.NewContext())
        {
            var claimed = await SmartTagService(claim).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = updatedAt,
            });
            updatedAt = claimed.UpdatedAt;
        }

        // The sibling assignment operations share the same transaction path, so
        // they would fail the same way under a retrying execution strategy.
        await using (var changePet = scope.NewContext())
        {
            var changed = await SmartTagService(changePet).AssignPetAsync(AdminId, tagId, new AdminSmartTagAssignPetRequest
            {
                PetId = secondPetId,
                ExpectedUpdatedAt = updatedAt,
            });
            Assert.Equal(secondPetId, changed.PetId);
            updatedAt = changed.UpdatedAt;
        }

        await using (var unassign = scope.NewContext())
        {
            var cleared = await SmartTagService(unassign).UnassignPetAsync(AdminId, tagId, new AdminSmartTagUnassignPetRequest
            {
                ExpectedUpdatedAt = updatedAt,
            });
            Assert.Null(cleared.PetId);
            Assert.Equal(OwnerId, cleared.OwnerUserId);
        }
    }

    [RelationalFact]
    public async Task OwnerActivation_StillCompletesAfterAnAdministrativeClaim()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, updatedAt) = await SeedUnclaimedTagAsync(scope);

        await using (var claim = scope.NewContext())
        {
            await SmartTagService(claim).ClaimAsync(AdminId, tagId, new AdminSmartTagClaimRequest
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                ExpectedUpdatedAt = updatedAt,
            });
        }

        // The claim leaves the tag Pending, which is exactly the state the
        // owner's own activation expects. The admin step must not consume it.
        await using (var activate = scope.NewContext())
        {
            var activated = await OwnerTagService(activate)
                .ActivateAsync(OwnerId, "MPL-RETRY-0001", new ActivateTagRequest(null));
            Assert.Equal(SmartTagStatus.Active, activated.Status);
        }

        await using (var verify = scope.NewContext())
        {
            var tag = await verify.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tagId);
            Assert.Equal(SmartTagStatus.Active, tag.Status);
            Assert.NotNull(tag.ActivatedAt);
            Assert.Equal(OwnerId, tag.OwnerUserId);
            Assert.Equal(PetId, tag.PetId);
        }
    }

    [RelationalFact]
    public async Task OwnerActivation_StillCompletesForATagThatWasNeverClaimed()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (tagId, _) = await SeedUnclaimedTagAsync(scope);

        // The retail path: no admin ever touched this tag, so the owner supplies
        // the pet themselves. This must keep working alongside the admin claim.
        await using (var activate = scope.NewContext())
        {
            var activated = await OwnerTagService(activate)
                .ActivateAsync(OwnerId, "MPL-RETRY-0001", new ActivateTagRequest(PetId));
            Assert.Equal(SmartTagStatus.Active, activated.Status);
        }

        await using (var verify = scope.NewContext())
        {
            var tag = await verify.SmartTags.AsNoTracking().SingleAsync(item => item.Id == tagId);
            Assert.Equal(SmartTagStatus.Active, tag.Status);
            Assert.Equal(OwnerId, tag.OwnerUserId);
            Assert.Equal(PetId, tag.PetId);
        }
    }

    private static async Task<(Guid TagId, DateTimeOffset UpdatedAt)> SeedUnclaimedTagAsync(RelationalScope scope)
    {
        await using var seed = scope.NewContext();
        seed.Users.Add(new User
        {
            Id = AdminId,
            Email = "admin@example.com",
            NormalizedEmail = "ADMIN@EXAMPLE.COM",
            DisplayName = "Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser { UserId = AdminId, Role = AdminRole.Admin, IsActive = true },
        });
        seed.Users.Add(new User
        {
            Id = OwnerId,
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active,
        });
        seed.Users.Add(new User
        {
            Id = OtherOwnerId,
            Email = "other@example.com",
            NormalizedEmail = "OTHER@EXAMPLE.COM",
            DisplayName = "Other Owner",
            Status = UserStatus.Active,
        });
        seed.Pets.Add(new Pet
        {
            Id = PetId,
            OwnerUserId = OwnerId,
            Slug = "milo-p123",
            Name = "Milo",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
        });
        seed.Pets.Add(new Pet
        {
            Id = OtherPetId,
            OwnerUserId = OtherOwnerId,
            Slug = "rex-p125",
            Name = "Rex",
            Species = "Dog",
            LifecycleStatus = PetLifecycleStatus.Active,
        });

        var product = new TagProduct
        {
            Name = "MyPetLink Smart Tag",
            Slug = "mypetlink-smart-tag",
            ShortDescription = "A safer way home.",
            IsPublished = true,
        };
        var variant = new TagProductVariant
        {
            TagProduct = product,
            PublicKey = "RETRYVARIANT0001",
            Sku = "MPL-RETRY-V1",
            DisplayName = "Standard",
            SupportsQr = true,
            SupportsNfc = true,
            TagVariant = "Standard",
            BasePrice = 39.90m,
            Currency = "MYR",
            IsActive = true,
            IsPurchasable = true,
        };
        var tag = new SmartTag
        {
            TagCode = "MPL-RETRY-0001",
            ProductVariant = variant,
            HasNfc = variant.SupportsNfc,
            Variant = variant.TagVariant,
            Status = SmartTagStatus.Unclaimed,
            FulfilmentStatus = TagFulfilmentStatus.Generated,
        };
        seed.AddRange(product, variant, tag);
        await seed.SaveChangesAsync();
        return (tag.Id, tag.UpdatedAt);
    }

    private static AdminSmartTagService SmartTagService(MyPetLinkDbContext db) => new(
        db, new AuditLogService(db, new HttpContextAccessor()));

    private static MyPetLink.Api.Services.SmartTagService OwnerTagService(MyPetLinkDbContext db) => new(
        db, new AuditLogService(db, new HttpContextAccessor()));
}
