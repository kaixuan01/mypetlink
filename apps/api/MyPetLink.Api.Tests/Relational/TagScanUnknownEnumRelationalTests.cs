using System.Data;
using System.Security.Claims;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class TagScanUnknownEnumRelationalTests
{
    [RelationalFact]
    public async Task FuturePersistedValues_AreUnknownAcrossOwnerAdminAndExports()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid ownerId;
        Guid adminId;
        Guid tagId;
        Guid scanId;
        Guid numericScanId;

        await using (var arrange = scope.NewContext())
        {
            var owner = User("future-owner@example.com", "Future Owner");
            var admin = User("future-admin@example.com", "Future Admin");
            admin.AdminUser = new AdminUser
            {
                UserId = admin.Id,
                Role = AdminRole.Admin,
                IsActive = true
            };
            var tag = new SmartTag
            {
                TagCode = "MPL-FUTURE-ENUM",
                Status = SmartTagStatus.Active,
                HasNfc = true,
                Variant = "Standard",
                OwnerUser = owner,
                OwnerUserId = owner.Id,
                ActivatedAt = DateTimeOffset.UtcNow
            };
            var scan = new TagScan
            {
                SmartTag = tag,
                SmartTagId = tag.Id,
                TagCode = tag.TagCode,
                Source = TagScanSource.Qr,
                ResolvedState = TagScanResolvedState.Active,
                ScanTime = DateTimeOffset.UtcNow
            };
            var numericScan = new TagScan
            {
                SmartTag = tag,
                SmartTagId = tag.Id,
                TagCode = tag.TagCode,
                Source = TagScanSource.Nfc,
                ResolvedState = TagScanResolvedState.Pending,
                ScanTime = DateTimeOffset.UtcNow.AddSeconds(-1)
            };
            arrange.AddRange(owner, admin, tag, scan, numericScan);
            await arrange.SaveChangesAsync();
            ownerId = owner.Id;
            adminId = admin.Id;
            tagId = tag.Id;
            scanId = scan.Id;
            numericScanId = numericScan.Id;

            await arrange.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE [TagScans] SET [Source] = N'Bluetooth', [ResolvedState] = N'Teleported' WHERE [Id] = {scanId}");
            await arrange.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE [TagScans] SET [Source] = N'1', [ResolvedState] = N'1' WHERE [Id] = {numericScanId}");
        }

        await using (var verify = scope.NewContext())
        {
            var ownerService = new SmartTagService(
                verify,
                new AuditLogService(verify, new HttpContextAccessor()));
            var adminService = new AdminSmartTagService(
                verify,
                new AuditLogService(verify, new HttpContextAccessor()));

            var ownerHistory = await ownerService.ListScansAsync(
                ownerId,
                tagId,
                null);
            var ownerUnknownFilter = await ownerService.ListScansAsync(
                ownerId,
                tagId,
                "unknown");
            var adminHistory = await adminService.ListScansAsync(
                adminId,
                tagId,
                null);
            var adminUnknownFilter = await adminService.ListScansAsync(
                adminId,
                tagId,
                "UNKNOWN");
            var (adminTags, _) = await adminService.ListAsync(
                new AdminSmartTagQuery());

            Assert.Equal(2, ownerHistory.Items.Count);
            Assert.All(
                ownerHistory.Items,
                item =>
                {
                    Assert.Equal(TagScanSource.Unknown, item.ScanSource);
                    Assert.Equal(TagScanResolvedState.Unknown, item.ResolvedState);
                });
            Assert.Equal(2, ownerUnknownFilter.Items.Count);
            Assert.All(
                adminHistory,
                item =>
                {
                    Assert.Equal(TagScanSource.Unknown, item.ScanSource);
                    Assert.Equal(TagScanResolvedState.Unknown, item.ResolvedState);
                });
            Assert.Equal(2, adminUnknownFilter.Count);
            Assert.Equal(
                TagScanSource.Unknown,
                adminTags.Single(item => item.Id == tagId).LatestScanSource);
            Assert.Equal(
                2,
                adminTags.Single(item => item.Id == tagId).LegacyOrUnknownScanCount);

            var csv = await adminService.ExportScansAsync(
                adminId,
                tagId,
                null,
                "csv");
            Assert.Contains(
                "\"Unknown\",\"Unknown\"",
                System.Text.Encoding.UTF8.GetString(csv.Content));

            var xlsx = await adminService.ExportScansAsync(
                adminId,
                tagId,
                null,
                "xlsx");
            using var workbook = new XLWorkbook(new MemoryStream(xlsx.Content));
            var values = workbook.Worksheet(1).CellsUsed()
                .Select(cell => cell.GetString())
                .ToArray();
            Assert.Contains("Unknown", values);

            var ownerController = OwnerController(ownerService, ownerId);
            var adminController = AdminController(adminService, adminId);
            Assert.IsType<OkObjectResult>(
                await ownerController.ListScans(
                    tagId,
                    null,
                    CancellationToken.None));
            Assert.IsType<OkObjectResult>(
                await adminController.Scans(
                    tagId,
                    null,
                    CancellationToken.None));
            Assert.IsType<OkObjectResult>(
                await adminController.List(
                    new AdminSmartTagQuery(),
                    CancellationToken.None));

            foreach (var invalid in new[] { "1", "-1", "Bluetooth" })
            {
                var ownerError = await Assert.ThrowsAsync<ApiException>(
                    () => ownerService.ListScansAsync(
                        ownerId,
                        tagId,
                        invalid));
                var adminError = await Assert.ThrowsAsync<ApiException>(
                    () => adminService.ListScansAsync(
                        adminId,
                        tagId,
                        invalid));
                Assert.Equal(StatusCodes.Status400BadRequest, ownerError.StatusCode);
                Assert.Equal(StatusCodes.Status400BadRequest, adminError.StatusCode);
            }
        }

        await using (var raw = scope.NewContext())
        {
            var connection = raw.Database.GetDbConnection();
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT [Source], [ResolvedState] FROM [TagScans] WHERE [Id] = @id";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "@id";
            parameter.Value = scanId;
            command.Parameters.Add(parameter);
            await using var reader = await command.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal("Bluetooth", reader.GetString(0));
            Assert.Equal("Teleported", reader.GetString(1));

            await reader.DisposeAsync();
            command.CommandText =
                "SELECT [Source], [ResolvedState] FROM [TagScans] WHERE [Id] = @id";
            parameter.Value = numericScanId;
            await using var numericReader = await command.ExecuteReaderAsync();
            Assert.True(await numericReader.ReadAsync());
            Assert.Equal("1", numericReader.GetString(0));
            Assert.Equal("1", numericReader.GetString(1));
        }
    }

    [RelationalFact]
    public async Task KnownValues_ContinueRoundTrippingWithCanonicalNames()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid scanId;

        await using (var arrange = scope.NewContext())
        {
            var scan = new TagScan
            {
                TagCode = "MPL-KNOWN-ENUM",
                Source = TagScanSource.Nfc,
                ResolvedState = TagScanResolvedState.Pending
            };
            arrange.TagScans.Add(scan);
            await arrange.SaveChangesAsync();
            scanId = scan.Id;
        }

        await using var verify = scope.NewContext();
        var saved = await verify.TagScans.SingleAsync(scan => scan.Id == scanId);
        Assert.Equal(TagScanSource.Nfc, saved.Source);
        Assert.Equal(TagScanResolvedState.Pending, saved.ResolvedState);
    }

    private static User User(string email, string displayName) =>
        new()
        {
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = displayName,
            Status = UserStatus.Active
        };

    private static SmartTagsController OwnerController(
        ISmartTagService service,
        Guid userId)
    {
        var httpContext = AuthenticatedContext(userId);
        return new SmartTagsController(
            service,
            new FixedCurrentUserService(userId))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = httpContext
            }
        };
    }

    private static AdminSmartTagsController AdminController(
        IAdminSmartTagService service,
        Guid userId)
    {
        var httpContext = AuthenticatedContext(userId);
        return new AdminSmartTagsController(
            service,
            new FixedCurrentUserService(userId))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = httpContext
            }
        };
    }

    private static DefaultHttpContext AuthenticatedContext(Guid userId)
    {
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(
            new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                "test"));
        return context;
    }

    private sealed class FixedCurrentUserService(Guid userId) : ICurrentUserService
    {
        public CurrentUser Current { get; } =
            new(userId, null, Array.Empty<string>());
    }
}
