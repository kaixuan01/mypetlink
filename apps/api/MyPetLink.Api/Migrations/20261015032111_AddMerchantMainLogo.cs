using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantMainLogo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "LogoMediaFileId",
                table: "Merchants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_LogoMediaFileId",
                table: "Merchants",
                column: "LogoMediaFileId");

            migrationBuilder.AddForeignKey(
                name: "FK_Merchants_MediaFiles_LogoMediaFileId",
                table: "Merchants",
                column: "LogoMediaFileId",
                principalTable: "MediaFiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Merchants_MediaFiles_LogoMediaFileId",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_LogoMediaFileId",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "LogoMediaFileId",
                table: "Merchants");
        }
    }
}
