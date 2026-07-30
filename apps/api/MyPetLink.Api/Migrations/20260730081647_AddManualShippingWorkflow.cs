using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddManualShippingWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ActualCourierCost",
                table: "TagOrders",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CourierProvider",
                table: "TagOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CourierService",
                table: "TagOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadyToShipAt",
                table: "TagOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShippingNotes",
                table: "TagOrders",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_ReadyToShipAt",
                table: "TagOrders",
                column: "ReadyToShipAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_ReadyToShipAt",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ActualCourierCost",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "CourierProvider",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "CourierService",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ReadyToShipAt",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ShippingNotes",
                table: "TagOrders");
        }
    }
}
