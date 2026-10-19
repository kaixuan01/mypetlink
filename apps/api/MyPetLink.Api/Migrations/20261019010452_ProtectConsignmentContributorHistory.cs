using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProtectConsignmentContributorHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every price term and report that already exists predates complete contributor history:
            // its editors were never recorded. The column default (0) marks exactly those rows as
            // unknown, so they fail closed; the application writes 1 for every row it creates.
            migrationBuilder.AddColumn<bool>(
                name: "ContributorHistoryComplete",
                table: "ConsignmentSalesReports",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "StartsFreshContributorHistory",
                table: "ConsignmentSalesReports",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ContributorHistoryComplete",
                table: "ConsignmentPriceTerms",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Contributor history decides who may review; like the ledger and the review journal it is
            // append-only for every write path, not only for the application.
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentRecordContributors_AppendOnly ON ConsignmentRecordContributors
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51046, ''Consignment contributor history is append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back would forget which records have unknown history and lift the append-only
            // guard, so it is only possible before any price or report exists.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentPriceTerms WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentSalesReports WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentRecordContributors WITH(TABLOCKX,HOLDLOCK))
                    THROW 51047, 'Consignment rollback blocked: retain contributor history and its completeness.', 1;
                """);

            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentRecordContributors_AppendOnly;");

            migrationBuilder.DropColumn(
                name: "ContributorHistoryComplete",
                table: "ConsignmentSalesReports");

            migrationBuilder.DropColumn(
                name: "StartsFreshContributorHistory",
                table: "ConsignmentSalesReports");

            migrationBuilder.DropColumn(
                name: "ContributorHistoryComplete",
                table: "ConsignmentPriceTerms");
        }
    }
}
