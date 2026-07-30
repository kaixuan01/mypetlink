using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShippingFulfilmentSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CourierProviderCode",
                table: "TagOrders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ShippingCourierProviders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    TrackingUrlTemplate = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShippingCourierProviders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShippingCourierProviders_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShippingFulfilmentSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SenderName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    CompanyName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    SenderPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SenderEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: true),
                    AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Postcode = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: false),
                    StateCode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Country = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DefaultParcelWeightKg = table.Column<decimal>(type: "decimal(8,3)", precision: 8, scale: 3, nullable: false),
                    DefaultParcelLengthCm = table.Column<decimal>(type: "decimal(8,2)", precision: 8, scale: 2, nullable: false),
                    DefaultParcelWidthCm = table.Column<decimal>(type: "decimal(8,2)", precision: 8, scale: 2, nullable: false),
                    DefaultParcelHeightCm = table.Column<decimal>(type: "decimal(8,2)", precision: 8, scale: 2, nullable: false),
                    CustomerTrackingLinksEnabled = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShippingFulfilmentSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShippingFulfilmentSettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "ShippingCourierProviders",
                columns: new[] { "Id", "Code", "CreatedAt", "DisplayName", "DisplayOrder", "InternalNotes", "IsActive", "IsDefault", "TrackingUrlTemplate", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[,]
                {
                    { new Guid("03a56970-0592-4c83-b0bd-6453c6833703"), "DHL_ECOMMERCE", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "DHL eCommerce", 30, null, true, false, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("0ac926be-7d6d-403f-9716-e4498354347a"), "POSLAJU", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Pos Laju", 20, null, true, false, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("28d1e1a3-0ca5-48d0-b624-757961e936d1"), "NINJA_VAN", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Ninja Van", 40, null, true, false, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("dcd3c11a-ddb7-4c50-bf21-0f4d0e3297d1"), "JNT", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "J&T Express", 10, null, true, true, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null }
                });

            migrationBuilder.InsertData(
                table: "ShippingFulfilmentSettings",
                columns: new[] { "Id", "AddressLine1", "AddressLine2", "City", "CompanyName", "Country", "CreatedAt", "CustomerTrackingLinksEnabled", "DefaultParcelHeightCm", "DefaultParcelLengthCm", "DefaultParcelWeightKg", "DefaultParcelWidthCm", "Postcode", "SenderEmail", "SenderName", "SenderPhone", "StateCode", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[] { new Guid("8b2a37be-928c-4f10-96a0-3c169ef00379"), "", null, "", null, "Malaysia", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), false, 3m, 18m, 0.5m, 12m, "", null, "", "", "", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });

            migrationBuilder.CreateIndex(
                name: "IX_ShippingCourierProviders_Code",
                table: "ShippingCourierProviders",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShippingCourierProviders_IsActive_DisplayOrder_DisplayName",
                table: "ShippingCourierProviders",
                columns: new[] { "IsActive", "DisplayOrder", "DisplayName" });

            migrationBuilder.CreateIndex(
                name: "IX_ShippingCourierProviders_IsDefault",
                table: "ShippingCourierProviders",
                column: "IsDefault",
                unique: true,
                filter: "[IsDefault] = 1");

            migrationBuilder.CreateIndex(
                name: "IX_ShippingCourierProviders_UpdatedByAdminUserId",
                table: "ShippingCourierProviders",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ShippingFulfilmentSettings_UpdatedByAdminUserId",
                table: "ShippingFulfilmentSettings",
                column: "UpdatedByAdminUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShippingCourierProviders");

            migrationBuilder.DropTable(
                name: "ShippingFulfilmentSettings");

            migrationBuilder.DropColumn(
                name: "CourierProviderCode",
                table: "TagOrders");
        }
    }
}
