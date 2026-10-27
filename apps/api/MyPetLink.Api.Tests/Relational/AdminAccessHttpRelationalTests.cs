using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Entities;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Phase 1A final remediation (R1): access-management requests bind and validate through real
// ASP.NET model binding, real JWT validation and capabilities resolved from SQL Server. Before the
// fix, an authorized, valid role request failed with HTTP 500 because its validation attributes
// targeted the record's properties instead of its constructor parameters.
public sealed partial class ConsignmentRelationalTests
{
    [Fact]
    public async Task R1_AccessManagementRequestsBindValidateAndAuthorizeOverRealHttp()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(10); await using var db = scope.NewContext();
            var super = await db.AdminRoles.SingleAsync(r => r.Code == AdminRoleTemplates.SuperAdminCode);
            db.AdminUserRoles.Add(new AdminUserRoleAssignment { AdminUserId = CheckerAdminId, AdminRoleId = super.Id });
            var viewer = new AdminRoleDefinition { Code = "access-viewer", Name = "Access viewer" };
            viewer.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.AdminRolesView });
            viewer.Capabilities.Add(new AdminRoleCapability { Capability = AdminCapabilities.AdminUsersView });
            viewer.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminRecordId });
            db.AdminRoles.Add(viewer);
            var targetUser = new User { Email = "finance.clerk@example.test", NormalizedEmail = "FINANCE.CLERK@EXAMPLE.TEST", DisplayName = "Finance Clerk" };
            var target = new AdminUser { UserId = targetUser.Id, IsActive = true };
            targetUser.AdminUser = target;
            db.Users.Add(targetUser); await db.SaveChangesAsync();

            await using var factory = new FinanceHttpFactory(db.Database.GetConnectionString()!);
            using var client = factory.CreateClient();
            const string roles = "/api/v1/admin/access/roles", users = "/api/v1/admin/access/users";
            async Task<(HttpStatusCode Status, string Body)> Send(HttpMethod method, string path, object? body, Guid? user)
            {
                using var request = new HttpRequestMessage(method, path);
                if (body is not null) request.Content = JsonContent.Create(body);
                if (user is Guid id) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", FinanceToken(id));
                using var response = await client.SendAsync(request);
                return (response.StatusCode, await response.Content.ReadAsStringAsync());
            }
            static JsonElement Data(string body) => JsonDocument.Parse(body).RootElement.GetProperty("data");
            static void Invalid((HttpStatusCode Status, string Body) result, string field)
            {
                Assert.Equal(HttpStatusCode.BadRequest, result.Status);
                Assert.Contains(field, result.Body, StringComparison.OrdinalIgnoreCase);
            }
            var newRole = new { name = "Payout viewer", description = "Can see commission payouts.", capabilities = new[] { AdminCapabilities.PayoutsView } };

            // Authentication and the capability policy refuse first.
            Assert.Equal(HttpStatusCode.Unauthorized, (await Send(HttpMethod.Post, roles, newRole, null)).Status);
            Assert.Equal(HttpStatusCode.Forbidden, (await Send(HttpMethod.Post, roles, newRole, AdminAccountId)).Status);

            // Invalid bodies are validation responses, never a server error.
            Invalid(await Send(HttpMethod.Post, roles, new { name = "", capabilities = Array.Empty<string>() }, OwnerAccountId), "name");
            Invalid(await Send(HttpMethod.Post, roles, new { name = "X", capabilities = Array.Empty<string>() }, OwnerAccountId), "name");
            Invalid(await Send(HttpMethod.Post, roles, new { name = "Valid name", description = new string('d', 601) }, OwnerAccountId), "description");

            var created = await Send(HttpMethod.Post, roles, newRole, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, created.Status);
            var roleId = Data(created.Body).GetProperty("role").GetProperty("id").GetGuid();
            var roleVersion = Data(created.Body).GetProperty("role").GetProperty("rowVersion").GetString()!;
            Assert.Equal([AdminCapabilities.PayoutsView], Data(created.Body).GetProperty("capabilities").EnumerateArray().Select(c => c.GetString()).ToArray());

            Invalid(await Send(HttpMethod.Put, $"{roles}/{roleId}", new { name = "Payout viewer", capabilities = new[] { AdminCapabilities.PayoutsView } }, OwnerAccountId), "rowVersion");
            Assert.Equal(HttpStatusCode.Forbidden, (await Send(HttpMethod.Put, $"{roles}/{roleId}",
                new { name = "Payout viewer", rowVersion = roleVersion }, AdminAccountId)).Status);
            var updated = await Send(HttpMethod.Put, $"{roles}/{roleId}", new { name = "Payout viewer", description = "Sees payouts; prepares none.",
                capabilities = new[] { AdminCapabilities.PayoutsView }, rowVersion = roleVersion }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, updated.Status);
            Assert.Equal("Sees payouts; prepares none.", Data(updated.Body).GetProperty("role").GetProperty("description").GetString());

            // User role assignment.
            var detail = await Send(HttpMethod.Get, $"{users}/{target.Id}", null, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, detail.Status);
            var userVersion = Data(detail.Body).GetProperty("user").GetProperty("rowVersion").GetString()!;
            Invalid(await Send(HttpMethod.Put, $"{users}/{target.Id}/roles", new { roleIds = new[] { roleId } }, OwnerAccountId), "rowVersion");
            Assert.Equal(HttpStatusCode.Forbidden, (await Send(HttpMethod.Put, $"{users}/{target.Id}/roles",
                new { roleIds = new[] { roleId }, rowVersion = userVersion }, AdminAccountId)).Status);
            var assigned = await Send(HttpMethod.Put, $"{users}/{target.Id}/roles", new { roleIds = new[] { roleId }, rowVersion = userVersion }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, assigned.Status);
            Assert.Contains(AdminCapabilities.PayoutsView, Data(assigned.Body).GetProperty("effectiveCapabilities").EnumerateArray().Select(c => c.GetString()));
            userVersion = Data(assigned.Body).GetProperty("user").GetProperty("rowVersion").GetString()!;

            // Deactivate and reactivate.
            Invalid(await Send(HttpMethod.Post, $"{users}/{target.Id}/deactivate", new { }, OwnerAccountId), "rowVersion");
            Assert.Equal(HttpStatusCode.Forbidden, (await Send(HttpMethod.Post, $"{users}/{target.Id}/deactivate", new { rowVersion = userVersion }, AdminAccountId)).Status);
            var deactivated = await Send(HttpMethod.Post, $"{users}/{target.Id}/deactivate", new { rowVersion = userVersion }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, deactivated.Status);
            Assert.False(Data(deactivated.Body).GetProperty("user").GetProperty("isActive").GetBoolean());
            Invalid(await Send(HttpMethod.Post, $"{users}/{target.Id}/activate", new { }, OwnerAccountId), "rowVersion");
            var activated = await Send(HttpMethod.Post, $"{users}/{target.Id}/activate",
                new { rowVersion = Data(deactivated.Body).GetProperty("user").GetProperty("rowVersion").GetString() }, OwnerAccountId);
            Assert.Equal(HttpStatusCode.OK, activated.Status);
            Assert.True(Data(activated.Body).GetProperty("user").GetProperty("isActive").GetBoolean());

            // Each committed change is audited once, against the right actor.
            db.ChangeTracker.Clear();
            var audits = await db.AuditLogs.AsNoTracking().Where(a => a.Action.StartsWith("admin-access.")).ToListAsync();
            foreach (var action in new[] { "admin-access.role.created", "admin-access.user.roles-changed", "admin-access.user.deactivated", "admin-access.user.activated" })
                Assert.Single(audits, a => a.Action == action && a.ActorId == CheckerAdminId);
            var stored = await db.AdminUsers.AsNoTracking().Include(a => a.RoleAssignments).SingleAsync(a => a.Id == target.Id);
            Assert.True(stored.IsActive);
            Assert.Equal(roleId, Assert.Single(stored.RoleAssignments).AdminRoleId);
        }
        finally { MigratedSchema.Value = false; }
    }
}
