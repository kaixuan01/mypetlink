using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSalesReportingIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_SalespersonId_PaymentConfirmedAt",
                table: "TagOrders",
                columns: new[] { "SalespersonId", "PaymentConfirmedAt" },
                filter: "[SalespersonId] IS NOT NULL AND [PaymentConfirmedAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_PaidAt",
                table: "SalesCommissions",
                column: "PaidAt",
                filter: "[PaidAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_ReversedAt",
                table: "SalesCommissions",
                column: "ReversedAt",
                filter: "[ReversedAt] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_SalespersonId_CalculatedAt",
                table: "SalesCommissions",
                columns: new[] { "SalespersonId", "CalculatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_AcquiredBySalespersonId_RepeatCommissionEligibleUntil",
                table: "Merchants",
                columns: new[] { "AcquiredBySalespersonId", "RepeatCommissionEligibleUntil" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantPayments_PaymentDate_MerchantOrderId",
                table: "MerchantPayments",
                columns: new[] { "PaymentDate", "MerchantOrderId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_SalespersonId_PaymentConfirmedAt",
                table: "TagOrders");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_PaidAt",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_ReversedAt",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_SalespersonId_CalculatedAt",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_AcquiredBySalespersonId_RepeatCommissionEligibleUntil",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_MerchantPayments_PaymentDate_MerchantOrderId",
                table: "MerchantPayments");
        }
    }
}
