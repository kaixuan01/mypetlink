using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMalaysiaDeliveryRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "TagOrders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryMethodName",
                table: "TagOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryZoneName",
                table: "TagOrders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FreeShippingReason",
                table: "TagOrders",
                type: "nvarchar(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StateCode",
                table: "TagOrders",
                type: "nvarchar(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TotalAmount",
                table: "TagOrders",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DeliveryRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ZoneCode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ApplicableStateCodesJson = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Fee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    FreeShippingThreshold = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeliveryRates", x => x.Id);
                });

            // Safe defaults: all four canonical zones exist for Admin setup,
            // but stay unavailable until an administrator explicitly enables
            // the intended fee (including an intentional RM 0 rate).
            migrationBuilder.InsertData(
                table: "DeliveryRates",
                columns: new[] { "Id", "Name", "ZoneCode", "ApplicableStateCodesJson", "Fee", "Currency", "FreeShippingThreshold", "IsActive", "DisplayOrder", "CreatedAt", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("6c50d914-8550-41e8-a923-010cc3b8a101"), "Peninsular Standard Delivery", "PEN", "[\"JHR\",\"KDH\",\"KTN\",\"MLK\",\"NSN\",\"PHG\",\"PRK\",\"PLS\",\"PNG\",\"SGR\",\"TRG\",\"KUL\",\"PJY\"]", 0m, "MYR", null, false, 10, new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero) },
                    { new Guid("6c50d914-8550-41e8-a923-010cc3b8a102"), "Sabah Standard Delivery", "SBH", "[\"SBH\"]", 0m, "MYR", null, false, 20, new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero) },
                    { new Guid("6c50d914-8550-41e8-a923-010cc3b8a103"), "Sarawak Standard Delivery", "SWK", "[\"SWK\"]", 0m, "MYR", null, false, 30, new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero) },
                    { new Guid("6c50d914-8550-41e8-a923-010cc3b8a104"), "Labuan Standard Delivery", "LBN", "[\"LBN\"]", 0m, "MYR", null, false, 40, new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 7, 27, 0, 0, 0, TimeSpan.Zero) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryRates_IsActive_DisplayOrder",
                table: "DeliveryRates",
                columns: new[] { "IsActive", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryRates_ZoneCode",
                table: "DeliveryRates",
                column: "ZoneCode",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DeliveryRates");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "DeliveryMethodName",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "DeliveryZoneName",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "FreeShippingReason",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "StateCode",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "TotalAmount",
                table: "TagOrders");
        }
    }
}
