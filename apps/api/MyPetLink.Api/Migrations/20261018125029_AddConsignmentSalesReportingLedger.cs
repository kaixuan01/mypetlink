using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentSalesReportingLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference",
                table: "ConsignmentReviewEvents");

            migrationBuilder.AddColumn<Guid>(
                name: "SubjectId",
                table: "ConsignmentReviewEvents",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubjectType",
                table: "ConsignmentReviewEvents",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Attribution",
                table: "ConsignmentHandoverRecords",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentPriceTerms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    UnitNetPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ValidFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ValidToExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ApprovalEvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApprovedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentPriceTerms", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentPriceTerm_Promotion", "[Kind] = 'Standard' OR [ValidToExclusive] IS NOT NULL");
                    table.CheckConstraint("CK_ConsignmentPriceTerm_Values", "[UnitNetPrice] > 0 AND ([ValidToExclusive] IS NULL OR [ValidToExclusive] > [ValidFrom])");
                    table.ForeignKey(
                        name: "FK_ConsignmentPriceTerms_AdminUsers_ApprovedByAdminUserId",
                        column: x => x.ApprovedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentPriceTerms_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentPriceTerms_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentPriceTerms_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSalesReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantBranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PeriodEndExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PartnerReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    SupersedesReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReportReceivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EvidenceLevel = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    EvidenceKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    EvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    VerifiedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    VerifiedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DisputedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DisputedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DisputeReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReviewMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSalesReports", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSalesReport_Period", "[PeriodEndExclusive] > [PeriodStart] AND [Version] >= 1");
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_AdminUsers_DisputedByAdminUserId",
                        column: x => x.DisputedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_AdminUsers_VerifiedByAdminUserId",
                        column: x => x.VerifiedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_ConsignmentSalesReports_SupersedesReportId",
                        column: x => x.SupersedesReportId,
                        principalTable: "ConsignmentSalesReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_MerchantBranches_MerchantBranchId",
                        column: x => x.MerchantBranchId,
                        principalTable: "MerchantBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReports_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentStockLedgerEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantBranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    FromBucket = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ToBucket = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    EntryType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SourceLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReversesEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EffectiveAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PostedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IsPriorPeriodCorrection = table.Column<bool>(type: "bit", nullable: false),
                    ActorAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentStockLedgerEntries", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentLedger_Quantity", "[Quantity] > 0 AND [FromBucket] <> [ToBucket]");
                    table.ForeignKey(
                        name: "FK_ConsignmentStockLedgerEntries_AdminUsers_ActorAdminUserId",
                        column: x => x.ActorAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockLedgerEntries_ConsignmentStockLedgerEntries_ReversesEntryId",
                        column: x => x.ReversesEntryId,
                        principalTable: "ConsignmentStockLedgerEntries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockLedgerEntries_MerchantBranches_MerchantBranchId",
                        column: x => x.MerchantBranchId,
                        principalTable: "MerchantBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockLedgerEntries_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockLedgerEntries_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSalesReportLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    LineType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PriceTermId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UnitListPriceSnapshot = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    UnitNetPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    RefundOfPeriodStart = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RestockableQuantity = table.Column<int>(type: "int", nullable: false),
                    UnsellableReturnedQuantity = table.Column<int>(type: "int", nullable: false),
                    ExplainsDiscrepancyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QuantityExplainingDiscrepancy = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSalesReportLines", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSalesLine_Quantities", "[Quantity] > 0 AND [UnitNetPrice] >= 0 AND [RestockableQuantity] >= 0 AND [UnsellableReturnedQuantity] >= 0 AND [RestockableQuantity] + [UnsellableReturnedQuantity] <= [Quantity] AND [QuantityExplainingDiscrepancy] >= 0 AND [QuantityExplainingDiscrepancy] <= [Quantity]");
                    table.CheckConstraint("CK_ConsignmentSalesLine_Type", "([LineType] = 'Sale' AND [RestockableQuantity] = 0 AND [UnsellableReturnedQuantity] = 0 AND [RefundOfPeriodStart] IS NULL) OR ([LineType] = 'Refund' AND [RefundOfPeriodStart] IS NOT NULL AND [QuantityExplainingDiscrepancy] = 0)");
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReportLines_ConsignmentPriceTerms_PriceTermId",
                        column: x => x.PriceTermId,
                        principalTable: "ConsignmentPriceTerms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReportLines_ConsignmentSalesReports_SalesReportId",
                        column: x => x.SalesReportId,
                        principalTable: "ConsignmentSalesReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSalesReportLines_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_DispatchId_Action",
                table: "ConsignmentReviewEvents",
                columns: new[] { "DispatchId", "Action" })
                .Annotation("SqlServer:Include", new[] { "RequestReference" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_SubjectType_SubjectId",
                table: "ConsignmentReviewEvents",
                columns: new[] { "SubjectType", "SubjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPriceTerms_ApprovedByAdminUserId",
                table: "ConsignmentPriceTerms",
                column: "ApprovedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPriceTerms_CreatedByAdminUserId",
                table: "ConsignmentPriceTerms",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPriceTerms_Lookup",
                table: "ConsignmentPriceTerms",
                columns: new[] { "AgreementId", "ProductVariantId", "Kind", "ValidFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPriceTerms_ProductVariantId",
                table: "ConsignmentPriceTerms",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReportLines_PriceTermId",
                table: "ConsignmentSalesReportLines",
                column: "PriceTermId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReportLines_ProductVariantId",
                table: "ConsignmentSalesReportLines",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReportLines_Line",
                table: "ConsignmentSalesReportLines",
                columns: new[] { "SalesReportId", "LineType", "ProductVariantId", "PriceTermId" },
                unique: true,
                filter: "[PriceTermId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_AgreementId",
                table: "ConsignmentSalesReports",
                column: "AgreementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_CreatedByAdminUserId",
                table: "ConsignmentSalesReports",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_DisputedByAdminUserId",
                table: "ConsignmentSalesReports",
                column: "DisputedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_RecordedByAdminUserId",
                table: "ConsignmentSalesReports",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_Status",
                table: "ConsignmentSalesReports",
                columns: new[] { "MerchantBranchId", "Status", "PeriodStart" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReports_VerifiedByAdminUserId",
                table: "ConsignmentSalesReports",
                column: "VerifiedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReports_Idempotency",
                table: "ConsignmentSalesReports",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReports_Period",
                table: "ConsignmentSalesReports",
                columns: new[] { "MerchantBranchId", "PeriodStart", "Version" },
                unique: true,
                filter: "[Status] <> 'Voided'");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReports_Reference",
                table: "ConsignmentSalesReports",
                columns: new[] { "MerchantId", "PartnerReference", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentSalesReports_Supersedes",
                table: "ConsignmentSalesReports",
                column: "SupersedesReportId",
                unique: true,
                filter: "[SupersedesReportId] IS NOT NULL AND [Status] <> 'Voided'");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentLedger_Merchant",
                table: "ConsignmentStockLedgerEntries",
                columns: new[] { "MerchantId", "EffectiveAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentLedger_Position",
                table: "ConsignmentStockLedgerEntries",
                columns: new[] { "MerchantBranchId", "ProductVariantId", "EffectiveAt" })
                .Annotation("SqlServer:Include", new[] { "FromBucket", "ToBucket", "Quantity" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStockLedgerEntries_ActorAdminUserId",
                table: "ConsignmentStockLedgerEntries",
                column: "ActorAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStockLedgerEntries_ProductVariantId",
                table: "ConsignmentStockLedgerEntries",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentLedger_Reverses",
                table: "ConsignmentStockLedgerEntries",
                column: "ReversesEntryId",
                unique: true,
                filter: "[ReversesEntryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentLedger_Source",
                table: "ConsignmentStockLedgerEntries",
                columns: new[] { "SourceType", "SourceLineId", "EntryType" },
                unique: true,
                filter: "[ReversesEntryId] IS NULL");
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentStockLedgerEntries_AppendOnly ON ConsignmentStockLedgerEntries
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51043, ''The consignment stock ledger is append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentStockLedgerEntries WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentSalesReports WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentPriceTerms WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentReviewEvents WITH(TABLOCKX,HOLDLOCK) WHERE SubjectType IS NOT NULL)
                  OR EXISTS(SELECT 1 FROM ConsignmentHandoverRecords WITH(TABLOCKX,HOLDLOCK) WHERE Attribution IS NOT NULL)
                    THROW 51044, 'Consignment rollback blocked: retain sales reports, selling prices and stock ledger history.', 1;
                """);
            migrationBuilder.DropTable(
                name: "ConsignmentSalesReportLines");

            migrationBuilder.DropTable(
                name: "ConsignmentStockLedgerEntries");

            migrationBuilder.DropTable(
                name: "ConsignmentPriceTerms");

            migrationBuilder.DropTable(
                name: "ConsignmentSalesReports");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentReviewEvents_DispatchId_Action",
                table: "ConsignmentReviewEvents");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentReviewEvents_SubjectType_SubjectId",
                table: "ConsignmentReviewEvents");

            migrationBuilder.DropColumn(
                name: "SubjectId",
                table: "ConsignmentReviewEvents");

            migrationBuilder.DropColumn(
                name: "SubjectType",
                table: "ConsignmentReviewEvents");

            migrationBuilder.DropColumn(
                name: "Attribution",
                table: "ConsignmentHandoverRecords");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference",
                table: "ConsignmentReviewEvents",
                columns: new[] { "DispatchId", "Action", "RequestReference" });
        }
    }
}
