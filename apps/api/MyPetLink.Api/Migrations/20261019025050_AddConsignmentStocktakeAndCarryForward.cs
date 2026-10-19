using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentStocktakeAndCarryForward : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentRecordContributor_Subject",
                table: "ConsignmentRecordContributors");

            migrationBuilder.AddColumn<Guid>(
                name: "CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentStocktakes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantBranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CutoffAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CountedBy = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EvidenceKind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    EvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    PreviousStocktakeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ApprovedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ContributorHistoryComplete = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentStocktakes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_AdminUsers_ApprovedByAdminUserId",
                        column: x => x.ApprovedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_ConsignmentStocktakes_PreviousStocktakeId",
                        column: x => x.PreviousStocktakeId,
                        principalTable: "ConsignmentStocktakes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_MerchantBranches_MerchantBranchId",
                        column: x => x.MerchantBranchId,
                        principalTable: "MerchantBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakes_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentStocktakeLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StocktakeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CountedSellable = table.Column<int>(type: "int", nullable: false),
                    CountedUnsellable = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    FrozenAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    BookSellable = table.Column<int>(type: "int", nullable: true),
                    BookUnsellable = table.Column<int>(type: "int", nullable: true),
                    BookInvestigation = table.Column<int>(type: "int", nullable: true),
                    BookSold = table.Column<int>(type: "int", nullable: true),
                    BookLost = table.Column<int>(type: "int", nullable: true),
                    OpenSurplusBefore = table.Column<int>(type: "int", nullable: true),
                    UnsellableFound = table.Column<int>(type: "int", nullable: true),
                    UnsellableShortage = table.Column<int>(type: "int", nullable: true),
                    Shortage = table.Column<int>(type: "int", nullable: true),
                    Surplus = table.Column<int>(type: "int", nullable: true),
                    SurplusNoLongerPresent = table.Column<int>(type: "int", nullable: true),
                    ClosingSellable = table.Column<int>(type: "int", nullable: true),
                    ClosingUnsellable = table.Column<int>(type: "int", nullable: true),
                    ClosingInvestigation = table.Column<int>(type: "int", nullable: true),
                    ClosingSold = table.Column<int>(type: "int", nullable: true),
                    ClosingLost = table.Column<int>(type: "int", nullable: true),
                    OpenSurplusAfter = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentStocktakeLines", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentStocktakeLine_Counts", "[CountedSellable] >= 0 AND [CountedUnsellable] >= 0");
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakeLines_ConsignmentStocktakes_StocktakeId",
                        column: x => x.StocktakeId,
                        principalTable: "ConsignmentStocktakes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStocktakeLines_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentStockDiscrepancies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantBranchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    OriginStocktakeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginStocktakeLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    OpenQuantity = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentStockDiscrepancies", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentDiscrepancy_Quantities", "[Quantity] > 0 AND [OpenQuantity] >= 0 AND [OpenQuantity] <= [Quantity] AND (([Status] = 'Open' AND [OpenQuantity] > 0) OR ([Status] = 'Resolved' AND [OpenQuantity] = 0))");
                    table.ForeignKey(
                        name: "FK_ConsignmentStockDiscrepancies_ConsignmentStocktakeLines_OriginStocktakeLineId",
                        column: x => x.OriginStocktakeLineId,
                        principalTable: "ConsignmentStocktakeLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockDiscrepancies_ConsignmentStocktakes_OriginStocktakeId",
                        column: x => x.OriginStocktakeId,
                        principalTable: "ConsignmentStocktakes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockDiscrepancies_MerchantBranches_MerchantBranchId",
                        column: x => x.MerchantBranchId,
                        principalTable: "MerchantBranches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockDiscrepancies_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentStockDiscrepancies_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentDiscrepancyResolutions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DiscrepancyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    EvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    LinkedSalesReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RelatedDiscrepancyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewEventId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    ActorAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDiscrepancyResolutions", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentDiscrepancyResolution_Quantity", "[Quantity] > 0");
                    table.ForeignKey(
                        name: "FK_ConsignmentDiscrepancyResolutions_AdminUsers_ActorAdminUserId",
                        column: x => x.ActorAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentReviewEvents_ReviewEventId",
                        column: x => x.ReviewEventId,
                        principalTable: "ConsignmentReviewEvents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentSalesReports_LinkedSalesReportId",
                        column: x => x.LinkedSalesReportId,
                        principalTable: "ConsignmentSalesReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentStockDiscrepancies_DiscrepancyId",
                        column: x => x.DiscrepancyId,
                        principalTable: "ConsignmentStockDiscrepancies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentStockDiscrepancies_RelatedDiscrepancyId",
                        column: x => x.RelatedDiscrepancyId,
                        principalTable: "ConsignmentStockDiscrepancies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSalesReportLines_CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines",
                column: "CorroboratedByStocktakeId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentRecordContributor_Subject",
                table: "ConsignmentRecordContributors",
                sql: "[SubjectType] IN ('ConsignmentSalesReport','ConsignmentPriceTerm','ConsignmentStocktake')");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancyResolutions_ActorAdminUserId",
                table: "ConsignmentDiscrepancyResolutions",
                column: "ActorAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancyResolutions_Discrepancy",
                table: "ConsignmentDiscrepancyResolutions",
                column: "DiscrepancyId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancyResolutions_LinkedSalesReportId",
                table: "ConsignmentDiscrepancyResolutions",
                column: "LinkedSalesReportId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancyResolutions_RelatedDiscrepancyId",
                table: "ConsignmentDiscrepancyResolutions",
                column: "RelatedDiscrepancyId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancyResolutions_ReviewEventId",
                table: "ConsignmentDiscrepancyResolutions",
                column: "ReviewEventId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancies_Open",
                table: "ConsignmentStockDiscrepancies",
                columns: new[] { "MerchantBranchId", "ProductVariantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDiscrepancies_Origin",
                table: "ConsignmentStockDiscrepancies",
                column: "OriginStocktakeId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStockDiscrepancies_MerchantId",
                table: "ConsignmentStockDiscrepancies",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStockDiscrepancies_OriginStocktakeLineId",
                table: "ConsignmentStockDiscrepancies",
                column: "OriginStocktakeLineId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStockDiscrepancies_ProductVariantId",
                table: "ConsignmentStockDiscrepancies",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakeLines_ProductVariantId",
                table: "ConsignmentStocktakeLines",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentStocktakeLines_Sku",
                table: "ConsignmentStocktakeLines",
                columns: new[] { "StocktakeId", "ProductVariantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_ApprovedByAdminUserId",
                table: "ConsignmentStocktakes",
                column: "ApprovedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_Branch",
                table: "ConsignmentStocktakes",
                columns: new[] { "MerchantBranchId", "Status", "CutoffAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_CreatedByAdminUserId",
                table: "ConsignmentStocktakes",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_MerchantId",
                table: "ConsignmentStocktakes",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_PreviousStocktakeId",
                table: "ConsignmentStocktakes",
                column: "PreviousStocktakeId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentStocktakes_RecordedByAdminUserId",
                table: "ConsignmentStocktakes",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentStocktakes_Cutoff",
                table: "ConsignmentStocktakes",
                columns: new[] { "MerchantBranchId", "CutoffAt" },
                unique: true,
                filter: "[Status] = 'Approved'");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentStocktakes_Idempotency",
                table: "ConsignmentStocktakes",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentStocktakes_Open",
                table: "ConsignmentStocktakes",
                column: "MerchantBranchId",
                unique: true,
                filter: "[Status] IN ('Draft','Recorded')");

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentSalesReportLines_ConsignmentStocktakes_CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines",
                column: "CorroboratedByStocktakeId",
                principalTable: "ConsignmentStocktakes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // A closed month never changes, for any write path: resolutions are append-only, a frozen
            // stocktake line can't change, and an approved stocktake can't change or be removed.
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentDiscrepancyResolutions_AppendOnly ON ConsignmentDiscrepancyResolutions
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51048, ''Consignment discrepancy resolutions are append-only.'', 1;
                END;');
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentStocktakeLines_Frozen ON ConsignmentStocktakeLines
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE FrozenAt IS NOT NULL)
                        THROW 51049, ''An approved stocktake line is frozen.'', 1;
                END;');
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentStocktakes_Closed ON ConsignmentStocktakes
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE Status = ''Approved'')
                        THROW 51050, ''An approved stocktake is a closed month and cannot change.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Stocktakes, discrepancies and their resolutions are the record of closed months. Rolling
            // back is only possible before any exist. Earlier migrations keep their own guards, but a
            // multi-step downgrade is not atomic: never assume a refused downgrade left the schema as it was.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentStocktakes WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentStockDiscrepancies WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentDiscrepancyResolutions WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentRecordContributors WITH(TABLOCKX,HOLDLOCK) WHERE SubjectType = N'ConsignmentStocktake')
                    THROW 51051, 'Consignment rollback blocked: retain stocktakes, discrepancies and closed-month history.', 1;
                """);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentDiscrepancyResolutions_AppendOnly;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentStocktakeLines_Frozen;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentStocktakes_Closed;");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentSalesReportLines_ConsignmentStocktakes_CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropTable(
                name: "ConsignmentDiscrepancyResolutions");

            migrationBuilder.DropTable(
                name: "ConsignmentStockDiscrepancies");

            migrationBuilder.DropTable(
                name: "ConsignmentStocktakeLines");

            migrationBuilder.DropTable(
                name: "ConsignmentStocktakes");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentSalesReportLines_CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentRecordContributor_Subject",
                table: "ConsignmentRecordContributors");

            migrationBuilder.DropColumn(
                name: "CorroboratedByStocktakeId",
                table: "ConsignmentSalesReportLines");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentRecordContributor_Subject",
                table: "ConsignmentRecordContributors",
                sql: "[SubjectType] IN ('ConsignmentSalesReport','ConsignmentPriceTerm')");
        }
    }
}
