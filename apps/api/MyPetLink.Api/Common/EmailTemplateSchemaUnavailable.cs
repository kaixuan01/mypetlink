using Microsoft.Data.SqlClient;

namespace MyPetLink.Api.Common;

internal static class EmailTemplateSchemaUnavailable
{
    public const string RequiredMigration = "20260729094414_AddEmailTemplateSettings";
    public const string ErrorCode = "email_template_configuration_unavailable";
    public const string AdminMessage =
        "Email template configuration is not available because the database update has not been applied.";

    public static bool IsMatch(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is not SqlException sqlException)
            {
                continue;
            }

            foreach (SqlError error in sqlException.Errors)
            {
                if (error.Number is not (207 or 208))
                {
                    continue;
                }

                if (error.Message.Contains(
                        "EmailTemplateSettings",
                        StringComparison.OrdinalIgnoreCase)
                    || error.Message.Contains(
                        "SuppressionReason",
                        StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        return false;
    }

    public static ApiException ApiError() =>
        new(
            StatusCodes.Status503ServiceUnavailable,
            ErrorCode,
            AdminMessage);
}
