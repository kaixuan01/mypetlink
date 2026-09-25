using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommentMentions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MomentCommentMentions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MentionedUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Start = table.Column<int>(type: "int", nullable: false),
                    Length = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentCommentMentions", x => x.Id);
                    table.CheckConstraint("CK_MomentCommentMentions_Span", "[Start] >= 0 AND [Length] >= 4 AND [Length] <= 31 AND [Start] + [Length] <= 500");
                    table.ForeignKey(
                        name: "FK_MomentCommentMentions_MomentComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "MomentComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentCommentMentions_Users_MentionedUserId",
                        column: x => x.MentionedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MomentCommentMentions_CommentId_MentionedUserId",
                table: "MomentCommentMentions",
                columns: new[] { "CommentId", "MentionedUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentCommentMentions_CommentId_Start",
                table: "MomentCommentMentions",
                columns: new[] { "CommentId", "Start" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentCommentMentions_MentionedUserId_CommentId",
                table: "MomentCommentMentions",
                columns: new[] { "MentionedUserId", "CommentId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MomentCommentMentions");
        }
    }
}
