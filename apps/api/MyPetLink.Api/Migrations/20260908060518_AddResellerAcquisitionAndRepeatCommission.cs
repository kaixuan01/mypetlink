using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddResellerAcquisitionAndRepeatCommission : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Phase 3B reserved the reseller enum values but never wrote them.
            // If an operator has introduced such financial history manually,
            // there is no safe way to infer a merchant plan or activation
            // relationship. Stop before changing the schema.
            migrationBuilder.Sql("""
                IF EXISTS (
                    SELECT 1
                    FROM [SalesCommissions]
                    WHERE [CommissionType] IN ('ResellerAcquisitionBonus', 'ResellerRepeatPercentage'))
                    THROW 51040, 'Phase 3C cannot continue: reseller commission history already exists. Run the Phase 3C diagnostic and review it manually.', 1;

                IF EXISTS (
                    SELECT 1
                    FROM [CommissionRules]
                    WHERE [CommissionType] <> 'DirectRetailPercentage')
                    THROW 51041, 'Phase 3C cannot continue: non-Phase-3B commission rules already exist. Run the Phase 3C diagnostic and reconcile them manually.', 1;

                IF EXISTS (
                    SELECT 1
                    FROM [SalesCommissions] commission
                    LEFT JOIN [MerchantOrders] merchantOrder ON merchantOrder.[Id] = commission.[MerchantOrderId]
                    LEFT JOIN [MerchantPayments] payment ON payment.[Id] = commission.[MerchantPaymentId]
                    WHERE commission.[SourceType] = 'MerchantOrder'
                      AND (merchantOrder.[Id] IS NULL
                           OR payment.[Id] IS NULL
                           OR payment.[MerchantOrderId] <> commission.[MerchantOrderId]))
                    THROW 51042, 'Phase 3C cannot continue: a merchant commission cannot be linked safely to its merchant.', 1;
                """);

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom",
                table: "CommissionRules");

            migrationBuilder.AddColumn<Guid>(
                name: "MerchantId",
                table: "SalesCommissions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AcquiredBySalespersonCodeSnapshot",
                table: "Merchants",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AcquiredBySalespersonId",
                table: "Merchants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AcquiredBySalespersonNameSnapshot",
                table: "Merchants",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AcquisitionAttributedAt",
                table: "Merchants",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CommissionPlan",
                table: "Merchants",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "LegacyPercentage");

            migrationBuilder.AddColumn<Guid>(
                name: "FirstQualifyingMerchantOrderId",
                table: "Merchants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FirstQualifyingPaidOrderAt",
                table: "Merchants",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RepeatCommissionEligibilityMonthsSnapshot",
                table: "Merchants",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RepeatCommissionEligibleUntil",
                table: "Merchants",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RepeatCommissionPercentageSnapshot",
                table: "Merchants",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RepeatCommissionRuleEffectiveFromSnapshot",
                table: "Merchants",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RepeatCommissionRuleIdSnapshot",
                table: "Merchants",
                type: "uniqueidentifier",
                nullable: true);

            // The order relationship is authoritative for existing merchant
            // commissions. Money, status, payout and reversal history are not
            // modified.
            migrationBuilder.Sql("""
                UPDATE commission
                SET commission.[MerchantId] = merchantOrder.[MerchantId]
                FROM [SalesCommissions] commission
                INNER JOIN [MerchantOrders] merchantOrder
                    ON merchantOrder.[Id] = commission.[MerchantOrderId]
                WHERE commission.[SourceType] = 'MerchantOrder';

                IF EXISTS (
                    SELECT 1 FROM [SalesCommissions]
                    WHERE [SourceType] = 'MerchantOrder' AND [MerchantId] IS NULL)
                    THROW 51043, 'Phase 3C cannot continue: not every merchant commission was backfilled with a merchant.', 1;
                """);

            migrationBuilder.InsertData(
                table: "CommissionRules",
                columns: new[] { "Id", "CommissionType", "CreatedAt", "Currency", "EffectiveFrom", "EffectiveTo", "EligibilityMonths", "FixedAmount", "IsActive", "MaxQuantity", "MinQuantity", "Notes", "Percentage", "SalespersonId", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[,]
                {
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b11"), "ResellerAcquisitionBonus", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 50m, true, 19, 10, "Default reseller acquisition tier: 10–19 units", null, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b12"), "ResellerAcquisitionBonus", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 80m, true, 49, 20, "Default reseller acquisition tier: 20–49 units", null, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b13"), "ResellerAcquisitionBonus", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 150m, true, 99, 50, "Default reseller acquisition tier: 50–99 units", null, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b14"), "ResellerAcquisitionBonus", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, null, 250m, true, null, 100, "Default reseller acquisition tier: 100+ units", null, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null },
                    { new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b20"), "ResellerRepeatPercentage", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "MYR", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, 3, null, true, null, null, "Default reseller repeat commission", 3m, null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantId_CommissionType",
                table: "SalesCommissions",
                columns: new[] { "MerchantId", "CommissionType" },
                unique: true,
                filter: "[MerchantId] IS NOT NULL AND [CommissionType] = 'ResellerAcquisitionBonus'");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions",
                sql: "([CommissionType] = 'MerchantOrderPercentage' AND [SourceType] = 'MerchantOrder') OR ([CommissionType] = 'DirectRetailPercentage' AND [SourceType] = 'TagOrder') OR ([CommissionType] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage') AND [SourceType] = 'MerchantOrder')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions",
                sql: "([SourceType] = 'MerchantOrder' AND [MerchantId] IS NOT NULL AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = 'TagOrder' AND [MerchantId] IS NULL AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_AcquiredBySalespersonId",
                table: "Merchants",
                column: "AcquiredBySalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_FirstQualifyingMerchantOrderId",
                table: "Merchants",
                column: "FirstQualifyingMerchantOrderId",
                unique: true,
                filter: "[FirstQualifyingMerchantOrderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_RepeatCommissionRuleIdSnapshot",
                table: "Merchants",
                column: "RepeatCommissionRuleIdSnapshot");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Merchants_AcquisitionActivationShape",
                table: "Merchants",
                sql: "([FirstQualifyingMerchantOrderId] IS NULL AND [FirstQualifyingPaidOrderAt] IS NULL AND [RepeatCommissionPercentageSnapshot] IS NULL AND [RepeatCommissionEligibilityMonthsSnapshot] IS NULL AND [RepeatCommissionEligibleUntil] IS NULL AND [RepeatCommissionRuleIdSnapshot] IS NULL AND [RepeatCommissionRuleEffectiveFromSnapshot] IS NULL AND [AcquiredBySalespersonCodeSnapshot] IS NULL AND [AcquiredBySalespersonNameSnapshot] IS NULL) OR ([FirstQualifyingMerchantOrderId] IS NOT NULL AND [FirstQualifyingPaidOrderAt] IS NOT NULL AND [AcquiredBySalespersonId] IS NOT NULL AND [RepeatCommissionPercentageSnapshot] IS NOT NULL AND [RepeatCommissionEligibilityMonthsSnapshot] > 0 AND [RepeatCommissionEligibleUntil] > [FirstQualifyingPaidOrderAt] AND [RepeatCommissionRuleIdSnapshot] IS NOT NULL AND [RepeatCommissionRuleEffectiveFromSnapshot] IS NOT NULL AND [AcquiredBySalespersonCodeSnapshot] IS NOT NULL AND [AcquiredBySalespersonNameSnapshot] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Merchants_AcquisitionAttribution",
                table: "Merchants",
                sql: "([AcquiredBySalespersonId] IS NULL AND [AcquisitionAttributedAt] IS NULL) OR ([AcquiredBySalespersonId] IS NOT NULL AND [AcquisitionAttributedAt] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Merchants_CommissionPlanShape",
                table: "Merchants",
                sql: "([CommissionPlan] = 'LegacyPercentage' AND [AcquiredBySalespersonId] IS NULL AND [FirstQualifyingMerchantOrderId] IS NULL) OR ([CommissionPlan] = 'AcquisitionAndRepeat')");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom_MinQuantity",
                table: "CommissionRules",
                columns: new[] { "CommissionType", "SalespersonId", "EffectiveFrom", "MinQuantity" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules",
                sql: "([CommissionType] = 'DirectRetailPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerAcquisitionBonus' AND [Percentage] IS NULL AND [FixedAmount] IS NOT NULL AND [MinQuantity] IS NOT NULL AND [EligibilityMonths] IS NULL) OR ([CommissionType] = 'ResellerRepeatPercentage' AND [Percentage] IS NOT NULL AND [FixedAmount] IS NULL AND [MinQuantity] IS NULL AND [MaxQuantity] IS NULL AND [EligibilityMonths] > 0)");

            migrationBuilder.AddForeignKey(
                name: "FK_Merchants_CommissionRules_RepeatCommissionRuleIdSnapshot",
                table: "Merchants",
                column: "RepeatCommissionRuleIdSnapshot",
                principalTable: "CommissionRules",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Merchants_MerchantOrders_FirstQualifyingMerchantOrderId",
                table: "Merchants",
                column: "FirstQualifyingMerchantOrderId",
                principalTable: "MerchantOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Merchants_Salespersons_AcquiredBySalespersonId",
                table: "Merchants",
                column: "AcquiredBySalespersonId",
                principalTable: "Salespersons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SalesCommissions_Merchants_MerchantId",
                table: "SalesCommissions",
                column: "MerchantId",
                principalTable: "Merchants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_CommissionRules_CommissionTypeShape",
                table: "CommissionRules");
            migrationBuilder.DropForeignKey(
                name: "FK_Merchants_CommissionRules_RepeatCommissionRuleIdSnapshot",
                table: "Merchants");

            migrationBuilder.DropForeignKey(
                name: "FK_Merchants_MerchantOrders_FirstQualifyingMerchantOrderId",
                table: "Merchants");

            migrationBuilder.DropForeignKey(
                name: "FK_Merchants_Salespersons_AcquiredBySalespersonId",
                table: "Merchants");

            migrationBuilder.DropForeignKey(
                name: "FK_SalesCommissions_Merchants_MerchantId",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_SalesCommissions_MerchantId_CommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_AcquiredBySalespersonId",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_FirstQualifyingMerchantOrderId",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_Merchants_RepeatCommissionRuleIdSnapshot",
                table: "Merchants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Merchants_AcquisitionActivationShape",
                table: "Merchants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Merchants_AcquisitionAttribution",
                table: "Merchants");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Merchants_CommissionPlanShape",
                table: "Merchants");

            migrationBuilder.DropIndex(
                name: "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom_MinQuantity",
                table: "CommissionRules");

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b11"));

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b12"));

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b13"));

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b14"));

            migrationBuilder.DeleteData(
                table: "CommissionRules",
                keyColumn: "Id",
                keyValue: new Guid("a971d6d5-86a8-4f85-a5e4-9cb85a1f3b20"));

            migrationBuilder.DropColumn(
                name: "MerchantId",
                table: "SalesCommissions");

            migrationBuilder.DropColumn(
                name: "AcquiredBySalespersonCodeSnapshot",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "AcquiredBySalespersonId",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "AcquiredBySalespersonNameSnapshot",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "AcquisitionAttributedAt",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "CommissionPlan",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "FirstQualifyingMerchantOrderId",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "FirstQualifyingPaidOrderAt",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "RepeatCommissionEligibilityMonthsSnapshot",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "RepeatCommissionEligibleUntil",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "RepeatCommissionPercentageSnapshot",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "RepeatCommissionRuleEffectiveFromSnapshot",
                table: "Merchants");

            migrationBuilder.DropColumn(
                name: "RepeatCommissionRuleIdSnapshot",
                table: "Merchants");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceCommissionType",
                table: "SalesCommissions",
                sql: "([CommissionType] = 'MerchantOrderPercentage' AND [SourceType] = 'MerchantOrder') OR ([CommissionType] = 'DirectRetailPercentage' AND [SourceType] = 'TagOrder') OR [CommissionType] IN ('ResellerAcquisitionBonus','ResellerRepeatPercentage')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SalesCommissions_SourceShape",
                table: "SalesCommissions",
                sql: "([SourceType] = 'MerchantOrder' AND [MerchantOrderId] IS NOT NULL AND [MerchantPaymentId] IS NOT NULL AND [TagOrderId] IS NULL) OR ([SourceType] = 'TagOrder' AND [TagOrderId] IS NOT NULL AND [MerchantOrderId] IS NULL AND [MerchantPaymentId] IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_CommissionRules_CommissionType_SalespersonId_EffectiveFrom",
                table: "CommissionRules",
                columns: new[] { "CommissionType", "SalespersonId", "EffectiveFrom" },
                unique: true);
        }
    }
}
