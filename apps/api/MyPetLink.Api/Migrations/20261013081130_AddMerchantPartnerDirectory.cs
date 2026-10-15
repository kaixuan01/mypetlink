using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantPartnerDirectory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BusinessDescription",
                table: "Merchants",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DirectoryPublicCode",
                table: "Merchants",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ShowOnWebsite",
                table: "Merchants",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "MerchantBranches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    State = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Postcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Country = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    GoogleMapsUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    WazeUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    Latitude = table.Column<decimal>(type: "decimal(10,7)", precision: 10, scale: 7, nullable: true),
                    Longitude = table.Column<decimal>(type: "decimal(10,7)", precision: 10, scale: 7, nullable: true),
                    ContactPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    WhatsApp = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    BusinessHours = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ShowOnWebsite = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantBranches", x => x.Id);
                    table.CheckConstraint("CK_MerchantBranches_Coordinates", "([Latitude] IS NULL AND [Longitude] IS NULL) OR ([Latitude] IS NOT NULL AND [Longitude] IS NOT NULL AND [Latitude] BETWEEN -90 AND 90 AND [Longitude] BETWEEN -180 AND 180)");
                    table.ForeignKey(
                        name: "FK_MerchantBranches_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_DirectoryPublicCode",
                table: "Merchants",
                column: "DirectoryPublicCode",
                unique: true,
                filter: "[DirectoryPublicCode] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_ShowOnWebsite_IsActive",
                table: "Merchants",
                columns: new[] { "ShowOnWebsite", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantBranches_MerchantId_IsActive_ShowOnWebsite_DisplayOrder",
                table: "MerchantBranches",
                columns: new[] { "MerchantId", "IsActive", "ShowOnWebsite", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantBranches_State_City",
                table: "MerchantBranches",
                columns: new[] { "State", "City" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MerchantBranches");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_DirectoryPublicCode",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_ShowOnWebsite_IsActive",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "BusinessDescription",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "DirectoryPublicCode",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "ShowOnWebsite",
                table: "Merchants");
        }
    }
}
