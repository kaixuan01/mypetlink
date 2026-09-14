using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using MyPetLink.Api.Auth;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Deny by default, checked structurally: every Admin Portal endpoint must name
/// a capability, and no capability may exist that nothing uses.
///
/// This is what stops a new admin endpoint from shipping behind nothing but
/// "is an admin" — the gap this release exists to close.
/// </summary>
public sealed class AdminCapabilityCoverageTests
{
    /// <summary>
    /// The only routes allowed to sit on the shared active-admin policy.
    /// Both are reachable by every operator by design: the access check itself,
    /// and the landing page, whose detailed sections are filtered by capability
    /// inside the service.
    /// </summary>
    private static readonly string[] BaselineOnlyRoutes =
    [
        "api/v1/admin/auth",
        "api/v1/admin/dashboard",
    ];

    private static IEnumerable<Type> AdminControllers() =>
        typeof(AdminCapabilities).Assembly
            .GetTypes()
            .Where(type =>
                type is { IsAbstract: false, IsClass: true }
                && type.Namespace == "MyPetLink.Api.Controllers.Admin");

    [Fact]
    public void EveryAdminEndpointRequiresACapability()
    {
        var unprotected = new List<string>();

        foreach (var controller in AdminControllers())
        {
            var route = controller.GetCustomAttribute<RouteAttribute>()?.Template ?? "";
            if (BaselineOnlyRoutes.Contains(route))
            {
                continue;
            }

            var classPolicies = Policies(controller);

            foreach (var action in Actions(controller))
            {
                var policies = Policies(action).Concat(classPolicies).ToArray();

                if (policies.Length == 0)
                {
                    unprotected.Add($"{controller.Name}.{action.Name}: no [Authorize] at all");
                    continue;
                }

                if (!policies.Any(AdminCapabilityCatalog.IsKnown))
                {
                    unprotected.Add(
                        $"{controller.Name}.{action.Name}: only [{string.Join(", ", policies)}]");
                }
            }
        }

        Assert.True(
            unprotected.Count == 0,
            "These Admin endpoints do not require a capability, so any active admin can call "
            + "them:\n  " + string.Join("\n  ", unprotected));
    }

    [Fact]
    public void EveryCapabilityInTheCatalogueIsUsedByAnEndpointOrIsExplainedHere()
    {
        // Capabilities that gate something other than a controller action.
        var nonEndpoint = new HashSet<string>
        {
            // Filters the detail sections of the shared dashboard rather than
            // guarding a route of its own.
            AdminCapabilities.AuditLogView,
        };

        var used = AdminControllers()
            .SelectMany(controller => Policies(controller)
                .Concat(Actions(controller).SelectMany(Policies)))
            .Where(AdminCapabilityCatalog.IsKnown)
            .ToHashSet(StringComparer.Ordinal);

        var unused = AdminCapabilityCatalog.AllKeys
            .Where(capability => !used.Contains(capability) && !nonEndpoint.Contains(capability))
            .ToArray();

        Assert.True(
            unused.Length == 0,
            "These capabilities are offered in the Roles screen but grant nothing, which is "
            + "misleading to whoever assigns them: " + string.Join(", ", unused));
    }

    [Fact]
    public void EveryCapabilityPolicyCanBeConstructed()
    {
        // A typo in a controller attribute would otherwise surface only as a
        // 500 on the first request to that endpoint.
        foreach (var capability in AdminCapabilityCatalog.AllKeys)
        {
            var requirement = new AdminCapabilityRequirement(capability);
            Assert.Equal(capability, requirement.Capability);
        }

        Assert.Throws<ArgumentException>(() => new AdminCapabilityRequirement("not.a.capability"));
    }

    [Fact]
    public void ReadingAndChangingAreSeparateCapabilitiesForEveryHighRiskModule()
    {
        // The brief's rule: a module that contains a high-risk action must not
        // be gated by one broad permission.
        foreach (var capability in new[]
                 {
                     AdminCapabilities.InventoryGenerate,
                     AdminCapabilities.PaymentProofsReview,
                     AdminCapabilities.PayoutsSettle,
                     AdminCapabilities.SmartTagsTransfer,
                     AdminCapabilities.AdminUsersManage,
                     AdminCapabilities.AdminRolesManage,
                 })
        {
            var descriptor = AdminCapabilityCatalog.Find(capability);
            Assert.NotNull(descriptor);
            Assert.True(descriptor!.IsSensitive, $"{capability} should be marked sensitive.");
            Assert.DoesNotContain(capability, AdminCapabilityCatalog.ReadOnlyKeys);
        }
    }

    private static IEnumerable<MethodInfo> Actions(Type controller) =>
        controller
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName
                && method.GetCustomAttributes<HttpMethodAttribute>().Any());

    private static string[] Policies(MemberInfo member) =>
        member.GetCustomAttributes<AuthorizeAttribute>(inherit: true)
            .Select(attribute => attribute.Policy)
            .Where(policy => !string.IsNullOrWhiteSpace(policy))
            .Select(policy => policy!)
            .ToArray();
}
