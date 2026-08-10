using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailOutboxMerchantDeliveryOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.AddColumn<Guid>(
                name: "RelatedMerchantDeliveryOrderId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedMerchantDeliveryOrderId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedMerchantDeliveryOrderId", "MessageType" },
                unique: true,
                filter: "[RelatedMerchantDeliveryOrderId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END) = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_EmailOutbox_MerchantDeliveryOrders_RelatedMerchantDeliveryOrderId",
                table: "EmailOutbox",
                column: "RelatedMerchantDeliveryOrderId",
                principalTable: "MerchantDeliveryOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EmailOutbox_MerchantDeliveryOrders_RelatedMerchantDeliveryOrderId",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedMerchantDeliveryOrderId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "RelatedMerchantDeliveryOrderId",
                table: "EmailOutbox");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END) = 1");
        }
    }
}
