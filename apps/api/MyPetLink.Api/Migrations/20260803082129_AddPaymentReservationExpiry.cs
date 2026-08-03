using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentReservationExpiry : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PaymentReservationExpiredAt",
                table: "TagOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PaymentReservationExpiresAt",
                table: "TagOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "OrderCheckoutSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentReservationMinutes = table.Column<int>(type: "int", nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderCheckoutSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderCheckoutSettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "OrderCheckoutSettings",
                columns: new[] { "Id", "CreatedAt", "PaymentReservationMinutes", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[] { new Guid("4a2f6d18-9c31-4b7e-8f52-6d0a1b3c5e70"), new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), 120, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });

            migrationBuilder.CreateIndex(
                name: "IX_OrderCheckoutSettings_UpdatedByAdminUserId",
                table: "OrderCheckoutSettings",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_Status_PaymentReservationExpiresAt",
                table: "TagOrders",
                columns: new[] { "Status", "PaymentReservationExpiresAt" },
                filter: "[PaymentReservationExpiresAt] IS NOT NULL");

            // Deployment grace period. Orders placed before this release never
            // agreed to a payment window, so every still-unpaid one is given a
            // full window measured from deployment rather than from its own
            // creation time. Without this a long-standing Pending Payment order
            // would be cancelled by the first sweep after deployment.
            //
            // Orders that already carry a proof awaiting or holding a decision
            // are deliberately left with a null deadline: the expiry query
            // ignores them, and a rejection later stamps a fresh window.
            migrationBuilder.Sql(
                """
                UPDATE orders
                SET orders.PaymentReservationExpiresAt = DATEADD(
                    minute,
                    (SELECT TOP (1) settings.PaymentReservationMinutes
                     FROM OrderCheckoutSettings AS settings),
                    SYSDATETIMEOFFSET())
                FROM TagOrders AS orders
                WHERE orders.Status = 'PendingPayment'
                  AND orders.CancelledAt IS NULL
                  AND orders.PaymentConfirmedAt IS NULL
                  AND orders.PaymentReservationExpiresAt IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM PaymentProofs AS proofs
                      WHERE proofs.OrderId = orders.Id
                        AND proofs.Status IN ('PendingReview', 'Approved')
                  );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TagOrders_Status_PaymentReservationExpiresAt",
                table: "TagOrders");

            migrationBuilder.DropTable(
                name: "OrderCheckoutSettings");

            migrationBuilder.DropColumn(
                name: "PaymentReservationExpiredAt",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "PaymentReservationExpiresAt",
                table: "TagOrders");
        }
    }
}
