using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMomentComments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CommentId",
                table: "OwnerNotifications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MomentComments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Body = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentComments", x => x.Id);
                    table.CheckConstraint("CK_MomentComments_DeletionState", "([DeletedAt] IS NULL AND [DeletedByUserId] IS NULL AND [Body] <> N'') OR ([DeletedAt] IS NOT NULL AND [DeletedByUserId] IS NOT NULL AND [Body] = N'')");
                    table.ForeignKey(
                        name: "FK_MomentComments_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentComments_Users_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentComments_Users_DeletedByUserId",
                        column: x => x.DeletedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_CommentId",
                table: "OwnerNotifications",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_AuthorUserId_CreatedAt",
                table: "MomentComments",
                columns: new[] { "AuthorUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_DeletedByUserId",
                table: "MomentComments",
                column: "DeletedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MomentComments_MomentId_CreatedAt_Id",
                table: "MomentComments",
                columns: new[] { "MomentId", "CreatedAt", "Id" },
                filter: "[DeletedAt] IS NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_OwnerNotifications_MomentComments_CommentId",
                table: "OwnerNotifications",
                column: "CommentId",
                principalTable: "MomentComments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_OwnerNotifications_MomentComments_CommentId",
                table: "OwnerNotifications");

            migrationBuilder.DropTable(
                name: "MomentComments");

            migrationBuilder.DropIndex(
                name: "IX_OwnerNotifications_CommentId",
                table: "OwnerNotifications");

            migrationBuilder.DropColumn(
                name: "CommentId",
                table: "OwnerNotifications");
        }
    }
}
