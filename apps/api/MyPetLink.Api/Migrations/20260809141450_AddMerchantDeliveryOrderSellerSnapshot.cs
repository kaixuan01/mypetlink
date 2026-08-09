using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantDeliveryOrderSellerSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Seller_AddressLine1",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(240)",
                maxLength: 240,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_AddressLine2",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(240)",
                maxLength: 240,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankAccountName",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankAccountNumber",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BankName",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BrandName",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessPhone",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessRegistrationNumber",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_BusinessWebsite",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_City",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_Country",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_DuitNowDisplayName",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_LegalBusinessName",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_PaymentInstructions",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_Postcode",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_SstRegistrationNumber",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Seller_State",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_SupportEmail",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(254)",
                maxLength: 254,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Seller_TaxIdentificationNumber",
                table: "MerchantDeliveryOrders",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Seller_AddressLine1",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_AddressLine2",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BankAccountName",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BankAccountNumber",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BankName",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BrandName",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessPhone",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessRegistrationNumber",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_BusinessWebsite",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_City",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_Country",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_DuitNowDisplayName",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_LegalBusinessName",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_PaymentInstructions",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_Postcode",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_SstRegistrationNumber",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_State",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_SupportEmail",
                table: "MerchantDeliveryOrders");

            migrationBuilder.DropColumn(
                name: "Seller_TaxIdentificationNumber",
                table: "MerchantDeliveryOrders");
        }
    }
}
