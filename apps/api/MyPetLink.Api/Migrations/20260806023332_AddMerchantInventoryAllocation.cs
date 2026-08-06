using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantInventoryAllocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CourierProvider",
                table: "MerchantOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CourierProviderCode",
                table: "MerchantOrders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CourierService",
                table: "MerchantOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeliveredAt",
                table: "MerchantOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "InternalCourierCost",
                table: "MerchantOrders",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InternalShippingNotes",
                table: "MerchantOrders",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PreparingAt",
                table: "MerchantOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadyToShipAt",
                table: "MerchantOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ShippedAt",
                table: "MerchantOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrackingNumber",
                table: "MerchantOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TrackingUrlSnapshot",
                table: "MerchantOrders",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MerchantDeliveryOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryOrderNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderNumberSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MerchantLegalNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MerchantTradingNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ContactPersonSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ContactEmailSnapshot = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    ContactPhoneSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DeliveryAddressLine1Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    DeliveryAddressLine2Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    DeliveryPostcodeSnapshot = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DeliveryCitySnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryStateSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryCountrySnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CourierProviderSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    CourierServiceSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    TrackingNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IssuedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantDeliveryOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantDeliveryOrders_AdminUsers_IssuedByAdminUserId",
                        column: x => x.IssuedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantDeliveryOrders_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantOrderAllocatedTags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BatchNoSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    AllocatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AllocatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    WasAutomatic = table.Column<bool>(type: "bit", nullable: false),
                    SentToMerchantAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReleasedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReleasedReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReleasedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantOrderAllocatedTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_AdminUsers_AllocatedByAdminUserId",
                        column: x => x.AllocatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_AdminUsers_ReleasedByAdminUserId",
                        column: x => x.ReleasedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_MerchantOrderItems_MerchantOrderItemId",
                        column: x => x.MerchantOrderItemId,
                        principalTable: "MerchantOrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_SmartTagBatches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "SmartTagBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrderAllocatedTags_SmartTags_SmartTagId",
                        column: x => x.SmartTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantDeliveryOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantDeliveryOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SkuCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OptionNameSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SupportsQrSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    SupportsNfcSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    OrderedQuantity = table.Column<int>(type: "int", nullable: false),
                    AllocatedQuantity = table.Column<int>(type: "int", nullable: false),
                    BatchSummarySnapshot = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantDeliveryOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantDeliveryOrderItems_MerchantDeliveryOrders_MerchantDeliveryOrderId",
                        column: x => x.MerchantDeliveryOrderId,
                        principalTable: "MerchantDeliveryOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_FulfilmentStatus_CreatedAt",
                table: "MerchantOrders",
                columns: new[] { "FulfilmentStatus", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders",
                column: "FulfilmentUpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantDeliveryOrderItems_MerchantDeliveryOrderId",
                table: "MerchantDeliveryOrderItems",
                column: "MerchantDeliveryOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantDeliveryOrders_DeliveryOrderNumber",
                table: "MerchantDeliveryOrders",
                column: "DeliveryOrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantDeliveryOrders_IssuedByAdminUserId",
                table: "MerchantDeliveryOrders",
                column: "IssuedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantDeliveryOrders_MerchantOrderId_Active",
                table: "MerchantDeliveryOrders",
                column: "MerchantOrderId",
                unique: true,
                filter: "[CancelledAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_AllocatedByAdminUserId",
                table: "MerchantOrderAllocatedTags",
                column: "AllocatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_BatchId",
                table: "MerchantOrderAllocatedTags",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_MerchantId",
                table: "MerchantOrderAllocatedTags",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_MerchantOrderId_ReleasedAt",
                table: "MerchantOrderAllocatedTags",
                columns: new[] { "MerchantOrderId", "ReleasedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_MerchantOrderItemId_ReleasedAt",
                table: "MerchantOrderAllocatedTags",
                columns: new[] { "MerchantOrderItemId", "ReleasedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_ReleasedByAdminUserId",
                table: "MerchantOrderAllocatedTags",
                column: "ReleasedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderAllocatedTags_SmartTagId_Active",
                table: "MerchantOrderAllocatedTags",
                column: "SmartTagId",
                unique: true,
                filter: "[ReleasedAt] IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_MerchantOrders_AdminUsers_FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders",
                column: "FulfilmentUpdatedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MerchantOrders_AdminUsers_FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders");

            migrationBuilder.DropTable(
                name: "MerchantDeliveryOrderItems");

            migrationBuilder.DropTable(
                name: "MerchantOrderAllocatedTags");

            migrationBuilder.DropTable(
                name: "MerchantDeliveryOrders");

            migrationBuilder.DropIndex(
                name: "IX_MerchantOrders_FulfilmentStatus_CreatedAt",
                table: "MerchantOrders");

            migrationBuilder.DropIndex(
                name: "IX_MerchantOrders_FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "CourierProvider",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "CourierProviderCode",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "CourierService",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "DeliveredAt",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "FulfilmentUpdatedByAdminUserId",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "InternalCourierCost",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "InternalShippingNotes",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "PreparingAt",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "ReadyToShipAt",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "ShippedAt",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "TrackingNumber",
                table: "MerchantOrders");

            migrationBuilder.DropColumn(
                name: "TrackingUrlSnapshot",
                table: "MerchantOrders");
        }
    }
}
