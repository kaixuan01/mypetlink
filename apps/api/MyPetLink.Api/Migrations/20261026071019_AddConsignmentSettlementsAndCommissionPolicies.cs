using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentSettlementsAndCommissionPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceCommissionType",
                table: "CommissionPayoutItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceShape",
                table: "CommissionPayoutItems");

            migrationBuilder.AddColumn<Guid>(
                name: "ConsignmentSalesReportId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ConsignmentSettlementId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ConsignmentSettlementRevision",
                table: "SalesCommissions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MerchantBranchId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PayableAt",
                table: "SalesCommissions",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PolicyCode",
                table: "SalesCommissions",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QualifiedQuantity",
                table: "SalesCommissions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PolicyCode",
                table: "CommissionRules",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "TransferredOn",
                table: "CommissionPayouts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ConsignmentSettlementIdSnapshot",
                table: "CommissionPayoutItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MerchantServicingAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    EffectiveFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EffectiveToExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Source = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantServicingAssignments", x => x.Id);
                    table.CheckConstraint("CK_MerchantServicingAssignment_Range", "[EffectiveToExclusive] IS NULL OR [EffectiveToExclusive] >= [EffectiveFrom]");
                    table.CheckConstraint("CK_MerchantServicingAssignment_Source", "[Source] IS NOT NULL AND [Source] IN ('Rollout','MerchantEdit')");
                    table.ForeignKey(
                        name: "FK_MerchantServicingAssignments_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantServicingAssignments_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantServicingAssignments_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalespersonPolicyAssignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PolicyCode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EffectiveFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EffectiveToExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AgreementReference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EndReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalespersonPolicyAssignments", x => x.Id);
                    table.CheckConstraint("CK_SalespersonPolicyAssignment_Dates", "[AcceptedAt] IS NOT NULL AND [EffectiveFrom] IS NOT NULL AND [EffectiveFrom] >= [AcceptedAt] AND ([EffectiveToExclusive] IS NULL OR [EffectiveToExclusive] > [EffectiveFrom])");
                    table.CheckConstraint("CK_SalespersonPolicyAssignment_EndShape", "([EndedAt] IS NULL AND [EndedByAdminUserId] IS NULL AND [EndReason] IS NULL) OR ([EndedAt] IS NOT NULL AND [EndedByAdminUserId] IS NOT NULL AND [EndReason] IS NOT NULL AND [EffectiveToExclusive] IS NOT NULL)");
                    table.CheckConstraint("CK_SalespersonPolicyAssignment_Policy", "[PolicyCode] IS NOT NULL AND [PolicyCode] = 'v1.1'");
                    table.CheckConstraint("CK_SalespersonPolicyAssignment_Reference", "[AgreementReference] IS NOT NULL AND LEN([AgreementReference]) >= 3");
                    table.ForeignKey(
                        name: "FK_SalespersonPolicyAssignments_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalespersonPolicyAssignments_AdminUsers_EndedByAdminUserId",
                        column: x => x.EndedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalespersonPolicyAssignments_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSettlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SettlementNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantBranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodStart = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PeriodEndExclusive = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SalesReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesReportVersion = table.Column<int>(type: "int", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    AttributionStatus = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    AttributionIssue = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    AttributionSource = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    CommissionPolicyCode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: true),
                    PolicyAssignmentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AttributionResolvedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AttributionResolvedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AttributionResolutionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    StandardQuantity = table.Column<int>(type: "int", nullable: false),
                    StandardSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PromotionQuantity = table.Column<int>(type: "int", nullable: false),
                    PromotionSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    RefundQuantity = table.Column<int>(type: "int", nullable: false),
                    RefundAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    EligibleSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MerchantCommission = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ExpectedRemittance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ReceivedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SalesCommissionTarget = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionRecoveryRequired = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    SettledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSettlements", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSettlement_Attribution", "([AttributionStatus] = 'NeedsResolution' AND [AttributionIssue] IS NOT NULL AND [AttributionSource] IS NULL AND [SalespersonId] IS NULL AND [CommissionPolicyCode] IS NULL) OR ([AttributionStatus] = 'Resolved' AND [AttributionSource] IS NOT NULL AND [AttributionSource] IN ('ServicingAssignment','OperatorResolution') AND ([CommissionPolicyCode] IS NULL OR [SalespersonId] IS NOT NULL))");
                    table.CheckConstraint("CK_ConsignmentSettlement_Money", "[StandardSales] >= 0 AND [PromotionSales] >= 0 AND [RefundAmount] >= 0 AND [ReceivedAmount] >= 0 AND [SalesCommissionTarget] >= 0 AND [CommissionRecoveryRequired] >= 0 AND [EligibleSales] = [StandardSales] + [PromotionSales] - [RefundAmount] AND [ExpectedRemittance] = [EligibleSales] - [MerchantCommission]");
                    table.CheckConstraint("CK_ConsignmentSettlement_Period", "[PeriodEndExclusive] > [PeriodStart]");
                    table.CheckConstraint("CK_ConsignmentSettlement_Quantities", "[StandardQuantity] >= 0 AND [PromotionQuantity] >= 0 AND [RefundQuantity] >= 0 AND [Revision] > 0 AND [SalesReportVersion] > 0");
                    table.CheckConstraint("CK_ConsignmentSettlement_Status", "([Status] = 'Settled' AND [SettledAt] IS NOT NULL) OR ([Status] IN ('AwaitingPayment','PartiallyReceived','CreditDue') AND [Status] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_AdminUsers_AttributionResolvedByAdminUserId",
                        column: x => x.AttributionResolvedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_ConsignmentSalesReports_SalesReportId",
                        column: x => x.SalesReportId,
                        principalTable: "ConsignmentSalesReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_MerchantBranches_MerchantBranchId",
                        column: x => x.MerchantBranchId,
                        principalTable: "MerchantBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_SalespersonPolicyAssignments_PolicyAssignmentId",
                        column: x => x.PolicyAssignmentId,
                        principalTable: "SalespersonPolicyAssignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlements_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSettlementReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceivedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    RequestFingerprint = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    VoidedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    VoidedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    VoidReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSettlementReceipts", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSettlementReceipt_Amount", "[Amount] > 0");
                    table.CheckConstraint("CK_ConsignmentSettlementReceipt_Reference", "[Reference] IS NOT NULL AND LEN([Reference]) >= 3");
                    table.CheckConstraint("CK_ConsignmentSettlementReceipt_VoidShape", "([VoidedAt] IS NULL AND [VoidedByAdminUserId] IS NULL AND [VoidReason] IS NULL) OR ([VoidedAt] IS NOT NULL AND [VoidedByAdminUserId] IS NOT NULL AND [VoidReason] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementReceipts_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementReceipts_AdminUsers_VoidedByAdminUserId",
                        column: x => x.VoidedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementReceipts_ConsignmentSettlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "ConsignmentSettlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSettlementRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    SalesReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalesReportVersion = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    StandardQuantity = table.Column<int>(type: "int", nullable: false),
                    StandardSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PromotionQuantity = table.Column<int>(type: "int", nullable: false),
                    PromotionSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    RefundQuantity = table.Column<int>(type: "int", nullable: false),
                    RefundAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    EligibleSales = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MerchantCommission = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ExpectedRemittance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CommissionPolicyCode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: true),
                    SalesCommissionTarget = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionRecoveryRequired = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSettlementRevisions", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSettlementRevision_Values", "[Revision] > 0 AND [SalesReportVersion] > 0 AND [StandardQuantity] >= 0 AND [PromotionQuantity] >= 0 AND [RefundQuantity] >= 0 AND [SalesCommissionTarget] >= 0 AND [CommissionRecoveryRequired] >= 0 AND [EligibleSales] = [StandardSales] + [PromotionSales] - [RefundAmount] AND [ExpectedRemittance] = [EligibleSales] - [MerchantCommission]");
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementRevisions_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementRevisions_ConsignmentSalesReports_SalesReportId",
                        column: x => x.SalesReportId,
                        principalTable: "ConsignmentSalesReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementRevisions_ConsignmentSettlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "ConsignmentSettlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSettlementLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceReportLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LineType = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    PriceTermId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PriceKind = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MerchantCommissionPercentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    RefundOfPeriodStart = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CommissionSalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CommissionUnitAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    CommissionRuleId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSettlementLines", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSettlementLine_Commission", "([CommissionSalespersonId] IS NULL AND [CommissionUnitAmount] IS NULL AND [CommissionRuleId] IS NULL) OR ([CommissionSalespersonId] IS NOT NULL AND [CommissionUnitAmount] IS NOT NULL AND [CommissionUnitAmount] >= 0)");
                    table.CheckConstraint("CK_ConsignmentSettlementLine_Values", "[Quantity] > 0 AND [UnitPrice] >= 0 AND [MerchantCommissionPercentage] BETWEEN 0 AND 100 AND (([LineType] = 'Sale' AND [Amount] >= 0 AND [RefundOfPeriodStart] IS NULL) OR ([LineType] = 'Refund' AND [Amount] <= 0 AND [RefundOfPeriodStart] IS NOT NULL))");
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementLines_CommissionRules_CommissionRuleId",
                        column: x => x.CommissionRuleId,
                        principalTable: "CommissionRules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementLines_ConsignmentPriceTerms_PriceTermId",
                        column: x => x.PriceTermId,
                        principalTable: "ConsignmentPriceTerms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementLines_ConsignmentSalesReportLines_SourceReportLineId",
                        column: x => x.SourceReportLineId,
                        principalTable: "ConsignmentSalesReportLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementLines_ConsignmentSettlementRevisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "ConsignmentSettlementRevisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSettlementLines_Salespersons_CommissionSalespersonId",
                        column: x => x.CommissionSalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "CommissionRules",
                columns: new[] { "Id", "CommissionType", "CreatedAt", "Currency", "EffectiveFrom", "EffectiveTo", "EligibilityMonths", "FixedAmount", "IsActive", "MaxQuantity", "MinQuantity", "Notes", "Percentage", "PolicyCode", "SalespersonId", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[,]
                {
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b31"), "ConsignmentStandardPerUnit", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 4.50m, true, null, null, "v1.1 consignment commission per verified sold tag at a Standard price", null, "v1.1", null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b32"), "ConsignmentPromotionPerUnit", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 4.00m, true, null, null, "v1.1 consignment commission per verified sold tag at a Promotion price", null, "v1.1", null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_ConsignmentSalesReportId",
                table: "SalesCommissions",
                column: "ConsignmentSalesReportId");

            migrationBuilder.CreateIndex(
                name: "UX_SalesCommissions_ConsignmentRevisionGroup",
                table: "SalesCommissions",
                columns: new[] { "ConsignmentSettlementId", "ConsignmentSettlementRevision", "SalespersonId", "CommissionType", "CommissionFixedAmountSnapshot" },
                unique: true,
                filter: "[ConsignmentSettlementId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_PendingSource",
                table: "SalesCommissions",
                sql: "[Status] <> 'Pending' OR ([SourceType] = 'ConsignmentSettlement' AND [PaidAt] IS NULL AND [PayableAt] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions",
                sql: "([CommissionType] = 'MerchantOrderPercentage' AND [SourceType] = 'MerchantOrder') OR ([CommissionType] = 'DirectRetailPercentage' AND [SourceType] = 'TagOrder') OR ([CommissionType] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceType] = 'MerchantOrder') OR ([CommissionType] IN ('ConsignmentStandardPerUnit','ConsignmentPromotionPerUnit') AND [SourceType] = 'ConsignmentSettlement' AND [CommissionFixedAmountSnapshot] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions",
                sql: "([SourceType] = 'MerchantOrder' AND [MerchantId] IS NOT NULL AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL AND [ConsignmentSettlementId] IS NULL) OR ([SourceType] = 'TagOrder' AND [MerchantId] IS NULL AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL AND [ConsignmentSettlementId] IS NULL) OR ([SourceType] = 'ConsignmentSettlement' AND [MerchantId] IS NOT NULL AND [ConsignmentSettlementId] IS NOT NULL AND [ConsignmentSettlementRevision] IS NOT NULL AND [ConsignmentSalesReportId] IS NOT NULL AND [MerchantBranchId] IS NOT NULL AND [QualifiedQuantity] IS NOT NULL AND [QualifiedQuantity] > 0 AND [PolicyCode] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL AND [TagOrderId] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules",
                sql: "([CommissionType] = 'DirectRetailPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerAcquisitionBonus' AND [Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [MinQuantity] IS NOT NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerRepeatPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [MinQuantity] IS NULL AND [MaxQuantity] IS NULL AND [EligibilityMonths] > 0) OR ([CommissionType] IN ('ConsignmentStandardPerUnit','ConsignmentPromotionPerUnit') AND [Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [MinQuantity] IS NULL AND [MaxQuantity] IS NULL AND [EligibilityMonths] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionRules_PolicyCode",
                table: "CommissionRules",
                sql: "([CommissionType] IN ('ConsignmentStandardPerUnit','ConsignmentPromotionPerUnit') AND [PolicyCode] IS NOT NULL AND [PolicyCode] = 'v1.1') OR ([CommissionType] NOT IN ('ConsignmentStandardPerUnit','ConsignmentPromotionPerUnit') AND [PolicyCode] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionPayouts_TransferredOn",
                table: "CommissionPayouts",
                sql: "[TransferredOn] IS NULL OR [Status] = 'Paid'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceCommissionType",
                table: "CommissionPayoutItems",
                sql: "([CommissionTypeSnapshot] = 'MerchantOrderPercentage' AND [SourceTypeSnapshot] = 'MerchantOrder') OR ([CommissionTypeSnapshot] = 'DirectRetailPercentage' AND [SourceTypeSnapshot] = 'TagOrder') OR ([CommissionTypeSnapshot] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceTypeSnapshot] = 'MerchantOrder') OR ([CommissionTypeSnapshot] IN ('ConsignmentStandardPerUnit','ConsignmentPromotionPerUnit') AND [SourceTypeSnapshot] = 'ConsignmentSettlement')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceShape",
                table: "CommissionPayoutItems",
                sql: "([SourceTypeSnapshot] = 'MerchantOrder' AND [MerchantOrderIdSnapshot] IS NOT NULL AND [TagOrderIdSnapshot] IS NULL AND [ConsignmentSettlementIdSnapshot] IS NULL) OR ([SourceTypeSnapshot] = 'TagOrder' AND [TagOrderIdSnapshot] IS NOT NULL AND [MerchantOrderIdSnapshot] IS NULL AND [ConsignmentSettlementIdSnapshot] IS NULL) OR ([SourceTypeSnapshot] = 'ConsignmentSettlement' AND [ConsignmentSettlementIdSnapshot] IS NOT NULL AND [MerchantOrderIdSnapshot] IS NULL AND [TagOrderIdSnapshot] IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_CommissionRuleId",
                table: "ConsignmentSettlementLines",
                column: "CommissionRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_CommissionSalespersonId",
                table: "ConsignmentSettlementLines",
                column: "CommissionSalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_PriceTermId",
                table: "ConsignmentSettlementLines",
                column: "PriceTermId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_ProductVariantId_LineType",
                table: "ConsignmentSettlementLines",
                columns: new[] { "ProductVariantId", "LineType" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_RevisionId_SourceReportLineId",
                table: "ConsignmentSettlementLines",
                columns: new[] { "RevisionId", "SourceReportLineId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementLines_SourceReportLineId",
                table: "ConsignmentSettlementLines",
                column: "SourceReportLineId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementReceipts_IdempotencyKey",
                table: "ConsignmentSettlementReceipts",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementReceipts_RecordedByAdminUserId",
                table: "ConsignmentSettlementReceipts",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementReceipts_SettlementId_ReceivedOn",
                table: "ConsignmentSettlementReceipts",
                columns: new[] { "SettlementId", "ReceivedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementReceipts_VoidedByAdminUserId",
                table: "ConsignmentSettlementReceipts",
                column: "VoidedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementRevisions_CreatedByAdminUserId",
                table: "ConsignmentSettlementRevisions",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementRevisions_SalesReportId",
                table: "ConsignmentSettlementRevisions",
                column: "SalesReportId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlementRevisions_SettlementId_Revision",
                table: "ConsignmentSettlementRevisions",
                columns: new[] { "SettlementId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_AgreementId",
                table: "ConsignmentSettlements",
                column: "AgreementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_AttributionResolvedByAdminUserId",
                table: "ConsignmentSettlements",
                column: "AttributionResolvedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_AttributionStatus",
                table: "ConsignmentSettlements",
                column: "AttributionStatus",
                filter: "[AttributionStatus] = 'NeedsResolution'");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_MerchantBranchId_PeriodStart",
                table: "ConsignmentSettlements",
                columns: new[] { "MerchantBranchId", "PeriodStart" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_MerchantId_PeriodStart",
                table: "ConsignmentSettlements",
                columns: new[] { "MerchantId", "PeriodStart" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_PolicyAssignmentId",
                table: "ConsignmentSettlements",
                column: "PolicyAssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_SalespersonId",
                table: "ConsignmentSettlements",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_SalesReportId",
                table: "ConsignmentSettlements",
                column: "SalesReportId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_SettlementNumber",
                table: "ConsignmentSettlements",
                column: "SettlementNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSettlements_Status_PeriodStart",
                table: "ConsignmentSettlements",
                columns: new[] { "Status", "PeriodStart" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantServicingAssignments_MerchantId_EffectiveFrom",
                table: "MerchantServicingAssignments",
                columns: new[] { "MerchantId", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantServicingAssignments_RecordedByAdminUserId",
                table: "MerchantServicingAssignments",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantServicingAssignments_SalespersonId",
                table: "MerchantServicingAssignments",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "UX_MerchantServicingAssignments_Open",
                table: "MerchantServicingAssignments",
                column: "MerchantId",
                unique: true,
                filter: "[EffectiveToExclusive] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalespersonPolicyAssignments_CreatedByAdminUserId",
                table: "SalespersonPolicyAssignments",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SalespersonPolicyAssignments_EndedByAdminUserId",
                table: "SalespersonPolicyAssignments",
                column: "EndedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SalespersonPolicyAssignments_SalespersonId_EffectiveFrom",
                table: "SalespersonPolicyAssignments",
                columns: new[] { "SalespersonId", "EffectiveFrom" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_ConsignmentSalesReports_ConsignmentSalesReportId",
                table: "SalesCommissions",
                column: "ConsignmentSalesReportId",
                principalTable: "ConsignmentSalesReports",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_ConsignmentSettlements_ConsignmentSettlementId",
                table: "SalesCommissions",
                column: "ConsignmentSettlementId",
                principalTable: "ConsignmentSettlements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Servicing history starts at rollout. Each merchant's current representative is recorded
            // from this moment; earlier periods have no recorded history and are never attributed
            // automatically, so nothing earned before rollout is assumed. No commission, settlement or
            // payment is created for any historical consignment sale.
            migrationBuilder.Sql("""
                INSERT INTO [MerchantServicingAssignments]
                    ([Id], [MerchantId], [SalespersonId], [SalespersonCodeSnapshot], [SalespersonNameSnapshot],
                     [EffectiveFrom], [EffectiveToExclusive], [Source], [RecordedByAdminUserId], [RecordedAt])
                SELECT NEWID(), m.[Id], s.[Id], s.[SalespersonCode], LEFT(s.[Name], 160),
                       TODATETIMEOFFSET(SYSUTCDATETIME(), 0), NULL, 'Rollout', NULL, TODATETIMEOFFSET(SYSUTCDATETIME(), 0)
                FROM [Merchants] m
                JOIN [Salespersons] s ON s.[Id] = m.[AssignedSalespersonId]
                WHERE NOT EXISTS (SELECT 1 FROM [MerchantServicingAssignments] a
                                  WHERE a.[MerchantId] = m.[Id] AND a.[EffectiveToExclusive] IS NULL);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back would erase financial history: settlements, partner receipts, consignment
            // commission, recorded commission terms, servicing changes made after rollout and payout
            // transfer dates. It is refused once any of them exists.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM [ConsignmentSettlements] WITH(TABLOCKX,HOLDLOCK))
                    OR EXISTS(SELECT 1 FROM [ConsignmentSettlementReceipts] WITH(TABLOCKX,HOLDLOCK))
                    OR EXISTS(SELECT 1 FROM [SalespersonPolicyAssignments] WITH(TABLOCKX,HOLDLOCK))
                    OR EXISTS(SELECT 1 FROM [MerchantServicingAssignments] WITH(TABLOCKX,HOLDLOCK) WHERE [Source] <> 'Rollout' OR [EffectiveToExclusive] IS NOT NULL)
                    OR EXISTS(SELECT 1 FROM [SalesCommissions] WITH(TABLOCKX,HOLDLOCK) WHERE [SourceType] = 'ConsignmentSettlement' OR [Status] = 'Pending')
                    OR EXISTS(SELECT 1 FROM [CommissionPayouts] WITH(TABLOCKX,HOLDLOCK) WHERE [TransferredOn] IS NOT NULL)
                    OR EXISTS(SELECT 1 FROM [CommissionRules] WITH(TABLOCKX,HOLDLOCK) WHERE [PolicyCode] IS NOT NULL
                        AND [Id] NOT IN ('a971d6d5-86a8-4f85-a5e4-9cb85a1f3b31','a971d6d5-86a8-4f85-a5e4-9cb85a1f3b32'))
                    THROW 51063, 'Settlement rollback blocked: retain consignment settlements, receipts, commission, commission terms, servicing history and payout transfer dates.', 1;
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_ConsignmentSalesReports_ConsignmentSalesReportId",
                table: "SalesCommissions");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_ConsignmentSettlements_ConsignmentSettlementId",
                table: "SalesCommissions");

            migrationBuilder.DropTable(
                name: "ConsignmentSettlementLines");

            migrationBuilder.DropTable(
                name: "ConsignmentSettlementReceipts");

            migrationBuilder.DropTable(
                name: "MerchantServicingAssignments");

            migrationBuilder.DropTable(
                name: "ConsignmentSettlementRevisions");

            migrationBuilder.DropTable(
                name: "ConsignmentSettlements");

            migrationBuilder.DropTable(
                name: "SalespersonPolicyAssignments");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_ConsignmentSalesReportId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "UX_SalesCommissions_ConsignmentRevisionGroup",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_PendingSource",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionRules_PolicyCode",
                table: "CommissionRules");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionPayouts_TransferredOn",
                table: "CommissionPayouts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceCommissionType",
                table: "CommissionPayoutItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceShape",
                table: "CommissionPayoutItems");

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b31"));

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b32"));

            migrationBuilder.DropColumn(
                name: "ConsignmentSalesReportId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "ConsignmentSettlementId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "ConsignmentSettlementRevision",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "MerchantBranchId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "PayableAt",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "PolicyCode",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "QualifiedQuantity",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "PolicyCode",
                table: "CommissionRules");

            migrationBuilder.DropColumn(
                name: "TransferredOn",
                table: "CommissionPayouts");

            migrationBuilder.DropColumn(
                name: "ConsignmentSettlementIdSnapshot",
                table: "CommissionPayoutItems");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions",
                sql: "([CommissionType] = 'MerchantOrderPercentage' AND [SourceType] = 'MerchantOrder') OR ([CommissionType] = 'DirectRetailPercentage' AND [SourceType] = 'TagOrder') OR ([CommissionType] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceType] = 'MerchantOrder')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions",
                sql: "([SourceType] = 'MerchantOrder' AND [MerchantId] IS NOT NULL AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = 'TagOrder' AND [MerchantId] IS NULL AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules",
                sql: "([CommissionType] = 'DirectRetailPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerAcquisitionBonus' AND [Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [MinQuantity] IS NOT NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerRepeatPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [MinQuantity] IS NULL AND [MaxQuantity] IS NULL AND [EligibilityMonths] > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceCommissionType",
                table: "CommissionPayoutItems",
                sql: "([CommissionTypeSnapshot] = 'MerchantOrderPercentage' AND [SourceTypeSnapshot] = 'MerchantOrder') OR ([CommissionTypeSnapshot] = 'DirectRetailPercentage' AND [SourceTypeSnapshot] = 'TagOrder') OR ([CommissionTypeSnapshot] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceTypeSnapshot] = 'MerchantOrder')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionPayoutItems_SourceShape",
                table: "CommissionPayoutItems",
                sql: "([SourceTypeSnapshot] = 'MerchantOrder' AND [MerchantOrderIdSnapshot] IS NOT NULL AND [TagOrderIdSnapshot] IS NULL) OR ([SourceTypeSnapshot] = 'TagOrder' AND [TagOrderIdSnapshot] IS NOT NULL AND [MerchantOrderIdSnapshot] IS NULL)");
        }
    }
}
