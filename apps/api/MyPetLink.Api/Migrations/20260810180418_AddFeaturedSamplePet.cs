using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFeaturedSamplePet : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsSampleEligible",
                table: "Pets",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "Pets",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SampleEligibilityUpdatedAt",
                table: "Pets",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SampleEligibilityUpdatedByAdminUserId",
                table: "Pets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PublicSiteSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FeaturedSamplePetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PublicSiteSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PublicSiteSettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PublicSiteSettings_Pets_FeaturedSamplePetId",
                        column: x => x.FeaturedSamplePetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "PublicSiteSettings",
                columns: new[] { "Id", "CreatedAt", "FeaturedSamplePetId", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[] { new Guid("e7b2fc49-e065-4c4a-ae65-d2678a2fa7c4"), new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });

            migrationBuilder.CreateIndex(
                name: "IX_Pets_IsSampleEligible",
                table: "Pets",
                column: "IsSampleEligible");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_SampleEligibilityUpdatedByAdminUserId",
                table: "Pets",
                column: "SampleEligibilityUpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PublicSiteSettings_FeaturedSamplePetId",
                table: "PublicSiteSettings",
                column: "FeaturedSamplePetId",
                unique: true,
                filter: "[FeaturedSamplePetId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PublicSiteSettings_UpdatedByAdminUserId",
                table: "PublicSiteSettings",
                column: "UpdatedByAdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Pets_AdminUsers_SampleEligibilityUpdatedByAdminUserId",
                table: "Pets",
                column: "SampleEligibilityUpdatedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Pets_AdminUsers_SampleEligibilityUpdatedByAdminUserId",
                table: "Pets");

            migrationBuilder.DropTable(
                name: "PublicSiteSettings");

            migrationBuilder.DropIndex(
                name: "IX_Pets_IsSampleEligible",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_Pets_SampleEligibilityUpdatedByAdminUserId",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "IsSampleEligible",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "SampleEligibilityUpdatedAt",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "SampleEligibilityUpdatedByAdminUserId",
                table: "Pets");
        }
    }
}
