using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEstimatedBirthYear : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "EstimatedBirthYear",
                table: "Pets",
                type: "smallint",
                nullable: true);

            // Preserve the legacy label and only backfill labels with a clear,
            // numeric meaning. Unknown, 15+, and arbitrary text stay null for
            // manual review rather than being converted speculatively.
            migrationBuilder.Sql(
                """
                ;WITH LegacyAge AS
                (
                    SELECT
                        [Id],
                        LOWER(LTRIM(RTRIM([EstimatedAgeLabel]))) AS [NormalizedLabel],
                        CASE
                            WHEN YEAR([CreatedAt]) BETWEEN 1900 AND YEAR(SYSUTCDATETIME())
                                THEN YEAR([CreatedAt])
                            ELSE YEAR(SYSUTCDATETIME())
                        END AS [ReferenceYear]
                    FROM [Pets]
                    WHERE [Birthday] IS NULL
                      AND [EstimatedBirthYear] IS NULL
                      AND [EstimatedAgeLabel] IS NOT NULL
                ),
                ParsedAge AS
                (
                    SELECT
                        [Id],
                        [ReferenceYear],
                        CASE
                            WHEN [NormalizedLabel] IN ('estimated under 1 year', 'under 1 year') THEN 0
                            WHEN [NormalizedLabel] LIKE 'estimated % year'
                              OR [NormalizedLabel] LIKE 'estimated % years'
                              OR [NormalizedLabel] LIKE '% year'
                              OR [NormalizedLabel] LIKE '% years'
                                THEN TRY_CONVERT(
                                    int,
                                    REPLACE(
                                        REPLACE(
                                            REPLACE([NormalizedLabel], 'estimated ', ''),
                                            ' years', ''),
                                        ' year', ''))
                            ELSE NULL
                        END AS [EstimatedYears]
                    FROM LegacyAge
                )
                UPDATE pet
                SET [EstimatedBirthYear] = CONVERT(smallint, parsed.[ReferenceYear] - parsed.[EstimatedYears])
                FROM [Pets] AS pet
                INNER JOIN ParsedAge AS parsed ON parsed.[Id] = pet.[Id]
                WHERE parsed.[EstimatedYears] BETWEEN 0 AND parsed.[ReferenceYear] - 1900;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EstimatedBirthYear",
                table: "Pets");
        }
    }
}
