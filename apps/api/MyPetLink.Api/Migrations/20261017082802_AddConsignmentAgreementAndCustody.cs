using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentAgreementAndCustody : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsignmentAgreements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    SupersedesAgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PartnerCommissionPercentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    EffectiveFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EffectiveTo = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DurationTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SettlementFrequency = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PaymentDeadlineDays = table.Column<int>(type: "int", nullable: true),
                    DiscountTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ReturnTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    LossTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SignedAgreementReference = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ExternalTrackerReference = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentAgreements", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentAgreement_Dates", "[EffectiveTo] IS NULL OR [EffectiveTo] > [EffectiveFrom]");
                    table.CheckConstraint("CK_ConsignmentAgreement_Deadline", "[PaymentDeadlineDays] IS NULL OR [PaymentDeadlineDays] BETWEEN 0 AND 365");
                    table.CheckConstraint("CK_ConsignmentAgreement_Rate", "[PartnerCommissionPercentage] BETWEEN 0 AND 100");
                    table.CheckConstraint("CK_ConsignmentAgreement_Status", "[Status] IN ('Draft','Active','Closed') AND [Version] > 0");
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreements_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreements_ConsignmentAgreements_SupersedesAgreementId",
                        column: x => x.SupersedesAgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreements_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentDispatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DispatchNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    RequestFingerprint = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    MerchantNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AgreementReferenceSnapshot = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AgreementVersionSnapshot = table.Column<int>(type: "int", nullable: false),
                    CommissionPercentageSnapshot = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    DestinationSnapshot = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    ExternalTrackerReference = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
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
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    DispatchedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ShipmentReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReceiptAcknowledgment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDispatches", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentDispatch_Rate", "[CommissionPercentageSnapshot] BETWEEN 0 AND 100 AND [AgreementVersionSnapshot] > 0");
                    table.CheckConstraint("CK_ConsignmentDispatch_Status", "[Status] IN ('Reserved','Dispatched','Received','Cancelled')");
                    table.ForeignKey(
                        name: "FK_ConsignmentDispatches_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDispatches_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentUnits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DispatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    VariantSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    BatchNumberSnapshot = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReturnedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReturnQaVersion = table.Column<int>(type: "int", nullable: true),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ExternalReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentUnits", x => x.Id);
                    table.UniqueConstraint("AK_ConsignmentUnits_Id_DispatchId", x => new { x.Id, x.DispatchId });
                    table.CheckConstraint("CK_ConsignmentUnit_Release", "([Status] = 'Released' AND [ReleasedAt] IS NOT NULL) OR ([Status] IN ('Reserved','Dispatched','Received','ReturnedQuarantine','ExternalHandover') AND [ReleasedAt] IS NULL)");
                    table.ForeignKey(
                        name: "FK_ConsignmentUnits_ConsignmentDispatches_DispatchId",
                        column: x => x.DispatchId,
                        principalTable: "ConsignmentDispatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentUnits_SmartTags_SmartTagId",
                        column: x => x.SmartTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentUnits_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentMovements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DispatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ActorAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentMovements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsignmentMovements_AdminUsers_ActorAdminUserId",
                        column: x => x.ActorAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentMovements_ConsignmentDispatches_DispatchId",
                        column: x => x.DispatchId,
                        principalTable: "ConsignmentDispatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentMovements_ConsignmentUnits_UnitId_DispatchId",
                        columns: x => new { x.UnitId, x.DispatchId },
                        principalTable: "ConsignmentUnits",
                        principalColumns: new[] { "Id", "DispatchId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_MerchantId_Reference",
                table: "ConsignmentAgreements",
                columns: new[] { "MerchantId", "Reference" },
                unique: true,
                filter: "[Status] = 'Active'");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_MerchantId_Reference_Version",
                table: "ConsignmentAgreements",
                columns: new[] { "MerchantId", "Reference", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_MerchantId_Status_EffectiveFrom",
                table: "ConsignmentAgreements",
                columns: new[] { "MerchantId", "Status", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_SupersedesAgreementId",
                table: "ConsignmentAgreements",
                column: "SupersedesAgreementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_UpdatedByAdminUserId",
                table: "ConsignmentAgreements",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_AgreementId_Status_CreatedAt",
                table: "ConsignmentDispatches",
                columns: new[] { "AgreementId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_DispatchNumber",
                table: "ConsignmentDispatches",
                column: "DispatchNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_IdempotencyKey",
                table: "ConsignmentDispatches",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDispatches_UpdatedByAdminUserId",
                table: "ConsignmentDispatches",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentMovements_ActorAdminUserId",
                table: "ConsignmentMovements",
                column: "ActorAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentMovements_DispatchId_OccurredAt",
                table: "ConsignmentMovements",
                columns: new[] { "DispatchId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentMovements_UnitId_DispatchId",
                table: "ConsignmentMovements",
                columns: new[] { "UnitId", "DispatchId" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentUnits_DispatchId_Status",
                table: "ConsignmentUnits",
                columns: new[] { "DispatchId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentUnits_ProductVariantId",
                table: "ConsignmentUnits",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentUnits_SmartTagId",
                table: "ConsignmentUnits",
                column: "SmartTagId",
                unique: true,
                filter: "[ReleasedAt] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM [ConsignmentAgreements] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentDispatches] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentUnits] WITH (TABLOCKX, HOLDLOCK))
                   OR EXISTS (SELECT 1 FROM [ConsignmentMovements] WITH (TABLOCKX, HOLDLOCK))
                    THROW 51040, 'Consignment history exists. Destructive rollback is blocked. Retain the schema and reconcile custody.', 1;
                """);
            migrationBuilder.DropTable(
                name: "ConsignmentMovements");

            migrationBuilder.DropTable(
                name: "ConsignmentUnits");

            migrationBuilder.DropTable(
                name: "ConsignmentDispatches");

            migrationBuilder.DropTable(
                name: "ConsignmentAgreements");
        }
    }
}
