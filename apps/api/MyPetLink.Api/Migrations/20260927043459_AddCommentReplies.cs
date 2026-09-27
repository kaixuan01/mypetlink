using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommentReplies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MomentComments_MomentId_CreatedAt_Id",
                table: "MomentComments");

            migrationBuilder.AddColumn<Guid>(
                name: "ParentCommentId",
                table: "MomentComments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_MomentId_ParentCommentId_CreatedAt_Id",
                table: "MomentComments",
                columns: new[] { "MomentId", "ParentCommentId", "CreatedAt", "Id" },
                filter: "[DeletedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_ParentCommentId",
                table: "MomentComments",
                column: "ParentCommentId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MomentComments_NotOwnParent",
                table: "MomentComments",
                sql: "[ParentCommentId] IS NULL OR [ParentCommentId] <> [Id]");

            migrationBuilder.AddForeignKey(
                name: "FK_MomentComments_MomentComments_ParentCommentId",
                table: "MomentComments",
                column: "ParentCommentId",
                principalTable: "MomentComments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MomentComments_MomentComments_ParentCommentId",
                table: "MomentComments");

            migrationBuilder.DropIndex(
                name: "IX_MomentComments_MomentId_ParentCommentId_CreatedAt_Id",
                table: "MomentComments");

            migrationBuilder.DropIndex(
                name: "IX_MomentComments_ParentCommentId",
                table: "MomentComments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_MomentComments_NotOwnParent",
                table: "MomentComments");

            migrationBuilder.DropColumn(
                name: "ParentCommentId",
                table: "MomentComments");

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_MomentId_CreatedAt_Id",
                table: "MomentComments",
                columns: new[] { "MomentId", "CreatedAt", "Id" },
                filter: "[DeletedAt] IS NULL");
        }
    }
}
