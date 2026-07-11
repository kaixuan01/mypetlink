using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace MyPetLink.Api.Data;

public interface IDatabaseTransientExceptionClassifier
{
    bool IsTransient(Exception exception);
    int? GetPrimarySqlErrorNumber(Exception exception);
}

// Uses the SQL Server provider's own transient-error policy so middleware and
// EF retry the same failures. Schema, constraint, authentication, permission,
// configuration and programming failures are deliberately not added here.
public sealed class DatabaseTransientExceptionClassifier
    : SqlServerRetryingExecutionStrategy, IDatabaseTransientExceptionClassifier
{
    public DatabaseTransientExceptionClassifier(MyPetLinkDbContext dbContext)
        : base(dbContext)
    {
    }

    public bool IsTransient(Exception exception)
    {
        if (exception is OperationCanceledException)
        {
            return false;
        }

        if (ShouldRetryOn(exception))
        {
            return true;
        }

        // EF wraps the final provider exception after the configured retry
        // limit. Only unwrap this known execution-strategy wrapper.
        return exception is RetryLimitExceededException { InnerException: not null }
            && IsTransient(exception.InnerException);
    }

    public int? GetPrimarySqlErrorNumber(Exception exception)
    {
        if (exception is SqlException sqlException && sqlException.Errors.Count > 0)
        {
            return sqlException.Errors[0].Number;
        }

        return exception.InnerException is null
            ? null
            : GetPrimarySqlErrorNumber(exception.InnerException);
    }
}
