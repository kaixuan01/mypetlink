using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminPaymentAndPetProfileQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Pets_Species",
                table: "Pets",
                column: "Species");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_UpdatedAt",
                table: "Pets",
                column: "UpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_PaymentReference",
                table: "PaymentProofs",
                column: "PaymentReference");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_ReviewedAt",
                table: "PaymentProofs",
                column: "ReviewedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_Status_UploadedAt",
                table: "PaymentProofs",
                columns: new[] { "Status", "UploadedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_UpdatedAt",
                table: "PaymentProofs",
                column: "UpdatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Pets_Species",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_Pets_UpdatedAt",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_PaymentProofs_PaymentReference",
                table: "PaymentProofs");

            migrationBuilder.DropIndex(
                name: "IX_PaymentProofs_ReviewedAt",
                table: "PaymentProofs");

            migrationBuilder.DropIndex(
                name: "IX_PaymentProofs_Status_UploadedAt",
                table: "PaymentProofs");

            migrationBuilder.DropIndex(
                name: "IX_PaymentProofs_UpdatedAt",
                table: "PaymentProofs");
        }
    }
}
