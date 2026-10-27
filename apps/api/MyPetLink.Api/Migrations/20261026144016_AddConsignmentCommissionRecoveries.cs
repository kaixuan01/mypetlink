using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentCommissionRecoveries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsignmentCommissionRecoveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SettlementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SettlementRevision = table.Column<int>(type: "int", nullable: false),
                    CausedBySettlementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginCommissionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommissionPayoutId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    UnitAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentCommissionRecoveries", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentCommissionRecovery_Values", "[SettlementRevision] > 0 AND [Quantity] > 0 AND [UnitAmount] > 0 AND [Amount] > 0 AND [Amount] = [Quantity] * [UnitAmount]");
                    table.ForeignKey(
                        name: "FK_ConsignmentCommissionRecoveries_CommissionPayouts_CommissionPayoutId",
                        column: x => x.CommissionPayoutId,
                        principalTable: "CommissionPayouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentCommissionRecoveries_ConsignmentSettlements_CausedBySettlementId",
                        column: x => x.CausedBySettlementId,
                        principalTable: "ConsignmentSettlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentCommissionRecoveries_ConsignmentSettlements_SettlementId",
                        column: x => x.SettlementId,
                        principalTable: "ConsignmentSettlements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentCommissionRecoveries_SalesCommissions_OriginCommissionId",
                        column: x => x.OriginCommissionId,
                        principalTable: "SalesCommissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentCommissionRecoveries_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentCommissionRecoveries_CausedBySettlementId",
                table: "ConsignmentCommissionRecoveries",
                column: "CausedBySettlementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentCommissionRecoveries_CommissionPayoutId",
                table: "ConsignmentCommissionRecoveries",
                column: "CommissionPayoutId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentCommissionRecoveries_OriginCommissionId",
                table: "ConsignmentCommissionRecoveries",
                column: "OriginCommissionId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentCommissionRecoveries_SalespersonId",
                table: "ConsignmentCommissionRecoveries",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentCommissionRecoveries_SettlementId_SettlementRevision_OriginCommissionId_CausedBySettlementId",
                table: "ConsignmentCommissionRecoveries",
                columns: new[] { "SettlementId", "SettlementRevision", "OriginCommissionId", "CausedBySettlementId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recovery obligations are financial history: cash a salesperson was paid and owes back.
            // Rolling back is refused once any exists.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM [ConsignmentCommissionRecoveries] WITH(TABLOCKX,HOLDLOCK))
                    THROW 51064, 'Recovery rollback blocked: retain consignment commission recovery obligations.', 1;
                """);
            migrationBuilder.DropTable(
                name: "ConsignmentCommissionRecoveries");
        }
    }
}
