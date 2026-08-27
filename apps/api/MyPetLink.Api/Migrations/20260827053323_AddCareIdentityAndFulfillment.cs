using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCareIdentityAndFulfillment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CareName",
                table: "CareRecords",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FulfillsCareRecordId",
                table: "CareRecords",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_FulfillsCareRecordId",
                table: "CareRecords",
                column: "FulfillsCareRecordId",
                unique: true,
                filter: "[FulfillsCareRecordId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_CareRecords_CareRecords_FulfillsCareRecordId",
                table: "CareRecords",
                column: "FulfillsCareRecordId",
                principalTable: "CareRecords",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CareRecords_CareRecords_FulfillsCareRecordId",
                table: "CareRecords");

            migrationBuilder.DropIndex(
                name: "IX_CareRecords_FulfillsCareRecordId",
                table: "CareRecords");

            migrationBuilder.DropColumn(
                name: "CareName",
                table: "CareRecords");

            migrationBuilder.DropColumn(
                name: "FulfillsCareRecordId",
                table: "CareRecords");
        }
    }
}
