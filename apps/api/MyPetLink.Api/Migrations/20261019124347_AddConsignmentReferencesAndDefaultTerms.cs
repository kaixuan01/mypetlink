using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentReferencesAndDefaultTerms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreationKey",
                table: "ConsignmentAgreements",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreationRequestFingerprint",
                table: "ConsignmentAgreements",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultTermsRevision",
                table: "ConsignmentAgreements",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentDefaultTerms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    PartnerCommissionPercentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    TrialDurationDays = table.Column<int>(type: "int", nullable: true),
                    DurationTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SettlementFrequency = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PaymentDeadlineDays = table.Column<int>(type: "int", nullable: true),
                    DiscountTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ReturnTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    LossTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDefaultTerms", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentDefaultTerms_Active", "[IsActive] = 0 OR ([PartnerCommissionPercentage] IS NOT NULL AND [TrialDurationDays] IS NOT NULL AND [PaymentDeadlineDays] IS NOT NULL AND [DurationTerms] IS NOT NULL AND [SettlementFrequency] IS NOT NULL AND [DiscountTerms] IS NOT NULL AND [ReturnTerms] IS NOT NULL AND [LossTerms] IS NOT NULL)");
                    table.CheckConstraint("CK_ConsignmentDefaultTerms_Singleton", "[Id] = 1");
                    table.CheckConstraint("CK_ConsignmentDefaultTerms_Values", "([PartnerCommissionPercentage] IS NULL OR [PartnerCommissionPercentage] BETWEEN 0 AND 100) AND ([TrialDurationDays] IS NULL OR [TrialDurationDays] BETWEEN 1 AND 3650) AND ([PaymentDeadlineDays] IS NULL OR [PaymentDeadlineDays] BETWEEN 0 AND 365)");
                    table.ForeignKey(
                        name: "FK_ConsignmentDefaultTerms_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentDefaultTermsRevisions",
                columns: table => new
                {
                    Revision = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    PartnerCommissionPercentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    TrialDurationDays = table.Column<int>(type: "int", nullable: true),
                    DurationTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SettlementFrequency = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PaymentDeadlineDays = table.Column<int>(type: "int", nullable: true),
                    DiscountTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ReturnTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    LossTerms = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentDefaultTermsRevisions", x => x.Revision);
                    table.ForeignKey(
                        name: "FK_ConsignmentDefaultTermsRevisions_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentPartnerPrefixes",
                columns: table => new
                {
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Prefix = table.Column<string>(type: "nvarchar(12)", maxLength: 12, nullable: false),
                    LockedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentPartnerPrefixes", x => x.MerchantId);
                    table.CheckConstraint("CK_ConsignmentPartnerPrefix_Format", "LEN([Prefix]) BETWEEN 2 AND 12 AND [Prefix] COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9]%' AND LEFT([Prefix],1) COLLATE Latin1_General_BIN LIKE '[A-Z]'");
                    table.ForeignKey(
                        name: "FK_ConsignmentPartnerPrefixes_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentPartnerPrefixes_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_CreationKey",
                table: "ConsignmentAgreements",
                column: "CreationKey",
                unique: true,
                filter: "[CreationKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_DefaultTermsRevision",
                table: "ConsignmentAgreements",
                column: "DefaultTermsRevision");

            // Two merchants sharing a hand-typed reference must be resolved by a person, not renamed here.
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM ConsignmentAgreements GROUP BY Reference, Version HAVING COUNT(*) > 1)
                    THROW 51056, 'Duplicate consignment agreement references exist across merchants. Review them before applying automatic references.', 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreements_Reference_Version",
                table: "ConsignmentAgreements",
                columns: new[] { "Reference", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDefaultTerms_UpdatedByAdminUserId",
                table: "ConsignmentDefaultTerms",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDefaultTermsRevisions_RecordedByAdminUserId",
                table: "ConsignmentDefaultTermsRevisions",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPartnerPrefixes_Prefix",
                table: "ConsignmentPartnerPrefixes",
                column: "Prefix",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPartnerPrefixes_UpdatedByAdminUserId",
                table: "ConsignmentPartnerPrefixes",
                column: "UpdatedByAdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentAgreements_ConsignmentDefaultTermsRevisions_DefaultTermsRevision",
                table: "ConsignmentAgreements",
                column: "DefaultTermsRevision",
                principalTable: "ConsignmentDefaultTermsRevisions",
                principalColumn: "Revision",
                onDelete: ReferentialAction.Restrict);

            // Suggested starting terms, stored inactive: nothing reaches a new agreement until an
            // administrator reviews and puts them in use in Agreement Settings.
            migrationBuilder.Sql("""
                INSERT INTO ConsignmentDefaultTermsRevisions (Revision, IsActive, PartnerCommissionPercentage, TrialDurationDays,
                    DurationTerms, SettlementFrequency, PaymentDeadlineDays, DiscountTerms, ReturnTerms, LossTerms, RecordedByAdminUserId, RecordedAt)
                VALUES (1, 0, 35.00, 60,
                    N'Initial trial of 60 calendar days from the effective start date. The agreement continues after the trial only by mutual written agreement; it does not renew automatically.',
                    N'Monthly, after the month''s partner sales are reconciled and confirmed by both parties.',
                    7,
                    N'The Partner sells only at selling prices and promotional prices approved in writing by MyPetLink.',
                    N'Unsold stock carries forward while this agreement is active. On termination, or as otherwise agreed in writing, unsold stock is physically returned to MyPetLink.',
                    N'Responsibility for lost or damaged stock is decided on evidence. Loss or damage caused by the Partner''s negligence is the Partner''s responsibility; manufacturing defects are MyPetLink''s responsibility.',
                    NULL, '2026-10-19T00:00:00+00:00');
                INSERT INTO ConsignmentDefaultTerms (Id, Revision, IsActive, PartnerCommissionPercentage, TrialDurationDays, DurationTerms,
                    SettlementFrequency, PaymentDeadlineDays, DiscountTerms, ReturnTerms, LossTerms, UpdatedByAdminUserId, UpdatedAt)
                SELECT 1, Revision, IsActive, PartnerCommissionPercentage, TrialDurationDays, DurationTerms, SettlementFrequency,
                    PaymentDeadlineDays, DiscountTerms, ReturnTerms, LossTerms, NULL, NULL
                FROM ConsignmentDefaultTermsRevisions WHERE Revision = 1;
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentDefaultTermsRevisions_AppendOnly ON ConsignmentDefaultTermsRevisions
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51057, ''Default agreement term revisions are append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Once a reference, prefix or default revision has been used, it is history.
            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM ConsignmentAgreements WITH (TABLOCKX, HOLDLOCK) WHERE CreationKey IS NOT NULL OR DefaultTermsRevision IS NOT NULL)
                   OR EXISTS (SELECT 1 FROM ConsignmentPartnerPrefixes WITH (TABLOCKX, HOLDLOCK) WHERE LockedAt IS NOT NULL)
                   OR EXISTS (SELECT 1 FROM ConsignmentDefaultTermsRevisions WITH (TABLOCKX, HOLDLOCK) WHERE Revision > 1)
                    THROW 51058, 'Consignment rollback blocked: retain automatic references, partner prefixes and default term revisions.', 1;
                """);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentDefaultTermsRevisions_AppendOnly;");
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentAgreements_ConsignmentDefaultTermsRevisions_DefaultTermsRevision",
                table: "ConsignmentAgreements");

            migrationBuilder.DropTable(
                name: "ConsignmentDefaultTerms");

            migrationBuilder.DropTable(
                name: "ConsignmentDefaultTermsRevisions");

            migrationBuilder.DropTable(
                name: "ConsignmentPartnerPrefixes");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentAgreements_CreationKey",
                table: "ConsignmentAgreements");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentAgreements_DefaultTermsRevision",
                table: "ConsignmentAgreements");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentAgreements_Reference_Version",
                table: "ConsignmentAgreements");

            migrationBuilder.DropColumn(
                name: "CreationKey",
                table: "ConsignmentAgreements");

            migrationBuilder.DropColumn(
                name: "CreationRequestFingerprint",
                table: "ConsignmentAgreements");

            migrationBuilder.DropColumn(
                name: "DefaultTermsRevision",
                table: "ConsignmentAgreements");
        }
    }
}
