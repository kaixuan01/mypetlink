using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

public sealed class TagCatalogRequestValidationTests
{
    [Fact]
    public async Task AdminCatalogRoutes_RequireAuthentication()
    {
        await using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
        using var client = factory.CreateClient();

        var products = await client.GetAsync("/api/v1/admin/tag-products");
        var promotions = await client.GetAsync("/api/v1/admin/promotions");

        Assert.Equal(HttpStatusCode.Unauthorized, products.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, promotions.StatusCode);
    }

    [Fact]
    public void ProductRecord_UsesConstructorParameterValidation_WithoutMvcMetadataException()
    {
        using var services = MvcServices();
        var request = new UpsertTagProductRequest(
            null!,
            null!,
            null,
            null,
            false,
            -1,
            null,
            null);

        var modelState = Validate(services, request);

        Assert.False(modelState.IsValid);
        Assert.Contains(modelState.Keys, key => key.Equals("Name", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(modelState.Keys, key => key.Equals("Slug", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(modelState.Keys, key => key.Equals("SortOrder", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PromotionRecord_UsesConstructorParameterValidation_WithoutMvcMetadataException()
    {
        using var services = MvcServices();
        var request = new UpsertPromotionRequest(
            null!,
            null,
            null,
            false,
            true,
            PromotionDiscountType.Percentage,
            10m,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.AddDays(1),
            -1,
            [],
            null);

        var modelState = Validate(services, request);

        Assert.False(modelState.IsValid);
        Assert.Contains(modelState.Keys, key => key.Equals("Name", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(modelState.Keys, key => key.Equals("Priority", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(modelState.Keys, key => key.Equals("ProductVariantIds", StringComparison.OrdinalIgnoreCase));
    }

    private static ServiceProvider MvcServices()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers();
        return services.BuildServiceProvider();
    }

    private static ModelStateDictionary Validate(ServiceProvider services, object model)
    {
        var modelState = new ModelStateDictionary();
        var context = new ActionContext(
            new DefaultHttpContext { RequestServices = services },
            new RouteData(),
            new ActionDescriptor(),
            modelState);

        services.GetRequiredService<IObjectModelValidator>()
            .Validate(context, validationState: null, prefix: string.Empty, model: model);

        return modelState;
    }
}
