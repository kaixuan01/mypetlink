using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTagVariantPresets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TagVariantPresetId",
                table: "TagProductVariants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TagVariantPresets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagVariantPresets", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "TagVariantPresets",
                columns: new[] { "Id", "Code", "CreatedAt", "Description", "DisplayName", "IsActive", "SortOrder", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c01"), "STANDARD", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Standard-size tag for dogs and medium to large pets.", "Standard", true, 0, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { new Guid("3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c02"), "LIGHTWEIGHT", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Lighter tag for cats and small pets.", "Lightweight", true, 1, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_TagVariantPresetId",
                table: "TagProductVariants",
                column: "TagVariantPresetId");

            migrationBuilder.CreateIndex(
                name: "IX_TagVariantPresets_Code",
                table: "TagVariantPresets",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagVariantPresets_DisplayName",
                table: "TagVariantPresets",
                column: "DisplayName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagVariantPresets_IsActive_SortOrder",
                table: "TagVariantPresets",
                columns: new[] { "IsActive", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_TagProductVariants_TagVariantPresets_TagVariantPresetId",
                table: "TagProductVariants",
                column: "TagVariantPresetId",
                principalTable: "TagVariantPresets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Deterministic backfill: only the two values that were previously
            // hard-coded are mapped to their migrated presets. Any other stored
            // value (none should exist) is left unmapped rather than guessed;
            // the SKU keeps its TagVariant display snapshot either way.
            migrationBuilder.Sql(
                "UPDATE [TagProductVariants] SET [TagVariantPresetId] = '3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c01' " +
                "WHERE [TagVariantPresetId] IS NULL AND UPPER(LTRIM(RTRIM([TagVariant]))) = 'STANDARD';");
            migrationBuilder.Sql(
                "UPDATE [TagProductVariants] SET [TagVariantPresetId] = '3f2c8f5e-08d4-4c5f-9a51-b96f8a4f7c02' " +
                "WHERE [TagVariantPresetId] IS NULL AND UPPER(LTRIM(RTRIM([TagVariant]))) = 'LIGHTWEIGHT';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TagProductVariants_TagVariantPresets_TagVariantPresetId",
                table: "TagProductVariants");

            migrationBuilder.DropTable(
                name: "TagVariantPresets");

            migrationBuilder.DropIndex(
                name: "IX_TagProductVariants_TagVariantPresetId",
                table: "TagProductVariants");

            migrationBuilder.DropColumn(
                name: "TagVariantPresetId",
                table: "TagProductVariants");
        }
    }
}
