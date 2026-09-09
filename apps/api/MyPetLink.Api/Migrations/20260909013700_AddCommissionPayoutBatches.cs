using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommissionPayoutBatches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CommissionPayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PayoutNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Seller_BrandName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_LegalBusinessName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Seller_BusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Seller_TaxIdentificationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_SstRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Seller_AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    Seller_Postcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Seller_City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_State = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_Country = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Seller_SupportEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    Seller_BusinessPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Seller_BusinessWebsite = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_PaymentInstructions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Seller_BankAccountName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_BankName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Seller_BankAccountNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_DuitNowDisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    PeriodFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PeriodToExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    PreparedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PreparedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PreparedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaidAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PaidByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaymentMethod = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    PaymentReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    RequestFingerprint = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommissionPayouts", x => x.Id);
                    table.CheckConstraint("CK_CommissionPayouts_Amount", "[PreparedAmount] >= 0");
                    table.CheckConstraint("CK_CommissionPayouts_Currency", "[Currency] = 'MYR'");
                    table.CheckConstraint("CK_CommissionPayouts_Period", "[PeriodToExclusive] > [PeriodFrom]");
                    table.CheckConstraint("CK_CommissionPayouts_StatusShape", "([Status] = 'Prepared' AND [PaidAt] IS NULL AND [PaidByAdminUserId] IS NULL AND [PaymentMethod] IS NULL AND [PaymentReference] IS NULL AND [CancelledAt] IS NULL AND [CancelledByAdminUserId] IS NULL AND [CancellationReason] IS NULL) OR ([Status] = 'Paid' AND [PaidAt] IS NOT NULL AND [PaidByAdminUserId] IS NOT NULL AND [PaymentMethod] IN ('BankTransfer','DuitNow','Cheque','Cash','Other') AND [PaymentReference] IS NOT NULL AND [CancelledAt] IS NULL AND [CancelledByAdminUserId] IS NULL AND [CancellationReason] IS NULL) OR ([Status] = 'Cancelled' AND [PaidAt] IS NULL AND [PaidByAdminUserId] IS NULL AND [PaymentMethod] IS NULL AND [PaymentReference] IS NULL AND [CancelledAt] IS NOT NULL AND [CancelledByAdminUserId] IS NOT NULL AND [CancellationReason] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_CommissionPayouts_AdminUsers_CancelledByAdminUserId",
                        column: x => x.CancelledByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionPayouts_AdminUsers_PaidByAdminUserId",
                        column: x => x.PaidByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionPayouts_AdminUsers_PreparedByAdminUserId",
                        column: x => x.PreparedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionPayouts_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CommissionPayoutItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommissionPayoutId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesCommissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceTypeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CommissionTypeSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantOrderIdSnapshot = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagOrderIdSnapshot = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceOrderNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CommissionBaseAmountSnapshot = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionAmountSnapshot = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionPercentageSnapshot = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    CommissionFixedAmountSnapshot = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    CurrencySnapshot = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    CalculatedAtSnapshot = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReleasedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReleaseReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommissionPayoutItems", x => x.Id);
                    table.CheckConstraint("CK_CommissionPayoutItems_Amounts", "[CommissionBaseAmountSnapshot] >= 0 AND [CommissionAmountSnapshot] >= 0");
                    table.CheckConstraint("CK_CommissionPayoutItems_Currency", "[CurrencySnapshot] = 'MYR'");
                    table.CheckConstraint("CK_CommissionPayoutItems_ReleaseShape", "([ReleasedAt] IS NULL AND [ReleasedByAdminUserId] IS NULL AND [ReleaseReason] IS NULL) OR ([ReleasedAt] IS NOT NULL AND [ReleasedByAdminUserId] IS NOT NULL AND [ReleaseReason] IS NOT NULL)");
                    table.CheckConstraint("CK_CommissionPayoutItems_SourceCommissionType", "([CommissionTypeSnapshot] = 'MerchantOrderPercentage' AND [SourceTypeSnapshot] = 'MerchantOrder') OR ([CommissionTypeSnapshot] = 'DirectRetailPercentage' AND [SourceTypeSnapshot] = 'TagOrder') OR ([CommissionTypeSnapshot] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceTypeSnapshot] = 'MerchantOrder')");
                    table.CheckConstraint("CK_CommissionPayoutItems_SourceShape", "([SourceTypeSnapshot] = 'MerchantOrder' AND [MerchantOrderIdSnapshot] IS NOT NULL AND [TagOrderIdSnapshot] IS NULL) OR ([SourceTypeSnapshot] = 'TagOrder' AND [TagOrderIdSnapshot] IS NOT NULL AND [MerchantOrderIdSnapshot] IS NULL)");
                    table.CheckConstraint("CK_CommissionPayoutItems_ValueShape", "([CommissionPercentageSnapshot] BETWEEN 0 AND 100 AND [CommissionFixedAmountSnapshot] IS NULL) OR ([CommissionPercentageSnapshot] IS NULL AND [CommissionFixedAmountSnapshot] >= 0)");
                    table.ForeignKey(
                        name: "FK_CommissionPayoutItems_AdminUsers_ReleasedByAdminUserId",
                        column: x => x.ReleasedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionPayoutItems_CommissionPayouts_CommissionPayoutId",
                        column: x => x.CommissionPayoutId,
                        principalTable: "CommissionPayouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionPayoutItems_SalesCommissions_SalesCommissionId",
                        column: x => x.SalesCommissionId,
                        principalTable: "SalesCommissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayoutItems_CommissionPayoutId_SalesCommissionId",
                table: "CommissionPayoutItems",
                columns: new[] { "CommissionPayoutId", "SalesCommissionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayoutItems_ReleasedByAdminUserId",
                table: "CommissionPayoutItems",
                column: "ReleasedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayoutItems_SalesCommissionId",
                table: "CommissionPayoutItems",
                column: "SalesCommissionId",
                unique: true,
                filter: "[ReleasedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_CancelledByAdminUserId",
                table: "CommissionPayouts",
                column: "CancelledByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_IdempotencyKey",
                table: "CommissionPayouts",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_PaidByAdminUserId",
                table: "CommissionPayouts",
                column: "PaidByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_PayoutNumber",
                table: "CommissionPayouts",
                column: "PayoutNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_PeriodFrom_PeriodToExclusive",
                table: "CommissionPayouts",
                columns: new[] { "PeriodFrom", "PeriodToExclusive" });

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_PreparedByAdminUserId",
                table: "CommissionPayouts",
                column: "PreparedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionPayouts_SalespersonId_Status_PreparedAt",
                table: "CommissionPayouts",
                columns: new[] { "SalespersonId", "Status", "PreparedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommissionPayoutItems");

            migrationBuilder.DropTable(
                name: "CommissionPayouts");
        }
    }
}
