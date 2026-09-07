using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOwnerReferralAttribution : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AttributedAt",
                table: "TagOrders",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttributionSource",
                table: "TagOrders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SalespersonCodeSnapshot",
                table: "TagOrders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SalespersonId",
                table: "TagOrders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SalespersonNameSnapshot",
                table: "TagOrders",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReferralCode",
                table: "Salespersons",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: true,
                collation: "Latin1_General_100_CI_AS");

            migrationBuilder.CreateTable(
                name: "OwnerReferralAttributions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SalespersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReferralCodeSnapshot = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    SalespersonCodeSnapshot = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SalespersonNameSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    AttributionSource = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CapturedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AttributedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OwnerReferralAttributions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OwnerReferralAttributions_Salespersons_SalespersonId",
                        column: x => x.SalespersonId,
                        principalTable: "Salespersons",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerReferralAttributions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_SalespersonId",
                table: "TagOrders",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_Salespersons_ReferralCode",
                table: "Salespersons",
                column: "ReferralCode",
                unique: true,
                filter: "[ReferralCode] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Salespersons_ReferralCode",
                table: "Salespersons",
                sql: "[ReferralCode] IS NULL OR ([ReferralCode] NOT IN ('ADMIN','API','LOGIN','WWW','AUTH') AND [ReferralCode] NOT LIKE '%[^A-Z0-9]%' AND LEN([ReferralCode]) BETWEEN 3 AND 24)");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerReferralAttributions_AttributedAt",
                table: "OwnerReferralAttributions",
                column: "AttributedAt");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerReferralAttributions_SalespersonId",
                table: "OwnerReferralAttributions",
                column: "SalespersonId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerReferralAttributions_UserId",
                table: "OwnerReferralAttributions",
                column: "UserId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TagOrders_Salespersons_SalespersonId",
                table: "TagOrders",
                column: "SalespersonId",
                principalTable: "Salespersons",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TagOrders_Salespersons_SalespersonId",
                table: "TagOrders");

            migrationBuilder.DropTable(
                name: "OwnerReferralAttributions");

            migrationBuilder.DropIndex(
                name: "IX_TagOrders_SalespersonId",
                table: "TagOrders");

            migrationBuilder.DropIndex(
                name: "IX_Salespersons_ReferralCode",
                table: "Salespersons");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Salespersons_ReferralCode",
                table: "Salespersons");

            migrationBuilder.DropColumn(
                name: "AttributedAt",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "AttributionSource",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "SalespersonCodeSnapshot",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "SalespersonId",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "SalespersonNameSnapshot",
                table: "TagOrders");

            migrationBuilder.DropColumn(
                name: "ReferralCode",
                table: "Salespersons");
        }
    }
}
