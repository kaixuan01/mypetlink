using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AllowEmojiOnlyCommentBodies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_MomentComments_DeletionState",
                table: "MomentComments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MomentComments_DeletionState",
                table: "MomentComments",
                sql: "([DeletedAt] IS NULL AND [DeletedByUserId] IS NULL AND DATALENGTH([Body]) > 0) OR ([DeletedAt] IS NOT NULL AND [DeletedByUserId] IS NOT NULL AND DATALENGTH([Body]) = 0)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_MomentComments_DeletionState",
                table: "MomentComments");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MomentComments_DeletionState",
                table: "MomentComments",
                sql: "([DeletedAt] IS NULL AND [DeletedByUserId] IS NULL AND [Body] <> N'') OR ([DeletedAt] IS NOT NULL AND [DeletedByUserId] IS NOT NULL AND [Body] = N'')");
        }
    }
}
