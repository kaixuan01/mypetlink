using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSmartTagPhysicalQa : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "QaInspectedAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QaInspectedByAdminUserId",
                table: "SmartTags",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "QaInspectionId",
                table: "SmartTags",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaNfcSerialNumber",
                table: "SmartTags",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaNfcSource",
                table: "SmartTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaNfcUrl",
                table: "SmartTags",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "QaNfcVerifiedAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaPhysicalCondition",
                table: "SmartTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unchecked");

            migrationBuilder.AddColumn<string>(
                name: "QaQrUrl",
                table: "SmartTags",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "QaQrVerifiedAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaRemarks",
                table: "SmartTags",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaShipmentReference",
                table: "SmartTags",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QaStatus",
                table: "SmartTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QaVersion",
                table: "SmartTags",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "PhysicalQaShipments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShipmentReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ExpectedCount = table.Column<int>(type: "int", nullable: false),
                    ManifestSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    EnrolledByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EnrolledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhysicalQaShipments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PhysicalQaShipments_AdminUsers_EnrolledByAdminUserId",
                        column: x => x.EnrolledByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_ProductVariantId_QaStatus_Status",
                table: "SmartTags",
                columns: new[] { "ProductVariantId", "QaStatus", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_QaInspectedByAdminUserId",
                table: "SmartTags",
                column: "QaInspectedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_QaInspectionId",
                table: "SmartTags",
                column: "QaInspectionId",
                unique: true,
                filter: "[QaInspectionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_QaNfcSerialNumber",
                table: "SmartTags",
                column: "QaNfcSerialNumber",
                unique: true,
                filter: "[QaNfcSerialNumber] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_QaShipmentReference_QaStatus",
                table: "SmartTags",
                columns: new[] { "QaShipmentReference", "QaStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalQaShipments_EnrolledByAdminUserId",
                table: "PhysicalQaShipments",
                column: "EnrolledByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PhysicalQaShipments_ShipmentReference",
                table: "PhysicalQaShipments",
                column: "ShipmentReference",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTags_AdminUsers_QaInspectedByAdminUserId",
                table: "SmartTags",
                column: "QaInspectedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_AdminUsers_QaInspectedByAdminUserId",
                table: "SmartTags");

            migrationBuilder.DropTable(
                name: "PhysicalQaShipments");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_ProductVariantId_QaStatus_Status",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_QaInspectedByAdminUserId",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_QaInspectionId",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_QaNfcSerialNumber",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_QaShipmentReference_QaStatus",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaInspectedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaInspectedByAdminUserId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaInspectionId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaNfcSerialNumber",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaNfcSource",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaNfcUrl",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaNfcVerifiedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaPhysicalCondition",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaQrUrl",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaQrVerifiedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaRemarks",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaShipmentReference",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaStatus",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "QaVersion",
                table: "SmartTags");
        }
    }
}
