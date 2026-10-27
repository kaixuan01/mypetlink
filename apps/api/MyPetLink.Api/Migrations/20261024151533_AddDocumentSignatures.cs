using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentSignatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SignatoryName",
                table: "ConsignmentDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SignatoryPosition",
                table: "ConsignmentDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SignatureId",
                table: "ConsignmentDeliveryOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SignatureImageSha256",
                table: "ConsignmentDeliveryOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SignedAt",
                table: "ConsignmentDeliveryOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DocumentSignatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignatoryAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignatoryName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SignatoryPosition = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Image = table.Column<byte[]>(type: "varbinary(max)", nullable: true),
                    ImageSha256 = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ImageWidth = table.Column<int>(type: "int", nullable: false),
                    ImageHeight = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndReason = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: true),
                    EndedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentSignatures", x => x.Id);
                    table.CheckConstraint("CK_DocumentSignature_Image", "[ImageWidth] > 0 AND [ImageHeight] > 0 AND LEN([ImageSha256]) = 64 AND [ImageSha256] NOT LIKE N'%[^0-9A-Fa-f]%'");
                    table.CheckConstraint("CK_DocumentSignature_Lifecycle", "([EndedAt] IS NULL AND [EndReason] IS NULL AND [EndedByAdminUserId] IS NULL AND [Image] IS NOT NULL) OR ([EndedAt] IS NOT NULL AND [EndReason] IS NOT NULL AND [EndedByAdminUserId] IS NOT NULL AND [Image] IS NULL AND CAST([EndReason] AS varbinary(32)) IN (CAST(N'Replaced' AS varbinary(32)), CAST(N'Removed' AS varbinary(32))))");
                    table.CheckConstraint("CK_DocumentSignature_Signatory", "LEN(REPLACE(REPLACE(REPLACE(REPLACE([SignatoryName], CHAR(9), N''), CHAR(10), N''), CHAR(13), N''), NCHAR(160), N'')) > 0 AND LEN(REPLACE(REPLACE(REPLACE(REPLACE([SignatoryPosition], CHAR(9), N''), CHAR(10), N''), CHAR(13), N''), NCHAR(160), N'')) > 0");
                    table.ForeignKey(
                        name: "FK_DocumentSignatures_AdminUsers_EndedByAdminUserId",
                        column: x => x.EndedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DocumentSignatures_AdminUsers_SignatoryAdminUserId",
                        column: x => x.SignatoryAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_SignatureId",
                table: "ConsignmentDeliveryOrders",
                column: "SignatureId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders",
                column: "SignedByAdminUserId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ConsignmentDeliveryOrder_Signature",
                table: "ConsignmentDeliveryOrders",
                sql: "([SignatureId] IS NULL AND [SignedByAdminUserId] IS NULL AND [SignedAt] IS NULL AND [SignatoryName] IS NULL AND [SignatoryPosition] IS NULL AND [SignatureImageSha256] IS NULL) OR ([SignatureId] IS NOT NULL AND [SignedByAdminUserId] IS NOT NULL AND [SignedAt] IS NOT NULL AND [SignatoryName] IS NOT NULL AND [SignatoryPosition] IS NOT NULL AND [SignatureImageSha256] IS NOT NULL AND [SignedByAdminUserId] = [IssuedByAdminUserId] AND [SignedAt] = [IssuedAt] AND LEN(REPLACE(REPLACE(REPLACE(REPLACE([SignatoryName], CHAR(9), N''), CHAR(10), N''), CHAR(13), N''), NCHAR(160), N'')) > 0 AND LEN(REPLACE(REPLACE(REPLACE(REPLACE([SignatoryPosition], CHAR(9), N''), CHAR(10), N''), CHAR(13), N''), NCHAR(160), N'')) > 0 AND LEN([SignatureImageSha256]) = 64 AND [SignatureImageSha256] NOT LIKE N'%[^0-9A-Fa-f]%')");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentSignatures_EndedByAdminUserId",
                table: "DocumentSignatures",
                column: "EndedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_DocumentSignatures_SignatoryAdminUserId",
                table: "DocumentSignatures",
                column: "SignatoryAdminUserId",
                unique: true,
                filter: "[EndedAt] IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDeliveryOrders_AdminUsers_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders",
                column: "SignedByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDeliveryOrders_DocumentSignatures_SignatureId",
                table: "ConsignmentDeliveryOrders",
                column: "SignatureId",
                principalTable: "DocumentSignatures",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // A saved signature version is never edited or deleted. The one change allowed is retiring
            // the current version once, which erases its image; every other column stays as saved.
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_DocumentSignatures_History ON DocumentSignatures
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    IF EXISTS(SELECT 1 FROM deleted d LEFT JOIN inserted i ON i.Id = d.Id
                        WHERE i.Id IS NULL OR d.EndedAt IS NOT NULL
                            OR i.SignatoryAdminUserId <> d.SignatoryAdminUserId OR i.SignatoryName <> d.SignatoryName
                            OR i.SignatoryPosition <> d.SignatoryPosition OR i.ImageSha256 <> d.ImageSha256
                            OR i.ImageWidth <> d.ImageWidth OR i.ImageHeight <> d.ImageHeight OR i.CreatedAt <> d.CreatedAt
                            OR (i.Image IS NOT NULL AND (d.Image IS NULL OR i.Image <> d.Image)))
                        THROW 51061, ''Saved signatures are never edited or deleted: save a new version instead.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back is only possible before anyone has saved a signature or signed a Delivery Order.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM DocumentSignatures WITH(TABLOCKX,HOLDLOCK))
                    OR EXISTS(SELECT 1 FROM ConsignmentDeliveryOrders WITH(TABLOCKX,HOLDLOCK) WHERE SignatureId IS NOT NULL)
                    THROW 51062, 'Signature rollback blocked: retain saved signatures and signed Delivery Orders.', 1;
                """);
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS TR_DocumentSignatures_History;");
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDeliveryOrders_AdminUsers_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDeliveryOrders_DocumentSignatures_SignatureId",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropTable(
                name: "DocumentSignatures");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDeliveryOrders_SignatureId",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDeliveryOrders_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ConsignmentDeliveryOrder_Signature",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignatoryName",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignatoryPosition",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignatureId",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignatureImageSha256",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignedAt",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders");
        }
    }
}
