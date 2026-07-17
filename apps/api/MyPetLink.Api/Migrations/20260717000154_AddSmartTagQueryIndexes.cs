using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSmartTagQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_ActivatedAt",
                table: "SmartTags",
                column: "ActivatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_UpdatedAt",
                table: "SmartTags",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SmartTags_ActivatedAt",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_UpdatedAt",
                table: "SmartTags");
        }
    }
}
