using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessReferenceNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReceiptNumber",
                table: "TagOrders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            // Preserve the exact receipt reference customers could already see
            // before receipt numbers became first-class persisted data.
            migrationBuilder.Sql(
                """
                UPDATE [TagOrders]
                SET [ReceiptNumber] =
                    CASE
                        WHEN CHARINDEX(N'-ORD-', UPPER([OrderNumber])) > 0
                            THEN STUFF(
                                [OrderNumber],
                                CHARINDEX(N'-ORD-', UPPER([OrderNumber])),
                                5,
                                N'-RCP-')
                        ELSE N'MPL-RCP-' + [OrderNumber]
                    END
                WHERE [PaymentConfirmedAt] IS NOT NULL
                  AND [ReceiptNumber] IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_ReceiptNumber",
                table: "TagOrders",
                column: "ReceiptNumber",
                unique: true,
                filter: "[ReceiptNumber] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_ReceiptNumber",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ReceiptNumber",
                table: "TagOrders");
        }
    }
}
