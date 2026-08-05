using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessIdentitySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BusinessIdentitySettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BrandName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    LegalBusinessName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    BusinessRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TaxIdentificationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    SstRegistrationNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    RegisteredAddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    RegisteredAddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    RegisteredPostcode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    RegisteredCity = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RegisteredState = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RegisteredCountry = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    SupportEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    BusinessPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    BusinessWebsite = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PaymentInstructions = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    BankAccountName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    BankName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    BankAccountNumber = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    DuitNowDisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessIdentitySettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessIdentitySettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "BusinessIdentitySettings",
                columns: new[] { "Id", "BankAccountName", "BankAccountNumber", "BankName", "BrandName", "BusinessPhone", "BusinessRegistrationNumber", "BusinessWebsite", "DuitNowDisplayName", "LegalBusinessName", "PaymentInstructions", "RegisteredAddressLine1", "RegisteredAddressLine2", "RegisteredCity", "RegisteredCountry", "RegisteredPostcode", "RegisteredState", "SstRegistrationNumber", "SupportEmail", "TaxIdentificationNumber", "UpdatedAt", "UpdatedByAdminUserId" },
                values: new object[] { new Guid("7c1f9b52-4d63-4a18-9e37-2b8c05f1d6a4"), null, null, null, "MyPetLink", null, "202603141718 (AS0515813-P)", "mypetlink.com.my", null, "GBB Software Solutions", null, "", null, "", "Malaysia", "", "", null, "support@mypetlink.com.my", null, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null });

            migrationBuilder.CreateIndex(
                name: "IX_BusinessIdentitySettings_UpdatedByAdminUserId",
                table: "BusinessIdentitySettings",
                column: "UpdatedByAdminUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BusinessIdentitySettings");
        }
    }
}
