using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace MyPetLink.Api.Auth;

public sealed class AuthorizeOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var endpointMetadata = context.ApiDescription.ActionDescriptor.EndpointMetadata;

        if (endpointMetadata.OfType<AllowAnonymousAttribute>().Any())
        {
            return;
        }

        var requiresAuthorization = endpointMetadata.OfType<AuthorizeAttribute>().Any();
        if (!requiresAuthorization)
        {
            return;
        }

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference
                        {
                            Type = ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            }
        ];

        operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Unauthorized" });
    }
}
