using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailTemplateSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SuppressionReason",
                table: "EmailOutbox",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EmailTemplateSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MessageType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    EnabledFromUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailTemplateSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmailTemplateSettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_MessageType_Status_CreatedAt",
                table: "EmailOutbox",
                columns: new[] { "MessageType", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplateSettings_MessageType",
                table: "EmailTemplateSettings",
                column: "MessageType",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplateSettings_UpdatedByAdminUserId",
                table: "EmailTemplateSettings",
                column: "UpdatedByAdminUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailTemplateSettings");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_MessageType_Status_CreatedAt",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "SuppressionReason",
                table: "EmailOutbox");
        }
    }
}
