using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class EnforceDocumentSignatureOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every signed Delivery Order already on file must carry its signer's own signature. If one
            // doesn't, stop and change nothing: ownership is never guessed, reassigned or rewritten.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentDeliveryOrders o WITH(UPDLOCK,HOLDLOCK)
                    LEFT JOIN DocumentSignatures s WITH(UPDLOCK,HOLDLOCK) ON s.Id = o.SignatureId
                    WHERE o.SignatureId IS NOT NULL
                        AND (s.Id IS NULL OR o.SignedByAdminUserId IS NULL OR o.SignedByAdminUserId <> s.SignatoryAdminUserId))
                    THROW 51065, 'Signature ownership blocked: a signed Delivery Order carries another administrator''s signature. Review those rows; nothing was changed.', 1;
                """);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_DocumentSignatures_Id_SignatoryAdminUserId",
                table: "DocumentSignatures",
                columns: new[] { "Id", "SignatoryAdminUserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentDeliveryOrders_SignatureId_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders",
                columns: new[] { "SignatureId", "SignedByAdminUserId" });

            migrationBuilder.AddForeignKey(
                name: "FK_ConsignmentDeliveryOrders_DocumentSignatures_SignatureOwner",
                table: "ConsignmentDeliveryOrders",
                columns: new[] { "SignatureId", "SignedByAdminUserId" },
                principalTable: "DocumentSignatures",
                principalColumns: new[] { "Id", "SignatoryAdminUserId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Once a signature has been saved, the ownership rule stays: rolling back further would
            // otherwise leave signed history behind without it when an earlier step refuses.
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM DocumentSignatures WITH(TABLOCKX,HOLDLOCK))
                    OR EXISTS(SELECT 1 FROM ConsignmentDeliveryOrders WITH(TABLOCKX,HOLDLOCK) WHERE SignatureId IS NOT NULL)
                    THROW 51066, 'Signature ownership rollback blocked: retain the ownership rule for saved signatures and signed Delivery Orders.', 1;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentDeliveryOrders_DocumentSignatures_SignatureOwner",
                table: "ConsignmentDeliveryOrders");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_DocumentSignatures_Id_SignatoryAdminUserId",
                table: "DocumentSignatures");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentDeliveryOrders_SignatureId_SignedByAdminUserId",
                table: "ConsignmentDeliveryOrders");
        }
    }
}
