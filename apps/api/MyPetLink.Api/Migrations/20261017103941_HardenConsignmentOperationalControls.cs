using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class HardenConsignmentOperationalControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (SELECT [RequestFingerprint] FROM [ConsignmentDispatches] WHERE [Status] = 'Reserved'
                           GROUP BY [RequestFingerprint] HAVING COUNT_BIG(*) > 1)
                    THROW 51041, 'Duplicate active consignment reservations require operator review before this migration. Preserve history; cancel only confirmed duplicates.', 1;
                """);
            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentUnit_Release",
                table: "ConsignmentUnits");

            migrationBuilder.AddColumn<Guid>(
                name: "CurrentHandoverRecordId",
                table: "ConsignmentUnits",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EvidenceJson",
                table: "ConsignmentMovements",
                type: "nvarchar(max)",
                maxLength: 6000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DispatchedByAdminUserId",
                table: "ConsignmentDispatches",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DocumentIssuedAt",
                table: "ConsignmentDispatches",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasOpenDiscrepancy",
                table: "ConsignmentDispatches",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<byte[]>(
                name: "IssuedDocumentContent",
                table: "ConsignmentDispatches",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IssuedDocumentSha256",
                table: "ConsignmentDispatches",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MerchantBranchId",
                table: "ConsignmentDispatches",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PartnerReceivedAt",
                table: "ConsignmentDispatches",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReceivedByAdminUserId",
                table: "ConsignmentDispatches",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReceivedQuantity",
                table: "ConsignmentDispatches",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecipientName",
                table: "ConsignmentDispatches",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedAt",
                table: "ConsignmentAgreements",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedByAdminUserId",
                table: "ConsignmentAgreements",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentHandoverRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DispatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventReference = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    SupersedesRecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EventAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IsReportedSale = table.Column<bool>(type: "bit", nullable: false),
                    SellingPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    DiscountDescription = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    EvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentHandoverRecords", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentHandover_Amounts", "([IsReportedSale] = 0 AND [SellingPrice] IS NULL AND [DiscountAmount] IS NULL) OR ([IsReportedSale] = 1 AND [SellingPrice] >= 0 AND [DiscountAmount] >= 0)");
                    table.CheckConstraint("CK_ConsignmentHandover_Kind", "[Kind] IN ('Handover','Correction','Reversal')");
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_AdminUsers_ActorAdminUserId",
                        column: x => x.ActorAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_ConsignmentDispatches_DispatchId",
                        column: x => x.DispatchId,
                        principalTable: "ConsignmentDispatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_ConsignmentHandoverRecords_SupersedesRecordId",
                        column: x => x.SupersedesRecordId,
                        principalTable: "ConsignmentHandoverRecords",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_ConsignmentUnits_UnitId_DispatchId",
                        columns: x => new { x.UnitId, x.DispatchId },
                        principalTable: "ConsignmentUnits",
                        principalColumns: new[] { "Id", "DispatchId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentHandoverRecords_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentUnit_Release",
                table: "ConsignmentUnits",
                sql: "([Status] = 'Released' AND [ReleasedAt] IS NOT NULL) OR ([Status] IN ('Reserved','Dispatched','Received','ReturnedQuarantine','ExternalHandover','WrittenOff') AND [ReleasedAt] IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_DispatchedByAdminUserId",
                table: "ConsignmentDispatches",
                column: "DispatchedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_MerchantBranchId",
                table: "ConsignmentDispatches",
                column: "MerchantBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_ReceivedByAdminUserId",
                table: "ConsignmentDispatches",
                column: "ReceivedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_RequestFingerprint",
                table: "ConsignmentDispatches",
                column: "RequestFingerprint",
                unique: true,
                filter: "[Status] = 'Reserved'");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_ApprovedByAdminUserId",
                table: "ConsignmentAgreements",
                column: "ApprovedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_ActorAdminUserId",
                table: "ConsignmentHandoverRecords",
                column: "ActorAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_AgreementId",
                table: "ConsignmentHandoverRecords",
                column: "AgreementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_DispatchId",
                table: "ConsignmentHandoverRecords",
                column: "DispatchId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_MerchantId_EventAt",
                table: "ConsignmentHandoverRecords",
                columns: new[] { "MerchantId", "EventAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_MerchantId_EventReference",
                table: "ConsignmentHandoverRecords",
                columns: new[] { "MerchantId", "EventReference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_SupersedesRecordId",
                table: "ConsignmentHandoverRecords",
                column: "SupersedesRecordId",
                unique: true,
                filter: "[SupersedesRecordId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentHandoverRecords_UnitId_DispatchId",
                table: "ConsignmentHandoverRecords",
                columns: new[] { "UnitId", "DispatchId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentAgreements_AdminUsers_ApprovedByAdminUserId",
                table: "ConsignmentAgreements",
                column: "ApprovedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDispatches_AdminUsers_DispatchedByAdminUserId",
                table: "ConsignmentDispatches",
                column: "DispatchedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDispatches_AdminUsers_ReceivedByAdminUserId",
                table: "ConsignmentDispatches",
                column: "ReceivedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDispatches_MerchantBranches_MerchantBranchId",
                table: "ConsignmentDispatches",
                column: "MerchantBranchId",
                principalTable: "MerchantBranches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM [ConsignmentAgreements] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentDispatches] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentUnits] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentMovements] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentHandoverRecords] WITH (TABLOCKX, HOLDLOCK))
                    THROW 51040, 'Consignment history exists. Destructive rollback is blocked. Retain the schema and reconcile custody.', 1;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentAgreements_AdminUsers_ApprovedByAdminUserId",
                table: "ConsignmentAgreements");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDispatches_AdminUsers_DispatchedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDispatches_AdminUsers_ReceivedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDispatches_MerchantBranches_MerchantBranchId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropTable(
                name: "ConsignmentHandoverRecords");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentUnit_Release",
                table: "ConsignmentUnits");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDispatches_DispatchedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDispatches_MerchantBranchId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDispatches_ReceivedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDispatches_RequestFingerprint",
                table: "ConsignmentDispatches");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentAgreements_ApprovedByAdminUserId",
                table: "ConsignmentAgreements");

            migrationBuilder.DropColumn(
                name: "CurrentHandoverRecordId",
                table: "ConsignmentUnits");

            migrationBuilder.DropColumn(
                name: "EvidenceJson",
                table: "ConsignmentMovements");

            migrationBuilder.DropColumn(
                name: "DispatchedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "DocumentIssuedAt",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "HasOpenDiscrepancy",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "IssuedDocumentContent",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "IssuedDocumentSha256",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "MerchantBranchId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "PartnerReceivedAt",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "ReceivedByAdminUserId",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "ReceivedQuantity",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "RecipientName",
                table: "ConsignmentDispatches");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "ConsignmentAgreements");

            migrationBuilder.DropColumn(
                name: "ApprovedByAdminUserId",
                table: "ConsignmentAgreements");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentUnit_Release",
                table: "ConsignmentUnits",
                sql: "([Status] = 'Released' AND [ReleasedAt] IS NOT NULL) OR ([Status] IN ('Reserved','Dispatched','Received','ReturnedQuarantine','ExternalHandover') AND [ReleasedAt] IS NULL)");
        }
    }
}
