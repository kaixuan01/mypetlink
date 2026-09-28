using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMomentCreateIdempotencyKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreateIdempotencyKey",
                table: "PetMemories",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_AuthorUserId_CreateIdempotencyKey",
                table: "PetMemories",
                columns: new[] { "AuthorUserId", "CreateIdempotencyKey" },
                unique: true,
                filter: "[CreateIdempotencyKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PetMemories_AuthorUserId_CreateIdempotencyKey",
                table: "PetMemories");

            migrationBuilder.DropColumn(
                name: "CreateIdempotencyKey",
                table: "PetMemories");
        }
    }
}
