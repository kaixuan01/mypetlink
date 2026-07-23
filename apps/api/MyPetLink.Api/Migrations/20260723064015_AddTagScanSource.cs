using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTagScanSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "TagScans",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                // Every scan created before source-aware routes existed came
                // through the legacy /t entry point.
                defaultValue: "Legacy");

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_SmartTagId_Source_ScanTime",
                table: "TagScans",
                columns: new[] { "SmartTagId", "Source", "ScanTime" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagScans_SmartTagId_Source_ScanTime",
                table: "TagScans");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "TagScans");
        }
    }
}
