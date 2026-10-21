using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCareCompletionIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CompletionIdempotencyKey",
                table: "CareRecords",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompletionRequestFingerprint",
                table: "CareRecords",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_CompletionIdempotencyKey",
                table: "CareRecords",
                column: "CompletionIdempotencyKey",
                unique: true,
                filter: "[CompletionIdempotencyKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CareRecords_CompletionIdempotencyKey",
                table: "CareRecords");

            migrationBuilder.DropColumn(
                name: "CompletionIdempotencyKey",
                table: "CareRecords");

            migrationBuilder.DropColumn(
                name: "CompletionRequestFingerprint",
                table: "CareRecords");
        }
    }
}
