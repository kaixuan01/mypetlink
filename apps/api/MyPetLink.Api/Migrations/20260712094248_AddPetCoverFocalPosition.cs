using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPetCoverFocalPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte>(
                name: "CoverPositionX",
                table: "Pets",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)50);

            migrationBuilder.AddColumn<byte>(
                name: "CoverPositionY",
                table: "Pets",
                type: "tinyint",
                nullable: false,
                defaultValue: (byte)50);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CoverPositionX",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "CoverPositionY",
                table: "Pets");
        }
    }
}
