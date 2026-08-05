using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantDocumentsAndEmails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.AddColumn<string>(
                name: "Seller_AddressLine1",
                table: "MerchantQuotations",
                type: "nvarchar(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_AddressLine2",
                table: "MerchantQuotations",
                type: "nvarchar(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankAccountName",
                table: "MerchantQuotations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankAccountNumber",
                table: "MerchantQuotations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankName",
                table: "MerchantQuotations",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BrandName",
                table: "MerchantQuotations",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessPhone",
                table: "MerchantQuotations",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessRegistrationNumber",
                table: "MerchantQuotations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessWebsite",
                table: "MerchantQuotations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_City",
                table: "MerchantQuotations",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_Country",
                table: "MerchantQuotations",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_DuitNowDisplayName",
                table: "MerchantQuotations",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_LegalBusinessName",
                table: "MerchantQuotations",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_PaymentInstructions",
                table: "MerchantQuotations",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_Postcode",
                table: "MerchantQuotations",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_SstRegistrationNumber",
                table: "MerchantQuotations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_State",
                table: "MerchantQuotations",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_SupportEmail",
                table: "MerchantQuotations",
                type: "nvarchar(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_TaxIdentificationNumber",
                table: "MerchantQuotations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RelatedMerchantInvoiceId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RelatedMerchantQuotationId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedMerchantInvoiceId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedMerchantInvoiceId", "MessageType" },
                unique: true,
                filter: "[RelatedMerchantInvoiceId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedMerchantQuotationId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedMerchantQuotationId", "MessageType" },
                unique: true,
                filter: "[RelatedMerchantQuotationId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END) = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_EmailOutbox_MerchantInvoices_RelatedMerchantInvoiceId",
                table: "EmailOutbox",
                column: "RelatedMerchantInvoiceId",
                principalTable: "MerchantInvoices",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_EmailOutbox_MerchantQuotations_RelatedMerchantQuotationId",
                table: "EmailOutbox",
                column: "RelatedMerchantQuotationId",
                principalTable: "MerchantQuotations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EmailOutbox_MerchantInvoices_RelatedMerchantInvoiceId",
                table: "EmailOutbox");

            migrationBuilder.DropForeignKey(
                name: "FK_EmailOutbox_MerchantQuotations_RelatedMerchantQuotationId",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedMerchantInvoiceId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedMerchantQuotationId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "Seller_AddressLine1",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_AddressLine2",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BankAccountName",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BankAccountNumber",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BankName",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BrandName",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessPhone",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessRegistrationNumber",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessWebsite",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_City",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_Country",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_DuitNowDisplayName",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_LegalBusinessName",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_PaymentInstructions",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_Postcode",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_SstRegistrationNumber",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_State",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_SupportEmail",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "Seller_TaxIdentificationNumber",
                table: "MerchantQuotations");

            migrationBuilder.DropColumn(
                name: "RelatedMerchantInvoiceId",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "RelatedMerchantQuotationId",
                table: "EmailOutbox");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "([RelatedOrderId] IS NOT NULL AND [RelatedUserId] IS NULL) OR ([RelatedOrderId] IS NULL AND [RelatedUserId] IS NOT NULL)");
        }
    }
}
