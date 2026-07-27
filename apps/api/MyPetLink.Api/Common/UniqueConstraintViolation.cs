using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace MyPetLink.Api.Common;

internal static class UniqueConstraintViolation
{
    public static bool IsFor(DbUpdateException exception, string indexName)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is not SqlException sqlException
                || !sqlException.Errors.Cast<SqlError>().Any(error => error.Number is 2601 or 2627))
            {
                continue;
            }

            return sqlException.Message.Contains(indexName, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }
}
