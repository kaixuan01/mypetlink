using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminOrderQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_DeliveredAt",
                table: "TagOrders",
                column: "DeliveredAt");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_PaymentConfirmedAt",
                table: "TagOrders",
                column: "PaymentConfirmedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_ShippedAt",
                table: "TagOrders",
                column: "ShippedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_UpdatedAt",
                table: "TagOrders",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_DeliveredAt",
                table: "TagOrders");

            migrationBuilder.DropIndex(
                name: "IX_TagOrders_PaymentConfirmedAt",
                table: "TagOrders");

            migrationBuilder.DropIndex(
                name: "IX_TagOrders_ShippedAt",
                table: "TagOrders");

            migrationBuilder.DropIndex(
                name: "IX_TagOrders_UpdatedAt",
                table: "TagOrders");
        }
    }
}
