using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;

namespace MyPetLink.Api.Services;

/// <summary>
/// SKU-scoped SQL Server application lock shared by order creation and the
/// unpaid-reservation expiry worker, so both serialise on the same resource
/// and an expiry can never race a checkout for the same variant.
/// </summary>
internal sealed class SqlServerInventoryReservationLock : IAsyncDisposable
{
    private const int LockTimeoutMilliseconds = 15_000;
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IReadOnlyList<string> _resources;
    private readonly bool _closeConnection;

    private SqlServerInventoryReservationLock(
        MyPetLinkDbContext dbContext,
        IReadOnlyList<string> resources,
        bool closeConnection)
    {
        _dbContext = dbContext;
        _resources = resources;
        _closeConnection = closeConnection;
    }

    public static async Task<SqlServerInventoryReservationLock> AcquireAsync(
        MyPetLinkDbContext dbContext,
        IEnumerable<Guid> productVariantIds,
        CancellationToken cancellationToken)
    {
        var resources = productVariantIds
            .Distinct()
            .OrderBy(id => id)
            .Select(id => $"MyPetLink:TagOrderInventory:{id:N}")
            .ToArray();
        var closeConnection = dbContext.Database.GetDbConnection().State != ConnectionState.Open;
        if (closeConnection)
        {
            await dbContext.Database.OpenConnectionAsync(cancellationToken);
        }

        var acquired = new List<string>(resources.Length);
        try
        {
            foreach (var resource in resources)
            {
                var result = new SqlParameter("@result", SqlDbType.Int)
                {
                    Direction = ParameterDirection.Output
                };
                var resourceParameter = new SqlParameter("@resource", resource);
                var timeoutParameter = new SqlParameter("@timeout", LockTimeoutMilliseconds);
                await dbContext.Database.ExecuteSqlRawAsync(
                    "EXEC @result = sys.sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = @timeout;",
                    [result, resourceParameter, timeoutParameter],
                    cancellationToken);

                if (result.Value is not int code || code < 0)
                {
                    throw new ApiException(
                        StatusCodes.Status409Conflict,
                        "inventory_busy",
                        "Inventory availability changed while this order was being placed. Please review your tags and try again.");
                }
                acquired.Add(resource);
            }

            return new SqlServerInventoryReservationLock(dbContext, acquired, closeConnection);
        }
        catch
        {
            await ReleaseAsync(dbContext, acquired);
            if (closeConnection)
            {
                await dbContext.Database.CloseConnectionAsync();
            }
            throw;
        }
    }

    public static async Task<SqlServerInventoryReservationLock?> AcquireForOrderAsync(
        MyPetLinkDbContext dbContext,
        Guid orderId,
        CancellationToken cancellationToken)
    {
        var variantIds = await dbContext.TagOrderItems
            .Where(item => item.OrderId == orderId && item.ProductVariantId != null)
            .Select(item => item.ProductVariantId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        return variantIds.Count == 0
            ? null
            : await AcquireAsync(dbContext, variantIds, cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        await ReleaseAsync(_dbContext, _resources);
        if (_closeConnection)
        {
            await _dbContext.Database.CloseConnectionAsync();
        }
    }

    private static async Task ReleaseAsync(
        MyPetLinkDbContext dbContext,
        IEnumerable<string> resources)
    {
        foreach (var resource in resources.Reverse())
        {
            var resourceParameter = new SqlParameter("@resource", resource);
            await dbContext.Database.ExecuteSqlRawAsync(
                "EXEC sys.sp_releaseapplock @Resource = @resource, @LockOwner = 'Session';",
                [resourceParameter]);
        }
    }
}
