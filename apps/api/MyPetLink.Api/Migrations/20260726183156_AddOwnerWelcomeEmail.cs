using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOwnerWelcomeEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedOrderId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EmailVerifiedAt",
                table: "ExternalLogins",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "RelatedOrderId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "RelatedUserId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedOrderId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedOrderId", "MessageType" },
                unique: true,
                filter: "[RelatedOrderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedUserId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedUserId", "MessageType" },
                unique: true,
                filter: "[RelatedUserId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "([RelatedOrderId] IS NOT NULL AND [RelatedUserId] IS NULL) OR ([RelatedOrderId] IS NULL AND [RelatedUserId] IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "FK_EmailOutbox_Users_RelatedUserId",
                table: "EmailOutbox",
                column: "RelatedUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "DELETE FROM [EmailOutbox] WHERE [RelatedUserId] IS NOT NULL;");

            migrationBuilder.DropForeignKey(
                name: "FK_EmailOutbox_Users_RelatedUserId",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedOrderId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedUserId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "EmailVerifiedAt",
                table: "ExternalLogins");

            migrationBuilder.DropColumn(
                name: "RelatedUserId",
                table: "EmailOutbox");

            migrationBuilder.AlterColumn<Guid>(
                name: "RelatedOrderId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedOrderId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedOrderId", "MessageType" },
                unique: true);
        }
    }
}
