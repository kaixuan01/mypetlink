using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentAgreementDocuments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsignmentAgreementDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AgreementVersion = table.Column<int>(type: "int", nullable: false),
                    IssueNumber = table.Column<int>(type: "int", nullable: false),
                    TermsFingerprint = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    ContentSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    IssuedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentAgreementDocuments", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentAgreementDocument_Issue", "[IssueNumber] > 0 AND [AgreementVersion] > 0");
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreementDocuments_AdminUsers_IssuedByAdminUserId",
                        column: x => x.IssuedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreementDocuments_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentAgreementDocuments_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentSignedAgreements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementVersion = table.Column<int>(type: "int", nullable: false),
                    IssuedDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TermsFingerprint = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    Sha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    PartnerSignatoryName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PartnerSignatoryDesignation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PartnerSignedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    CompanySignatoryName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CompanySignatoryDesignation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CompanySignedOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    UploadedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UploadedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentSignedAgreements", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentSignedAgreement_File", "[FileSize] > 0 AND [ContentType] IN ('application/pdf','image/jpeg','image/png')");
                    table.ForeignKey(
                        name: "FK_ConsignmentSignedAgreements_AdminUsers_UploadedByAdminUserId",
                        column: x => x.UploadedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSignedAgreements_ConsignmentAgreementDocuments_IssuedDocumentId",
                        column: x => x.IssuedDocumentId,
                        principalTable: "ConsignmentAgreementDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSignedAgreements_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentSignedAgreements_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreementDocuments_AgreementId_IssueNumber",
                table: "ConsignmentAgreementDocuments",
                columns: new[] { "AgreementId", "IssueNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreementDocuments_IssuedByAdminUserId",
                table: "ConsignmentAgreementDocuments",
                column: "IssuedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentAgreementDocuments_MerchantId",
                table: "ConsignmentAgreementDocuments",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSignedAgreements_AgreementId_UploadedAt",
                table: "ConsignmentSignedAgreements",
                columns: new[] { "AgreementId", "UploadedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSignedAgreements_IssuedDocumentId",
                table: "ConsignmentSignedAgreements",
                column: "IssuedDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSignedAgreements_MerchantId",
                table: "ConsignmentSignedAgreements",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentSignedAgreements_UploadedByAdminUserId",
                table: "ConsignmentSignedAgreements",
                column: "UploadedByAdminUserId");

            // What was issued to a partner and what the partner signed are evidence: never edited or deleted.
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentAgreementDocuments_AppendOnly ON ConsignmentAgreementDocuments
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51054, ''Issued and signed consignment agreements are append-only.'', 1;
                END;');
                """);
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentSignedAgreements_AppendOnly ON ConsignmentSignedAgreements
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51054, ''Issued and signed consignment agreements are append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back is only possible before any agreement has been issued or signed.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentAgreementDocuments WITH(TABLOCKX,HOLDLOCK))
                   OR EXISTS(SELECT 1 FROM ConsignmentSignedAgreements WITH(TABLOCKX,HOLDLOCK))
                    THROW 51055, 'Consignment rollback blocked: retain issued agreements and signed partner copies.', 1;
                """);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentSignedAgreements_AppendOnly;");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_ConsignmentAgreementDocuments_AppendOnly;");
            migrationBuilder.DropTable(
                name: "ConsignmentSignedAgreements");

            migrationBuilder.DropTable(
                name: "ConsignmentAgreementDocuments");
        }
    }
}
