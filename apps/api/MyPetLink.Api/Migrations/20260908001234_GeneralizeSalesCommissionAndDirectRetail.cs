using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class GeneralizeSalesCommissionAndDirectRetail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Do not let the index replacement conceal an existing financial
            // conflict. Historical rows require an operator decision; this
            // migration only classifies them and never changes their amounts,
            // status, attribution or payout/reversal history.
            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [SalesCommissions]
                    WHERE [Status] <> N'Reversed'
                    GROUP BY [MerchantOrderId]
                    HAVING COUNT_BIG(*) > 1
                )
                BEGIN
                    THROW 51030, 'Duplicate non-reversed merchant commissions exist. Run diagnose-phase3b-sales-commissions.sql and resolve the financial history before applying this migration.', 1;
                END;

                IF EXISTS (
                    SELECT 1
                    FROM [SalesCommissions]
                    GROUP BY [MerchantPaymentId]
                    HAVING COUNT_BIG(*) > 1
                )
                BEGIN
                    THROW 51031, 'Duplicate merchant-payment commission history exists. Run diagnose-phase3b-sales-commissions.sql before applying this migration.', 1;
                END;
                """);

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantPaymentId",
                table: "SalesCommissions");

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "Salespersons",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "MerchantPaymentId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "MerchantOrderId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<decimal>(
                name: "CommissionPercentageSnapshot",
                table: "SalesCommissions",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "decimal(5,2)",
                oldPrecision: 5,
                oldScale: 2);

            migrationBuilder.AddColumn<decimal>(
                name: "CommissionFixedAmountSnapshot",
                table: "SalesCommissions",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CommissionRuleEffectiveFromSnapshot",
                table: "SalesCommissions",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CommissionRuleId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CommissionType",
                table: "SalesCommissions",
                type: "nvarchar(48)",
                maxLength: 48,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceType",
                table: "SalesCommissions",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TagOrderId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE [SalesCommissions]
                SET [SourceType] = N'MerchantOrder',
                    [CommissionType] = N'MerchantOrderPercentage';
                """);

            migrationBuilder.AlterColumn<string>(
                name: "CommissionType",
                table: "SalesCommissions",
                type: "nvarchar(48)",
                maxLength: 48,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(48)",
                oldMaxLength: 48,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "SourceType",
                table: "SalesCommissions",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "CommissionRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommissionType = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Percentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    FixedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    MinQuantity = table.Column<int>(type: "int", nullable: true),
                    MaxQuantity = table.Column<int>(type: "int", nullable: true),
                    EligibilityMonths = table.Column<int>(type: "int", nullable: true),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    EffectiveFrom = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EffectiveTo = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommissionRules", x => x.Id);
                    table.CheckConstraint("CK_CommissionRules_EffectiveRange", "[EffectiveTo] IS NULL OR [EffectiveTo] > [EffectiveFrom]");
                    table.CheckConstraint("CK_CommissionRules_QuantityRange", "([MinQuantity] IS NULL OR [MinQuantity] > 0) AND ([MaxQuantity] IS NULL OR [MaxQuantity] > 0) AND ([MinQuantity] IS NULL OR [MaxQuantity] IS NULL OR [MinQuantity] <= [MaxQuantity])");
                    table.CheckConstraint("CK_CommissionRules_ValueShape", "([Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [Percentage] BETWEEN 0 AND 100) OR ([Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [FixedAmount] >= 0)");
                    table.ForeignKey(
                        name: "FK_CommissionRules_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommissionRules_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "CommissionRules",
                columns: new[] { "Id", "CommissionType", "CreatedAt", "Currency", "EffectiveFrom", "EffectiveTo", "EligibilityMonths", "FixedAmount", "IsActive", "MaxQuantity", "MinQuantity", "Notes", "Percentage", "SalespersonId", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[] { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b01"), "DirectRetailPercentage", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, null, true, null, null, "Default direct retail commission", 15m, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });

            migrationBuilder.CreateIndex(
                name: "IX_Salespersons_UserId",
                table: "Salespersons",
                column: "UserId",
                unique: true,
                filter: "[UserId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_CommissionRuleId",
                table: "SalesCommissions",
                column: "CommissionRuleId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantOrderId_CommissionType",
                table: "SalesCommissions",
                columns: new[] { "MerchantOrderId", "CommissionType" },
                unique: true,
                filter: "[MerchantOrderId] IS NOT NULL AND [Status] <> 'Reversed'");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantPaymentId_CommissionType",
                table: "SalesCommissions",
                columns: new[] { "MerchantPaymentId", "CommissionType" },
                unique: true,
                filter: "[MerchantPaymentId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_TagOrderId_CommissionType",
                table: "SalesCommissions",
                columns: new[] { "TagOrderId", "CommissionType" },
                unique: true,
                filter: "[TagOrderId] IS NOT NULL AND [Status] <> 'Reversed'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions",
                sql: "([CommissionType] = 'MerchantOrderPercentage' AND [SourceType] = 'MerchantOrder') OR ([CommissionType] = 'DirectRetailPercentage' AND [SourceType] = 'TagOrder') OR [CommissionType] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions",
                sql: "([SourceType] = 'MerchantOrder' AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = 'TagOrder' AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_ValueShape",
                table: "SalesCommissions",
                sql: "([CommissionPercentageSnapshot] IS NOT NULL AND [CommissionFixedAmountSnapshot] IS NULL) OR ([CommissionPercentageSnapshot] IS NULL AND [CommissionFixedAmountSnapshot] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_CommissionType_IsActive_EffectiveFrom",
                table: "CommissionRules",
                columns: new[] { "CommissionType", "IsActive", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom",
                table: "CommissionRules",
                columns: new[] { "CommissionType", "SalespersonId", "EffectiveFrom" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_SalespersonId",
                table: "CommissionRules",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_UpdatedByAdminUserId",
                table: "CommissionRules",
                column: "UpdatedByAdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_CommissionRules_CommissionRuleId",
                table: "SalesCommissions",
                column: "CommissionRuleId",
                principalTable: "CommissionRules",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_TagOrders_TagOrderId",
                table: "SalesCommissions",
                column: "TagOrderId",
                principalTable: "TagOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Salespersons_Users_UserId",
                table: "Salespersons",
                column: "UserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_CommissionRules_CommissionRuleId",
                table: "SalesCommissions");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_TagOrders_TagOrderId",
                table: "SalesCommissions");

            migrationBuilder.DropForeignKey(
                name: "FK_Salespersons_Users_UserId",
                table: "Salespersons");

            migrationBuilder.DropTable(
                name: "CommissionRules");

            migrationBuilder.DropIndex(
                name: "IX_Salespersons_UserId",
                table: "Salespersons");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_CommissionRuleId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantOrderId_CommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantPaymentId_CommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_TagOrderId_CommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_ValueShape",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Salespersons");

            migrationBuilder.DropColumn(
                name: "CommissionFixedAmountSnapshot",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "CommissionRuleEffectiveFromSnapshot",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "CommissionRuleId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "CommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "SourceType",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "TagOrderId",
                table: "SalesCommissions");

            migrationBuilder.AlterColumn<Guid>(
                name: "MerchantPaymentId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "MerchantOrderId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "CommissionPercentageSnapshot",
                table: "SalesCommissions",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 0m,
                oldClrType: typeof(decimal),
                oldType: "decimal(5,2)",
                oldPrecision: 5,
                oldScale: 2,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions",
                column: "MerchantOrderId",
                unique: true,
                filter: "[Status] <> 'Reversed'");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantPaymentId",
                table: "SalesCommissions",
                column: "MerchantPaymentId",
                unique: true);
        }
    }
}
