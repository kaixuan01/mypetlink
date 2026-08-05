using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantBillingDomain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MerchantInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Seller_BrandName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_LegalBusinessName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Seller_BusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Seller_TaxIdentificationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_SstRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Seller_AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    Seller_Postcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Seller_City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_State = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_Country = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Seller_SupportEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    Seller_BusinessPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Seller_BusinessWebsite = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_PaymentInstructions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Seller_BankAccountName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_BankName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Seller_BankAccountNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_DuitNowDisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    MerchantCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MerchantLegalNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MerchantTradingNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    MerchantRegistrationNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    MerchantTaxIdentificationNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    MerchantSstRegistrationNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ContactPersonSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ContactEmailSnapshot = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    ContactPhoneSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    BillingAddressLine1Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    BillingAddressLine2Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    BillingPostcodeSnapshot = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    BillingCitySnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingStateSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingCountrySnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    MerchantOrderNumberSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    SourceQuotationNumberSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: true),
                    InvoiceDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DueDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PaymentTermSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    MerchandiseSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PaidAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    InternalNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantInvoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantInvoices_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantInvoices_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantInvoiceItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SkuCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OptionNameSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SupportsQrSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    SupportsNfcSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    WholesaleUnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantInvoiceItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantInvoiceItems_MerchantInvoices_MerchantInvoiceId",
                        column: x => x.MerchantInvoiceId,
                        principalTable: "MerchantInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MerchantPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AmountReceived = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Method = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    TransactionReference = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    InternalNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PaymentProofMediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantPayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantPayments_AdminUsers_RecordedByAdminUserId",
                        column: x => x.RecordedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantPayments_MediaFiles_PaymentProofMediaFileId",
                        column: x => x.PaymentProofMediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantPayments_MerchantInvoices_MerchantInvoiceId",
                        column: x => x.MerchantInvoiceId,
                        principalTable: "MerchantInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantPayments_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReceiptNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantPaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Seller_BrandName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_LegalBusinessName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Seller_BusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Seller_TaxIdentificationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_SstRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    Seller_AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    Seller_Postcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Seller_City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_State = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Seller_Country = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Seller_SupportEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    Seller_BusinessPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Seller_BusinessWebsite = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_PaymentInstructions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Seller_BankAccountName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Seller_BankName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Seller_BankAccountNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Seller_DuitNowDisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    MerchantLegalNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    MerchantTradingNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    MerchantRegistrationNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    MerchantTaxIdentificationNumberSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ContactPersonSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ContactEmailSnapshot = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    BillingAddressLine1Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    BillingAddressLine2Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    BillingPostcodeSnapshot = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    BillingCitySnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingStateSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingCountrySnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    InvoiceNumberSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantOrderNumberSnapshot = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    PaymentDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    TransactionReference = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    MerchandiseSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    AmountPaid = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IssuedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantReceipts_MerchantInvoices_MerchantInvoiceId",
                        column: x => x.MerchantInvoiceId,
                        principalTable: "MerchantInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantReceipts_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantReceipts_MerchantPayments_MerchantPaymentId",
                        column: x => x.MerchantPaymentId,
                        principalTable: "MerchantPayments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantReceipts_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SalesCommissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantPaymentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    CommissionPercentageSnapshot = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    CommissionBaseAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CommissionAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CalculatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PaidAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReversedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    InternalNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalesCommissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SalesCommissions_MerchantOrders_MerchantOrderId",
                        column: x => x.MerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesCommissions_MerchantPayments_MerchantPaymentId",
                        column: x => x.MerchantPaymentId,
                        principalTable: "MerchantPayments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SalesCommissions_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantReceiptItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantReceiptId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SkuCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OptionNameSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    WholesaleUnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantReceiptItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantReceiptItems_MerchantReceipts_MerchantReceiptId",
                        column: x => x.MerchantReceiptId,
                        principalTable: "MerchantReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantInvoiceItems_MerchantInvoiceId",
                table: "MerchantInvoiceItems",
                column: "MerchantInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantInvoices_InvoiceNumber",
                table: "MerchantInvoices",
                column: "InvoiceNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantInvoices_MerchantId",
                table: "MerchantInvoices",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantInvoices_MerchantOrderId",
                table: "MerchantInvoices",
                column: "MerchantOrderId",
                unique: true,
                filter: "[Status] <> 'Cancelled'");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantInvoices_Status_InvoiceDate",
                table: "MerchantInvoices",
                columns: new[] { "Status", "InvoiceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantPayments_MerchantInvoiceId",
                table: "MerchantPayments",
                column: "MerchantInvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantPayments_MerchantOrderId",
                table: "MerchantPayments",
                column: "MerchantOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantPayments_PaymentProofMediaFileId",
                table: "MerchantPayments",
                column: "PaymentProofMediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantPayments_RecordedByAdminUserId",
                table: "MerchantPayments",
                column: "RecordedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceiptItems_MerchantReceiptId",
                table: "MerchantReceiptItems",
                column: "MerchantReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceipts_MerchantId",
                table: "MerchantReceipts",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceipts_MerchantInvoiceId",
                table: "MerchantReceipts",
                column: "MerchantInvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceipts_MerchantOrderId",
                table: "MerchantReceipts",
                column: "MerchantOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceipts_MerchantPaymentId",
                table: "MerchantReceipts",
                column: "MerchantPaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantReceipts_ReceiptNumber",
                table: "MerchantReceipts",
                column: "ReceiptNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantOrderId",
                table: "SalesCommissions",
                column: "MerchantOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_MerchantPaymentId",
                table: "SalesCommissions",
                column: "MerchantPaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalesCommissions_SalespersonId_Status",
                table: "SalesCommissions",
                columns: new[] { "SalespersonId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MerchantInvoiceItems");

            migrationBuilder.DropTable(
                name: "MerchantReceiptItems");

            migrationBuilder.DropTable(
                name: "SalesCommissions");

            migrationBuilder.DropTable(
                name: "MerchantReceipts");

            migrationBuilder.DropTable(
                name: "MerchantPayments");

            migrationBuilder.DropTable(
                name: "MerchantInvoices");
        }
    }
}
