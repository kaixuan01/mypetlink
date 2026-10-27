using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentDeliveryOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsignmentDeliveryOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DispatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryOrderNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    DeliveredQuantity = table.Column<int>(type: "int", nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    ContentSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IssuedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDeliveryOrders", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentDeliveryOrder_Quantity", "[DeliveredQuantity] > 0");
                    table.ForeignKey(
                        name: "FK_ConsignmentDeliveryOrders_AdminUsers_IssuedByAdminUserId",
                        column: x => x.IssuedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDeliveryOrders_ConsignmentDispatches_DispatchId",
                        column: x => x.DispatchId,
                        principalTable: "ConsignmentDispatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentDeliveryOrders_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_DeliveryOrderNumber",
                table: "ConsignmentDeliveryOrders",
                column: "DeliveryOrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_DispatchId",
                table: "ConsignmentDeliveryOrders",
                column: "DispatchId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_IssuedByAdminUserId",
                table: "ConsignmentDeliveryOrders",
                column: "IssuedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_MerchantId",
                table: "ConsignmentDeliveryOrders",
                column: "MerchantId");

            // An issued Delivery Order is the record both parties signed against: never edited or deleted.
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentDeliveryOrders_AppendOnly ON ConsignmentDeliveryOrders
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51059, ''Issued consignment Delivery Orders are append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back is only possible before any Delivery Order has been issued.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentDeliveryOrders WITH(TABLOCKX,HOLDLOCK))
                    THROW 51060, 'Consignment rollback blocked: retain issued Delivery Orders.', 1;
                """);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentDeliveryOrders_AppendOnly;");
            migrationBuilder.DropTable(
                name: "ConsignmentDeliveryOrders");
        }
    }
}
