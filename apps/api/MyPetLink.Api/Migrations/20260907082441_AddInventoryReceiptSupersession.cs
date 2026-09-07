using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryReceiptSupersession : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_InventoryReceipts_CorrectsReceiptId",
                table: "InventoryReceipts");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SupersededAt",
                table: "InventoryReceipts",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupersededByReceiptId",
                table: "InventoryReceipts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_CorrectsReceiptId",
                table: "InventoryReceipts",
                column: "CorrectsReceiptId",
                unique: true,
                filter: "[CorrectsReceiptId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_SupersededAt_TagProductVariantId",
                table: "InventoryReceipts",
                columns: new[] { "SupersededAt", "TagProductVariantId" });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_SupersededByReceiptId",
                table: "InventoryReceipts",
                column: "SupersededByReceiptId");

            migrationBuilder.AddForeignKey(
                name: "FK_InventoryReceipts_InventoryReceipts_SupersededByReceiptId",
                table: "InventoryReceipts",
                column: "SupersededByReceiptId",
                principalTable: "InventoryReceipts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InventoryReceipts_InventoryReceipts_SupersededByReceiptId",
                table: "InventoryReceipts");

            migrationBuilder.DropIndex(
                name: "IX_InventoryReceipts_CorrectsReceiptId",
                table: "InventoryReceipts");

            migrationBuilder.DropIndex(
                name: "IX_InventoryReceipts_SupersededAt_TagProductVariantId",
                table: "InventoryReceipts");

            migrationBuilder.DropIndex(
                name: "IX_InventoryReceipts_SupersededByReceiptId",
                table: "InventoryReceipts");

            migrationBuilder.DropColumn(
                name: "SupersededAt",
                table: "InventoryReceipts");

            migrationBuilder.DropColumn(
                name: "SupersededByReceiptId",
                table: "InventoryReceipts");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_CorrectsReceiptId",
                table: "InventoryReceipts",
                column: "CorrectsReceiptId");
        }
    }
}
