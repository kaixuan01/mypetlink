using MyPetLink.Api.Common;

namespace MyPetLink.Api.Services;

public abstract class SkeletonService : ISkeletonService
{
    public Task<PlaceholderResponse> NotImplementedAsync(
        string operation,
        CancellationToken cancellationToken = default)
    {
        var response = new PlaceholderResponse(
            operation,
            "Route is reserved in the V1 contract. Business logic will be implemented in the next backend phase.");

        return Task.FromResult(response);
    }
}

