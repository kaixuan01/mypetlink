using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryReceiptsAndProfitabilitySnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CostBasis",
                table: "TagOrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unavailable");

            migrationBuilder.AddColumn<decimal>(
                name: "CostOfGoodsSnapshot",
                table: "TagOrderItems",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CostSnapshotAt",
                table: "TagOrderItems",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InventoryReceiptId",
                table: "SmartTags",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CostBasis",
                table: "MerchantOrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unavailable");

            migrationBuilder.AddColumn<decimal>(
                name: "CostOfGoodsSnapshot",
                table: "MerchantOrderItems",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CostSnapshotAt",
                table: "MerchantOrderItems",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CostBasis",
                table: "MerchantOrderAllocatedTags",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unavailable");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CostSnapshotAt",
                table: "MerchantOrderAllocatedTags",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "InventoryReceiptIdSnapshot",
                table: "MerchantOrderAllocatedTags",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InventoryReceiptNumberSnapshot",
                table: "MerchantOrderAllocatedTags",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitLandedCostMyrSnapshot",
                table: "MerchantOrderAllocatedTags",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    TagProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagBatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    QuantityReceived = table.Column<int>(type: "int", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SupplierName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    SupplierReference = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PurchaseCurrency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    ExchangeRateToMyr = table.Column<decimal>(type: "decimal(18,6)", precision: 18, scale: 6, nullable: false),
                    CostMode = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    GoodsCost = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    FreightCost = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CustomsTaxCost = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    OtherLandedCost = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalLandedCostMyr = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    UnitLandedCostMyr = table.Column<decimal>(type: "decimal(18,6)", precision: 18, scale: 6, nullable: false),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CorrectsReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CorrectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryReceipts", x => x.Id);
                    table.CheckConstraint("CK_InventoryReceipts_Costs", "[GoodsCost] >= 0 AND [FreightCost] >= 0 AND [CustomsTaxCost] >= 0 AND [OtherLandedCost] >= 0 AND [TotalLandedCostMyr] > 0 AND [UnitLandedCostMyr] > 0");
                    table.CheckConstraint("CK_InventoryReceipts_ExchangeRate", "[ExchangeRateToMyr] > 0");
                    table.CheckConstraint("CK_InventoryReceipts_QuantityReceived", "[QuantityReceived] > 0");
                    table.ForeignKey(
                        name: "FK_InventoryReceipts_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryReceipts_InventoryReceipts_CorrectsReceiptId",
                        column: x => x.CorrectsReceiptId,
                        principalTable: "InventoryReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryReceipts_SmartTagBatches_SmartTagBatchId",
                        column: x => x.SmartTagBatchId,
                        principalTable: "SmartTagBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryReceipts_TagProductVariants_TagProductVariantId",
                        column: x => x.TagProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TagOrderItemCostAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagOrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InventoryReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    InventoryReceiptNumberSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    UnitLandedCostMyrSnapshot = table.Column<decimal>(type: "decimal(18,6)", precision: 18, scale: 6, nullable: true),
                    CostBasis = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false, defaultValue: "Unavailable"),
                    CostSnapshotAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagOrderItemCostAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagOrderItemCostAllocations_InventoryReceipts_InventoryReceiptId",
                        column: x => x.InventoryReceiptId,
                        principalTable: "InventoryReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrderItemCostAllocations_SmartTags_SmartTagId",
                        column: x => x.SmartTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrderItemCostAllocations_TagOrderItems_TagOrderItemId",
                        column: x => x.TagOrderItemId,
                        principalTable: "TagOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_InventoryReceiptId",
                table: "SmartTags",
                column: "InventoryReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_CorrectsReceiptId",
                table: "InventoryReceipts",
                column: "CorrectsReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_CreatedByAdminUserId",
                table: "InventoryReceipts",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_ReceiptNumber",
                table: "InventoryReceipts",
                column: "ReceiptNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_SmartTagBatchId",
                table: "InventoryReceipts",
                column: "SmartTagBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryReceipts_TagProductVariantId_ReceivedAt",
                table: "InventoryReceipts",
                columns: new[] { "TagProductVariantId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItemCostAllocations_InventoryReceiptId",
                table: "TagOrderItemCostAllocations",
                column: "InventoryReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItemCostAllocations_SmartTagId",
                table: "TagOrderItemCostAllocations",
                column: "SmartTagId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItemCostAllocations_TagOrderItemId",
                table: "TagOrderItemCostAllocations",
                column: "TagOrderItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTags_InventoryReceipts_InventoryReceiptId",
                table: "SmartTags",
                column: "InventoryReceiptId",
                principalTable: "InventoryReceipts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_InventoryReceipts_InventoryReceiptId",
                table: "SmartTags");

            migrationBuilder.DropTable(
                name: "TagOrderItemCostAllocations");

            migrationBuilder.DropTable(
                name: "InventoryReceipts");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_InventoryReceiptId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "CostBasis",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "CostOfGoodsSnapshot",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "CostSnapshotAt",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "InventoryReceiptId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "CostBasis",
                table: "MerchantOrderItems");

            migrationBuilder.DropColumn(
                name: "CostOfGoodsSnapshot",
                table: "MerchantOrderItems");

            migrationBuilder.DropColumn(
                name: "CostSnapshotAt",
                table: "MerchantOrderItems");

            migrationBuilder.DropColumn(
                name: "CostBasis",
                table: "MerchantOrderAllocatedTags");

            migrationBuilder.DropColumn(
                name: "CostSnapshotAt",
                table: "MerchantOrderAllocatedTags");

            migrationBuilder.DropColumn(
                name: "InventoryReceiptIdSnapshot",
                table: "MerchantOrderAllocatedTags");

            migrationBuilder.DropColumn(
                name: "InventoryReceiptNumberSnapshot",
                table: "MerchantOrderAllocatedTags");

            migrationBuilder.DropColumn(
                name: "UnitLandedCostMyrSnapshot",
                table: "MerchantOrderAllocatedTags");
        }
    }
}
