using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSocialGraph : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OwnerBlocks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BlockerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BlockedUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(280)", maxLength: 280, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OwnerBlocks", x => x.Id);
                    table.CheckConstraint("CK_OwnerBlocks_NoSelfBlock", "[BlockerUserId] <> [BlockedUserId]");
                    table.ForeignKey(
                        name: "FK_OwnerBlocks_Users_BlockedUserId",
                        column: x => x.BlockedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerBlocks_Users_BlockerUserId",
                        column: x => x.BlockerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OwnerFollows",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FollowerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FollowedUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OwnerFollows", x => x.Id);
                    table.CheckConstraint("CK_OwnerFollows_NoSelfFollow", "[FollowerUserId] <> [FollowedUserId]");
                    table.ForeignKey(
                        name: "FK_OwnerFollows_Users_FollowedUserId",
                        column: x => x.FollowedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerFollows_Users_FollowerUserId",
                        column: x => x.FollowerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OwnerNotifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SubjectPetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Type = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OwnerNotifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OwnerNotifications_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerNotifications_Pets_SubjectPetId",
                        column: x => x.SubjectPetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerNotifications_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerNotifications_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerBlocks_BlockedUserId",
                table: "OwnerBlocks",
                column: "BlockedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerBlocks_BlockerUserId_BlockedUserId",
                table: "OwnerBlocks",
                columns: new[] { "BlockerUserId", "BlockedUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OwnerFollows_FollowedUserId_CreatedAt",
                table: "OwnerFollows",
                columns: new[] { "FollowedUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerFollows_FollowerUserId_CreatedAt",
                table: "OwnerFollows",
                columns: new[] { "FollowerUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerFollows_FollowerUserId_FollowedUserId",
                table: "OwnerFollows",
                columns: new[] { "FollowerUserId", "FollowedUserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_ActorUserId",
                table: "OwnerNotifications",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_MomentId",
                table: "OwnerNotifications",
                column: "MomentId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_RecipientUserId_CreatedAt",
                table: "OwnerNotifications",
                columns: new[] { "RecipientUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_RecipientUserId_ReadAt",
                table: "OwnerNotifications",
                columns: new[] { "RecipientUserId", "ReadAt" },
                filter: "[ReadAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_RecipientUserId_Type_ActorUserId_MomentId",
                table: "OwnerNotifications",
                columns: new[] { "RecipientUserId", "Type", "ActorUserId", "MomentId" });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_SubjectPetId",
                table: "OwnerNotifications",
                column: "SubjectPetId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OwnerBlocks");

            migrationBuilder.DropTable(
                name: "OwnerFollows");

            migrationBuilder.DropTable(
                name: "OwnerNotifications");
        }
    }
}
