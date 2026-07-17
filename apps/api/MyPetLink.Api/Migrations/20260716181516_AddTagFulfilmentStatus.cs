using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTagFulfilmentStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FulfilmentStatus",
                table: "SmartTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Generated");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PrintedAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReceivedAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SentToOwnerAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SentToResellerAt",
                table: "SmartTags",
                type: "datetimeoffset",
                nullable: true);

            // Map existing records onto the new fulfilment axis without touching
            // their lifecycle status:
            // 1. Tags on an order that already shipped (or that were delivered /
            //    activated through an order) were physically sent to the owner.
            migrationBuilder.Sql(
                """
                UPDATE t
                SET t.FulfilmentStatus = N'SentToOwner',
                    t.SentToOwnerAt = COALESCE(o.ShippedAt, t.DeliveredAt, t.ActivatedAt)
                FROM [SmartTags] t
                INNER JOIN [TagOrders] o ON o.Id = t.OrderId
                WHERE o.ShippedAt IS NOT NULL
                   OR o.DeliveredAt IS NOT NULL
                   OR t.DeliveredAt IS NOT NULL
                   OR t.ActivatedAt IS NOT NULL;
                """);

            // 2. Retail tags activated without an order reached a customer
            //    through the retail chain.
            migrationBuilder.Sql(
                """
                UPDATE [SmartTags]
                SET FulfilmentStatus = N'Received',
                    ReceivedAt = ActivatedAt
                WHERE OrderId IS NULL
                  AND ActivatedAt IS NOT NULL;
                """);

            // 3. Remaining stock inherits the print/reseller progress recorded on
            //    its batch (the previous, batch-level tracking).
            migrationBuilder.Sql(
                """
                UPDATE t
                SET t.FulfilmentStatus = N'SentToReseller',
                    t.SentToResellerAt = b.SentToResellerAt,
                    t.PrintedAt = b.PrintedAt
                FROM [SmartTags] t
                INNER JOIN [SmartTagBatches] b ON b.Id = t.BatchId
                WHERE t.FulfilmentStatus = N'Generated'
                  AND b.SentToResellerAt IS NOT NULL;
                """);

            migrationBuilder.Sql(
                """
                UPDATE t
                SET t.FulfilmentStatus = N'Printed',
                    t.PrintedAt = b.PrintedAt
                FROM [SmartTags] t
                INNER JOIN [SmartTagBatches] b ON b.Id = t.BatchId
                WHERE t.FulfilmentStatus = N'Generated'
                  AND b.PrintedAt IS NOT NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_CreatedAt",
                table: "SmartTags",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_FulfilmentStatus",
                table: "SmartTags",
                column: "FulfilmentStatus");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_FulfilmentStatus_CreatedAt",
                table: "SmartTags",
                columns: new[] { "FulfilmentStatus", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SmartTags_CreatedAt",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_FulfilmentStatus",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_FulfilmentStatus_CreatedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "FulfilmentStatus",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "PrintedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "ReceivedAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "SentToOwnerAt",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "SentToResellerAt",
                table: "SmartTags");
        }
    }
}
