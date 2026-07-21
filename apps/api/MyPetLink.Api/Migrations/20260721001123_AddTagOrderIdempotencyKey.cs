using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTagOrderIdempotencyKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "TagOrders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequestFingerprint",
                table: "TagOrders",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_OwnerUserId_IdempotencyKey",
                table: "TagOrders",
                columns: new[] { "OwnerUserId", "IdempotencyKey" },
                unique: true,
                filter: "[IdempotencyKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_OwnerUserId_IdempotencyKey",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "RequestFingerprint",
                table: "TagOrders");
        }
    }
}
