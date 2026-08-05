using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMerchantSalesDomain : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DocumentNumberCounters",
                columns: table => new
                {
                    CounterKey = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    NextValue = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentNumberCounters", x => x.CounterKey);
                });

            migrationBuilder.CreateTable(
                name: "Salespersons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: true),
                    Phone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    DefaultCommissionPercentage = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Salespersons", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Merchants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    LegalBusinessName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    TradingName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    BusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    NormalizedBusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    TaxIdentificationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    SstRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ContactPerson = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ContactEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    ContactPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    BillingAddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    BillingAddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    BillingPostcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    BillingCity = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingState = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingCountry = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DeliveryAddressSameAsBilling = table.Column<bool>(type: "bit", nullable: false),
                    DeliveryAddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    DeliveryAddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    DeliveryPostcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DeliveryCity = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryState = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryCountry = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    AssignedSalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaymentTerm = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Merchants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Merchants_Salespersons_AssignedSalespersonId",
                        column: x => x.AssignedSalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SkuCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OptionNameSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SupportsQrSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    SupportsNfcSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    UnitWeightGramsSnapshot = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    WholesaleUnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantOrderItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MerchantOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MerchantOrderNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    SourceQuotationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    DeliveryAddressLine1Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    DeliveryAddressLine2Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    DeliveryPostcodeSnapshot = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DeliveryCitySnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryStateSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryCountrySnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    SalespersonCommissionPercentageSnapshot = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    PaymentTermSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    MerchandiseSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    FulfilmentStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    InternalNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    PaymentConfirmedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantOrders_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantOrders_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantQuotations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuotationNumber = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    MerchantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
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
                    DeliveryAddressLine1Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    DeliveryAddressLine2Snapshot = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    DeliveryPostcodeSnapshot = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DeliveryCitySnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryStateSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryCountrySnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    SalespersonCommissionPercentageSnapshot = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    QuotationDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ValidUntil = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    PaymentTermSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MerchandiseSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    GrandTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CustomerNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    InternalNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ConvertedMerchantOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SentAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AcceptedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RejectedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ExpiredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ConvertedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantQuotations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantQuotations_MerchantOrders_ConvertedMerchantOrderId",
                        column: x => x.ConvertedMerchantOrderId,
                        principalTable: "MerchantOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantQuotations_Merchants_MerchantId",
                        column: x => x.MerchantId,
                        principalTable: "Merchants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MerchantQuotations_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MerchantQuotationItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuotationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SkuCodeSnapshot = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OptionNameSnapshot = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SupportsQrSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    SupportsNfcSnapshot = table.Column<bool>(type: "bit", nullable: false),
                    UnitWeightGramsSnapshot = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    WholesaleUnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineDiscount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineSubtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MerchantQuotationItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MerchantQuotationItems_MerchantQuotations_QuotationId",
                        column: x => x.QuotationId,
                        principalTable: "MerchantQuotations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrderItems_MerchantOrderId",
                table: "MerchantOrderItems",
                column: "MerchantOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_MerchantId",
                table: "MerchantOrders",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_MerchantOrderNumber",
                table: "MerchantOrders",
                column: "MerchantOrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_PaymentStatus_CreatedAt",
                table: "MerchantOrders",
                columns: new[] { "PaymentStatus", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_SalespersonId",
                table: "MerchantOrders",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantOrders_SourceQuotationId",
                table: "MerchantOrders",
                column: "SourceQuotationId",
                unique: true,
                filter: "[SourceQuotationId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotationItems_QuotationId",
                table: "MerchantQuotationItems",
                column: "QuotationId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotations_ConvertedMerchantOrderId",
                table: "MerchantQuotations",
                column: "ConvertedMerchantOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotations_MerchantId",
                table: "MerchantQuotations",
                column: "MerchantId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotations_QuotationNumber",
                table: "MerchantQuotations",
                column: "QuotationNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotations_SalespersonId",
                table: "MerchantQuotations",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_MerchantQuotations_Status_QuotationDate",
                table: "MerchantQuotations",
                columns: new[] { "Status", "QuotationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_AssignedSalespersonId",
                table: "Merchants",
                column: "AssignedSalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_IsActive",
                table: "Merchants",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_MerchantCode",
                table: "Merchants",
                column: "MerchantCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Merchants_NormalizedBusinessRegistrationNumber",
                table: "Merchants",
                column: "NormalizedBusinessRegistrationNumber");

            migrationBuilder.CreateIndex(
                name: "IX_Salespersons_IsActive",
                table: "Salespersons",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_Salespersons_SalespersonCode",
                table: "Salespersons",
                column: "SalespersonCode",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_MerchantOrderItems_MerchantOrders_MerchantOrderId",
                table: "MerchantOrderItems",
                column: "MerchantOrderId",
                principalTable: "MerchantOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_MerchantOrders_MerchantQuotations_SourceQuotationId",
                table: "MerchantOrders",
                column: "SourceQuotationId",
                principalTable: "MerchantQuotations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MerchantQuotations_MerchantOrders_ConvertedMerchantOrderId",
                table: "MerchantQuotations");

            migrationBuilder.DropTable(
                name: "DocumentNumberCounters");

            migrationBuilder.DropTable(
                name: "MerchantOrderItems");

            migrationBuilder.DropTable(
                name: "MerchantQuotationItems");

            migrationBuilder.DropTable(
                name: "MerchantOrders");

            migrationBuilder.DropTable(
                name: "MerchantQuotations");

            migrationBuilder.DropTable(
                name: "Merchants");

            migrationBuilder.DropTable(
                name: "Salespersons");
        }
    }
}
