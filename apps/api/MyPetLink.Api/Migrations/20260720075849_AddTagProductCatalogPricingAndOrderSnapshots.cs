using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTagProductCatalogPricingAndOrderSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "TagOrders",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductVariantId",
                table: "SmartTags",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "SmartTags",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductVariantId",
                table: "SmartTagBatches",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Promotions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    InternalDescription = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DisplayLabel = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsAutomatic = table.Column<bool>(type: "bit", nullable: false),
                    DiscountType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DiscountValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Promotions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TagProducts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    ShortDescription = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    IsPublished = table.Column<bool>(type: "bit", nullable: false),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagProducts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TagProductVariants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublicKey = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Sku = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    SupportsQr = table.Column<bool>(type: "bit", nullable: false),
                    SupportsNfc = table.Column<bool>(type: "bit", nullable: false),
                    TagVariant = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    WidthMm = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    HeightMm = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    ThicknessMm = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    WeightGrams = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    Material = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    Shape = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Colour = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    PackagingType = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    BasePrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    CompareAtPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    PrintTemplateCode = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    ProductionNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsPurchasable = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagProductVariants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagProductVariants_TagProducts_TagProductId",
                        column: x => x.TagProductId,
                        principalTable: "TagProducts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PromotionVariants",
                columns: table => new
                {
                    PromotionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromotionVariants", x => new { x.PromotionId, x.TagProductVariantId });
                    table.ForeignKey(
                        name: "FK_PromotionVariants_Promotions_PromotionId",
                        column: x => x.PromotionId,
                        principalTable: "Promotions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PromotionVariants_TagProductVariants_TagProductVariantId",
                        column: x => x.TagProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TagOrderItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SkuSnapshot = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    VariantNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    UnitBasePrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    Subtotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PromotionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PromotionNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    FinalUnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    FinalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagOrderItems_Promotions_PromotionId",
                        column: x => x.PromotionId,
                        principalTable: "Promotions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrderItems_TagOrders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "TagOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrderItems_TagProductVariants_ProductVariantId",
                        column: x => x.ProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TagProductMedia",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    AltText = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagProductMedia", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagProductMedia_MediaFiles_MediaFileId",
                        column: x => x.MediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagProductMedia_TagProductVariants_TagProductVariantId",
                        column: x => x.TagProductVariantId,
                        principalTable: "TagProductVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagProductMedia_TagProducts_TagProductId",
                        column: x => x.TagProductId,
                        principalTable: "TagProducts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_ProductVariantId",
                table: "SmartTags",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_ProductVariantId",
                table: "SmartTagBatches",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_Promotions_IsActive_IsAutomatic_StartsAt_EndsAt",
                table: "Promotions",
                columns: new[] { "IsActive", "IsAutomatic", "StartsAt", "EndsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Promotions_Priority",
                table: "Promotions",
                column: "Priority");

            migrationBuilder.CreateIndex(
                name: "IX_Promotions_UpdatedAt",
                table: "Promotions",
                column: "UpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionVariants_TagProductVariantId",
                table: "PromotionVariants",
                column: "TagProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItems_OrderId",
                table: "TagOrderItems",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItems_ProductVariantId",
                table: "TagOrderItems",
                column: "ProductVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrderItems_PromotionId",
                table: "TagOrderItems",
                column: "PromotionId");

            migrationBuilder.CreateIndex(
                name: "IX_TagProductMedia_MediaFileId",
                table: "TagProductMedia",
                column: "MediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_TagProductMedia_TagProductId_SortOrder",
                table: "TagProductMedia",
                columns: new[] { "TagProductId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TagProductMedia_TagProductVariantId_SortOrder",
                table: "TagProductMedia",
                columns: new[] { "TagProductVariantId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TagProducts_IsPublished_IsArchived_SortOrder",
                table: "TagProducts",
                columns: new[] { "IsPublished", "IsArchived", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_TagProducts_Slug",
                table: "TagProducts",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagProducts_UpdatedAt",
                table: "TagProducts",
                column: "UpdatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_IsActive_IsPurchasable_ArchivedAt",
                table: "TagProductVariants",
                columns: new[] { "IsActive", "IsPurchasable", "ArchivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_PublicKey",
                table: "TagProductVariants",
                column: "PublicKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_Sku",
                table: "TagProductVariants",
                column: "Sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_SupportsQr_SupportsNfc",
                table: "TagProductVariants",
                columns: new[] { "SupportsQr", "SupportsNfc" });

            migrationBuilder.CreateIndex(
                name: "IX_TagProductVariants_TagProductId",
                table: "TagProductVariants",
                column: "TagProductId");

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTagBatches_TagProductVariants_ProductVariantId",
                table: "SmartTagBatches",
                column: "ProductVariantId",
                principalTable: "TagProductVariants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTags_TagProductVariants_ProductVariantId",
                table: "SmartTags",
                column: "ProductVariantId",
                principalTable: "TagProductVariants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SmartTagBatches_TagProductVariants_ProductVariantId",
                table: "SmartTagBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_TagProductVariants_ProductVariantId",
                table: "SmartTags");

            migrationBuilder.DropTable(
                name: "PromotionVariants");

            migrationBuilder.DropTable(
                name: "TagOrderItems");

            migrationBuilder.DropTable(
                name: "TagProductMedia");

            migrationBuilder.DropTable(
                name: "Promotions");

            migrationBuilder.DropTable(
                name: "TagProductVariants");

            migrationBuilder.DropTable(
                name: "TagProducts");

            migrationBuilder.DropIndex(
                name: "IX_SmartTags_ProductVariantId",
                table: "SmartTags");

            migrationBuilder.DropIndex(
                name: "IX_SmartTagBatches_ProductVariantId",
                table: "SmartTagBatches");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ProductVariantId",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "SmartTags");

            migrationBuilder.DropColumn(
                name: "ProductVariantId",
                table: "SmartTagBatches");
        }
    }
}
