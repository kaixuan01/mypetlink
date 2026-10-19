using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class HardenConsignmentStocktakeReconciliation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CountedAfterCutoffNote",
                table: "ConsignmentStocktakes",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CountedAt",
                table: "ConsignmentStocktakes",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReversesResolutionId",
                table: "ConsignmentDiscrepancyResolutions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentDiscrepancyResolutions_LateReport",
                table: "ConsignmentDiscrepancyResolutions",
                columns: new[] { "DiscrepancyId", "LinkedSalesReportId" },
                unique: true,
                filter: "[Outcome] = 'ExplainedByLateReport' AND [LinkedSalesReportId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_ConsignmentDiscrepancyResolutions_Reverses",
                table: "ConsignmentDiscrepancyResolutions",
                column: "ReversesResolutionId",
                unique: true,
                filter: "[ReversesResolutionId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentDiscrepancyResolution_Withdrawal",
                table: "ConsignmentDiscrepancyResolutions",
                sql: "([Outcome] = 'AllocationWithdrawn' AND [ReversesResolutionId] IS NOT NULL) OR ([Outcome] <> 'AllocationWithdrawn' AND [ReversesResolutionId] IS NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentDiscrepancyResolutions_ReversesResolutionId",
                table: "ConsignmentDiscrepancyResolutions",
                column: "ReversesResolutionId",
                principalTable: "ConsignmentDiscrepancyResolutions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Closed history covers every write path: a line can be added, re-counted, moved or removed
            // only while its stocktake is a draft, and a recorded count keeps its details. Freezing at
            // approval changes only the book and closing figures. Approved stays immutable (51050).
            migrationBuilder.Sql("""
                EXEC(N'CREATE OR ALTER TRIGGER TR_ConsignmentStocktakeLines_Frozen ON ConsignmentStocktakeLines
                AFTER INSERT, UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE FrozenAt IS NOT NULL)
                        THROW 51049, ''An approved stocktake line is frozen.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.StocktakeId <> d.StocktakeId)
                        THROW 51052, ''A stocktake line cannot move to another stocktake.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN ConsignmentStocktakes s ON s.Id = i.StocktakeId
                               WHERE NOT EXISTS (SELECT 1 FROM deleted d WHERE d.Id = i.Id) AND (s.Status <> ''Draft'' OR i.FrozenAt IS NOT NULL))
                        THROW 51052, ''Lines can be added only to a draft stocktake.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id JOIN ConsignmentStocktakes s ON s.Id = i.StocktakeId
                               WHERE s.Status <> ''Draft'' AND EXISTS (
                                   SELECT i.ProductVariantId, i.SkuSnapshot, i.CountedSellable, i.CountedUnsellable, i.Notes
                                   EXCEPT SELECT d.ProductVariantId, d.SkuSnapshot, d.CountedSellable, d.CountedUnsellable, d.Notes))
                        THROW 51052, ''Only a draft stocktake can be re-counted.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN ConsignmentStocktakes s ON s.Id = i.StocktakeId
                               WHERE i.FrozenAt IS NOT NULL AND s.Status NOT IN (''Recorded'', ''Approved''))
                        THROW 51052, ''A stocktake line is frozen only when its stocktake closes the month.'', 1;
                    IF EXISTS (SELECT 1 FROM deleted d JOIN ConsignmentStocktakes s ON s.Id = d.StocktakeId
                               WHERE s.Status <> ''Draft'' AND NOT EXISTS (SELECT 1 FROM inserted i WHERE i.Id = d.Id))
                        THROW 51052, ''Lines can be removed only from a draft stocktake.'', 1;
                END;');
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE OR ALTER TRIGGER TR_ConsignmentStocktakes_Closed ON ConsignmentStocktakes
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE Status = ''Approved'')
                        THROW 51050, ''An approved stocktake is a closed month and cannot change.'', 1;
                    IF EXISTS (SELECT 1 FROM deleted WHERE Status = ''Voided'')
                        THROW 51052, ''A discarded stocktake cannot change.'', 1;
                    IF EXISTS (SELECT 1 FROM deleted WHERE Status = ''Recorded'' AND Id NOT IN (SELECT Id FROM inserted))
                        THROW 51052, ''A recorded stocktake cannot be removed. Discard it instead.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id
                               WHERE d.Status <> ''Draft'' AND (i.Status = ''Draft'' OR EXISTS (
                                   SELECT i.MerchantId, i.MerchantBranchId, i.CutoffAt, i.CountedAt, i.CountedAfterCutoffNote, i.CountedBy, i.EvidenceKind, i.EvidenceReference
                                   EXCEPT SELECT d.MerchantId, d.MerchantBranchId, d.CutoffAt, d.CountedAt, d.CountedAfterCutoffNote, d.CountedBy, d.EvidenceKind, d.EvidenceReference)))
                        THROW 51052, ''A recorded stocktake keeps its count details. Discard it and count again.'', 1;
                    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Status = ''Approved'' AND d.Status <> ''Recorded'')
                        THROW 51052, ''Only a recorded stocktake can close its month.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Count times and withdrawn late-report explanations are part of the closed-month record.
            // Rolling back is only possible before any exist. Each migration guards itself, and a
            // multi-step downgrade is not atomic: check the migration history after any refusal.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentStocktakes WITH(TABLOCKX,HOLDLOCK) WHERE CountedAt IS NOT NULL OR CountedAfterCutoffNote IS NOT NULL)
                   OR EXISTS(SELECT 1 FROM ConsignmentDiscrepancyResolutions WITH(TABLOCKX,HOLDLOCK) WHERE ReversesResolutionId IS NOT NULL)
                    THROW 51053, 'Consignment rollback blocked: retain stocktake count times and late-report correction history.', 1;
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE OR ALTER TRIGGER TR_ConsignmentStocktakeLines_Frozen ON ConsignmentStocktakeLines
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE FrozenAt IS NOT NULL)
                        THROW 51049, ''An approved stocktake line is frozen.'', 1;
                END;');
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE OR ALTER TRIGGER TR_ConsignmentStocktakes_Closed ON ConsignmentStocktakes
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS (SELECT 1 FROM deleted WHERE Status = ''Approved'')
                        THROW 51050, ''An approved stocktake is a closed month and cannot change.'', 1;
                END;');
                """);
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDiscrepancyResolutions_ConsignmentDiscrepancyResolutions_ReversesResolutionId",
                table: "ConsignmentDiscrepancyResolutions");

            migrationBuilder.DropIndex(
                name: "UX_ConsignmentDiscrepancyResolutions_LateReport",
                table: "ConsignmentDiscrepancyResolutions");

            migrationBuilder.DropIndex(
                name: "UX_ConsignmentDiscrepancyResolutions_Reverses",
                table: "ConsignmentDiscrepancyResolutions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentDiscrepancyResolution_Withdrawal",
                table: "ConsignmentDiscrepancyResolutions");

            migrationBuilder.DropColumn(
                name: "CountedAfterCutoffNote",
                table: "ConsignmentStocktakes");

            migrationBuilder.DropColumn(
                name: "CountedAt",
                table: "ConsignmentStocktakes");

            migrationBuilder.DropColumn(
                name: "ReversesResolutionId",
                table: "ConsignmentDiscrepancyResolutions");
        }
    }
}
