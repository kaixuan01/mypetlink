using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMultiItemTagOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PetId",
                table: "TagOrderItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PetNameSnapshot",
                table: "TagOrderItems",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitWeightGramsSnapshot",
                table: "TagOrderItems",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrderItemId",
                table: "SmartTags",
                type: "uniqueidentifier",
                nullable: true);

            // Preserve the pet, fulfilment link, and shipment-weight facts for
            // every historical single-item order before the new relationships
            // are used by multi-item fulfilment.
            migrationBuilder.Sql(
                """
                UPDATE item
                SET item.PetId = orders.PetId,
                    item.PetNameSnapshot = pets.Name,
                    item.UnitWeightGramsSnapshot = variants.WeightGrams
                FROM TagOrderItems AS item
                INNER JOIN TagOrders AS orders ON orders.Id = item.OrderId
                INNER JOIN Pets AS pets ON pets.Id = orders.PetId
                LEFT JOIN TagProductVariants AS variants ON variants.Id = item.ProductVariantId
                WHERE item.PetId IS NULL;

                UPDATE tags
                SET tags.OrderItemId = matched.Id
                FROM SmartTags AS tags
                CROSS APPLY
                (
                    SELECT TOP (1) item.Id
                    FROM TagOrderItems AS item
                    WHERE item.OrderId = tags.OrderId
                    ORDER BY item.CreatedAt, item.Id
                ) AS matched
                WHERE tags.OrderId IS NOT NULL
                  AND tags.OrderItemId IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItems_PetId",
                table: "TagOrderItems",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_OrderItemId",
                table: "SmartTags",
                column: "OrderItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTags_TagOrderItems_OrderItemId",
                table: "SmartTags",
                column: "OrderItemId",
                principalTable: "TagOrderItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_TagOrderItems_Pets_PetId",
                table: "TagOrderItems",
                column: "PetId",
                principalTable: "Pets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_TagOrderItems_OrderItemId",
                table: "SmartTags");

            migrationBuilder.DropForeignKey(
                name: "FK_TagOrderItems_Pets_PetId",
                table: "TagOrderItems");

            migrationBuilder.DropIndex(
                name: "IX_TagOrderItems_PetId",
                table: "TagOrderItems");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_OrderItemId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "PetId",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "PetNameSnapshot",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "UnitWeightGramsSnapshot",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "OrderItemId",
                table: "SmartTags");
        }
    }
}
