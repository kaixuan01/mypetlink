using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class HardenMerchantCommissionCorrectness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fail closed with a diagnostic message. Historical financial rows
            // require human review; a schema migration must never choose which
            // duplicate to reverse, delete or rewrite.
            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [SalesCommissions]
                    WHERE [Status] <> N'Reversed'
                    GROUP BY [MerchantOrderId]
                    HAVING COUNT_BIG(*) > 1
                )
                BEGIN
                    THROW 51020, 'Duplicate non-reversed commissions exist for a merchant order. Run the commission diagnostic and resolve the financial history before applying this migration.', 1;
                END;
                """);

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions");

            migrationBuilder.AddColumn<Guid>(
                name: "PaidByAdminUserId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReversalReason",
                table: "SalesCommissions",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReversedByAdminUserId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions",
                column: "MerchantOrderId",
                unique: true,
                filter: "[Status] <> 'Reversed'");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_PaidByAdminUserId",
                table: "SalesCommissions",
                column: "PaidByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_ReversedByAdminUserId",
                table: "SalesCommissions",
                column: "ReversedByAdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_AdminUsers_PaidByAdminUserId",
                table: "SalesCommissions",
                column: "PaidByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_AdminUsers_ReversedByAdminUserId",
                table: "SalesCommissions",
                column: "ReversedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_AdminUsers_PaidByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_AdminUsers_ReversedByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_PaidByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_ReversedByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "PaidByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "ReversalReason",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "ReversedByAdminUserId",
                table: "SalesCommissions");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions",
                column: "MerchantOrderId");
        }
    }
}
