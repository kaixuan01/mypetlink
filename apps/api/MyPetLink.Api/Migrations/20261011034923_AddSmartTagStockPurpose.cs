using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSmartTagStockPurpose : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StockPurpose",
                table: "SmartTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unclassified");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SmartTags_StockPurpose",
                table: "SmartTags",
                sql: "[StockPurpose] IN (N'Unclassified', N'Sale', N'Test')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SmartTags_StockPurpose",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "StockPurpose",
                table: "SmartTags");
        }
    }
}
