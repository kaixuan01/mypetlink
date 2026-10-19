using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class HardenConsignmentSalesReporting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ConsignmentSalesReportLines_ProductVariantId",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropIndex(
                name: "UX_ConsignmentSalesReportLines_Line",
                table: "ConsignmentSalesReportLines");


            migrationBuilder.AddColumn<bool>(
                name: "SealedReturnConfirmed",
                table: "ConsignmentSalesReportLines",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SealedReturnEvidence",
                table: "ConsignmentSalesReportLines",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentRecordContributors",
                columns: table => new
                {
                    SubjectType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    FirstContributedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentRecordContributors", x => new { x.SubjectType, x.SubjectId, x.AdminUserId });
                    table.CheckConstraint("CK_ConsignmentRecordContributor_Role", "[Role] IN ('Created','Edited','Recorded')");
                    table.CheckConstraint("CK_ConsignmentRecordContributor_Subject", "[SubjectType] IN ('ConsignmentSalesReport','ConsignmentPriceTerm')");
                    table.ForeignKey(
                        name: "FK_ConsignmentRecordContributors_AdminUsers_AdminUserId",
                        column: x => x.AdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            // Contributor history for records made before it was kept: every creator, and
            // every recorder who was not the creator. Editors were never stored, so they
            // cannot be recovered; reviewers of these records see only what is known.
            migrationBuilder.Sql("""
                INSERT INTO ConsignmentRecordContributors (SubjectType, SubjectId, AdminUserId, Role, FirstContributedAt)
                SELECT 'ConsignmentPriceTerm', t.Id, t.CreatedByAdminUserId, 'Created', t.CreatedAt
                FROM ConsignmentPriceTerms t
                WHERE NOT EXISTS (SELECT 1 FROM ConsignmentRecordContributors c
                    WHERE c.SubjectType = 'ConsignmentPriceTerm' AND c.SubjectId = t.Id AND c.AdminUserId = t.CreatedByAdminUserId);
                INSERT INTO ConsignmentRecordContributors (SubjectType, SubjectId, AdminUserId, Role, FirstContributedAt)
                SELECT 'ConsignmentSalesReport', r.Id, r.CreatedByAdminUserId, 'Created', r.CreatedAt
                FROM ConsignmentSalesReports r
                WHERE NOT EXISTS (SELECT 1 FROM ConsignmentRecordContributors c
                    WHERE c.SubjectType = 'ConsignmentSalesReport' AND c.SubjectId = r.Id AND c.AdminUserId = r.CreatedByAdminUserId);
                INSERT INTO ConsignmentRecordContributors (SubjectType, SubjectId, AdminUserId, Role, FirstContributedAt)
                SELECT 'ConsignmentSalesReport', r.Id, r.RecordedByAdminUserId, 'Recorded', COALESCE(r.RecordedAt, r.UpdatedAt)
                FROM ConsignmentSalesReports r
                WHERE r.RecordedByAdminUserId IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM ConsignmentRecordContributors c
                    WHERE c.SubjectType = 'ConsignmentSalesReport' AND c.SubjectId = r.Id AND c.AdminUserId = r.RecordedByAdminUserId);
                """);

            // Restocked returns entered before confirmation existed are labelled honestly, not
            // confirmed: SealedReturnConfirmed stays 0, so an unverified one can't be verified as is.
            migrationBuilder.Sql("""
                UPDATE ConsignmentSalesReportLines
                SET SealedReturnEvidence = N'Entered before sealed-return confirmation was required'
                WHERE RestockableQuantity > 0 AND SealedReturnEvidence IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReportLines_Capacity",
                table: "ConsignmentSalesReportLines",
                columns: new[] { "ProductVariantId", "PriceTermId", "LineType" })
                .Annotation("SqlServer:Include", new[] { "Quantity", "RefundOfPeriodStart" });

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReportLines_Line",
                table: "ConsignmentSalesReportLines",
                columns: new[] { "SalesReportId", "LineType", "ProductVariantId", "PriceTermId", "RefundOfPeriodStart" },
                unique: true,
                filter: "[PriceTermId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentSalesLine_SealedReturn",
                table: "ConsignmentSalesReportLines",
                sql: "[RestockableQuantity] = 0 OR ([SealedReturnEvidence] IS NOT NULL AND LEN([SealedReturnEvidence]) >= 5)");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentRecordContributors_AdminUserId",
                table: "ConsignmentRecordContributors",
                column: "AdminUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Contributor history is review evidence, and the wider line key may already hold
            // refunds the earlier key can't. Rolling back is only possible with no such history.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentRecordContributors WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentSalesReportLines WITH(TABLOCKX,HOLDLOCK)
                      WHERE SealedReturnConfirmed = 1 OR SealedReturnEvidence IS NOT NULL)
                    THROW 51045, 'Consignment rollback blocked: retain sales report contributor and sealed-return history.', 1;
                """);
            migrationBuilder.DropTable(
                name: "ConsignmentRecordContributors");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentSalesReportLines_Capacity",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropIndex(
                name: "UX_ConsignmentSalesReportLines_Line",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentSalesLine_SealedReturn",
                table: "ConsignmentSalesReportLines");


            migrationBuilder.DropColumn(
                name: "SealedReturnConfirmed",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropColumn(
                name: "SealedReturnEvidence",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReportLines_ProductVariantId",
                table: "ConsignmentSalesReportLines",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReportLines_Line",
                table: "ConsignmentSalesReportLines",
                columns: new[] { "SalesReportId", "LineType", "ProductVariantId", "PriceTermId" },
                unique: true,
                filter: "[PriceTermId] IS NOT NULL");
        }
    }
}
