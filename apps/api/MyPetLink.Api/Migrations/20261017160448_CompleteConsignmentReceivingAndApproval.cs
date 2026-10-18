using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class CompleteConsignmentReceivingAndApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceivingState",
                table: "ConsignmentUnits",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Unconfirmed");

            migrationBuilder.AddColumn<bool>(
                name: "DraftContributorHistoryComplete",
                table: "ConsignmentAgreements",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Classify only facts already established by custody. An old open discrepancy
            // needs an independent unit review; do not invent good/missing quantities.
            migrationBuilder.Sql("""
                UPDATE u SET ReceivingState = CASE
                  WHEN u.Status IN ('Received','ExternalHandover') THEN 'Good'
                  WHEN d.HasOpenDiscrepancy = 1 THEN 'ReviewRequired'
                  WHEN u.ReturnedAt IS NOT NULL THEN 'Returned' ELSE 'Unconfirmed' END,
                  DiscrepancyRecordedByAdminUserId = CASE WHEN d.HasOpenDiscrepancy = 1 THEN
                    (SELECT TOP(1) m.ActorAdminUserId FROM ConsignmentMovements m
                     WHERE m.DispatchId=d.Id AND m.Action='record-discrepancy' ORDER BY m.OccurredAt DESC,m.Id DESC) ELSE NULL END
                FROM ConsignmentUnits u JOIN ConsignmentDispatches d ON d.Id=u.DispatchId;
                """);

            migrationBuilder.CreateTable(
                name: "ConsignmentDraftContributors",
                columns: table => new
                {
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FirstContributedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IsCreator = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDraftContributors", x => new { x.AgreementId, x.AdminUserId });
                    table.ForeignKey(
                        name: "FK_ConsignmentDraftContributors_AdminUsers_AdminUserId",
                        column: x => x.AdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDraftContributors_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentUnits_DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits",
                column: "DiscrepancyRecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDraftContributors_AdminUserId",
                table: "ConsignmentDraftContributors",
                column: "AdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentUnits_AdminUsers_DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits",
                column: "DiscrepancyRecordedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentAgreements WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentDispatches WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentUnits WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentMovements WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentHandoverRecords WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentDraftContributors WITH(TABLOCKX,HOLDLOCK))
                    THROW 51040, 'Consignment rollback blocked: preserve receiving, contributor and custody history.', 1;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentUnits_AdminUsers_DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits");

            migrationBuilder.DropTable(
                name: "ConsignmentDraftContributors");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentUnits_DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits");

            migrationBuilder.DropColumn(
                name: "DiscrepancyRecordedByAdminUserId",
                table: "ConsignmentUnits");

            migrationBuilder.DropColumn(
                name: "ReceivingState",
                table: "ConsignmentUnits");

            migrationBuilder.DropColumn(
                name: "DraftContributorHistoryComplete",
                table: "ConsignmentAgreements");
        }
    }
}
