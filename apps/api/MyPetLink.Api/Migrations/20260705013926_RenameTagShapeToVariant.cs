using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class RenameTagShapeToVariant : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Shape",
                table: "TagOrders",
                newName: "Variant");

            migrationBuilder.RenameColumn(
                name: "Shape",
                table: "SmartTags",
                newName: "Variant");

            migrationBuilder.RenameColumn(
                name: "Shape",
                table: "SmartTagBatches",
                newName: "Variant");

            migrationBuilder.RenameIndex(
                name: "IX_SmartTagBatches_Shape",
                table: "SmartTagBatches",
                newName: "IX_SmartTagBatches_Variant");

            // Map legacy shape values (e.g. Round/Circle/Bone) to the Standard
            // variant so existing rows use the new two-value model. Known
            // variant values are left untouched.
            foreach (var table in new[] { "TagOrders", "SmartTags", "SmartTagBatches" })
            {
                migrationBuilder.Sql(
                    $"UPDATE [{table}] SET [Variant] = 'Standard' " +
                    "WHERE [Variant] IS NULL OR [Variant] NOT IN ('Lightweight', 'Standard');");
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Variant",
                table: "TagOrders",
                newName: "Shape");

            migrationBuilder.RenameColumn(
                name: "Variant",
                table: "SmartTags",
                newName: "Shape");

            migrationBuilder.RenameColumn(
                name: "Variant",
                table: "SmartTagBatches",
                newName: "Shape");

            migrationBuilder.RenameIndex(
                name: "IX_SmartTagBatches_Variant",
                table: "SmartTagBatches",
                newName: "IX_SmartTagBatches_Shape");
        }
    }
}
