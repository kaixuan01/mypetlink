namespace MyPetLink.Api.Data;

public interface IDatabaseReadinessProbe
{
    Task<bool> IsReadyAsync(CancellationToken cancellationToken);
}

public sealed class DatabaseReadinessProbe(MyPetLinkDbContext dbContext)
    : IDatabaseReadinessProbe
{
    public Task<bool> IsReadyAsync(CancellationToken cancellationToken) =>
        dbContext.Database.CanConnectAsync(cancellationToken);
}
