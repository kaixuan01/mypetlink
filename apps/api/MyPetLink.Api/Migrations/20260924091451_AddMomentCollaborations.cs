using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMomentCollaborations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CollaborationId",
                table: "OwnerNotifications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CollaborationId",
                table: "MomentPets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MomentCollaborations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InviterUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InviteeUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RespondedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EndedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentCollaborations", x => x.Id);
                    table.CheckConstraint("CK_MomentCollaborations_State", "([Status] = N'Pending' AND [RespondedAt] IS NULL AND [EndedAt] IS NULL) OR ([Status] = N'Accepted' AND [RespondedAt] IS NOT NULL AND [EndedAt] IS NULL) OR ([Status] = N'Declined' AND [RespondedAt] IS NOT NULL AND [EndedAt] IS NULL) OR ([Status] IN (N'Revoked', N'Left', N'Dissolved', N'Expired') AND [EndedAt] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_MomentCollaborations_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentCollaborations_Users_InviteeUserId",
                        column: x => x.InviteeUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentCollaborations_Users_InviterUserId",
                        column: x => x.InviterUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MomentCollaborationPets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CollaborationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsAccepted = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentCollaborationPets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MomentCollaborationPets_MomentCollaborations_CollaborationId",
                        column: x => x.CollaborationId,
                        principalTable: "MomentCollaborations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentCollaborationPets_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_CollaborationId",
                table: "OwnerNotifications",
                column: "CollaborationId");

            migrationBuilder.CreateIndex(
                name: "IX_MomentPets_CollaborationId",
                table: "MomentPets",
                column: "CollaborationId");

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborationPets_CollaborationId_PetId",
                table: "MomentCollaborationPets",
                columns: new[] { "CollaborationId", "PetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborationPets_PetId",
                table: "MomentCollaborationPets",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborations_InviteeUserId_Status_ExpiresAt",
                table: "MomentCollaborations",
                columns: new[] { "InviteeUserId", "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborations_InviterUserId_CreatedAt",
                table: "MomentCollaborations",
                columns: new[] { "InviterUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborations_Live",
                table: "MomentCollaborations",
                columns: new[] { "MomentId", "InviteeUserId" },
                unique: true,
                filter: "[Status] IN (N'Pending', N'Accepted')");

            migrationBuilder.CreateIndex(
                name: "IX_MomentCollaborations_MomentId_Status",
                table: "MomentCollaborations",
                columns: new[] { "MomentId", "Status" });

            migrationBuilder.AddForeignKey(
                name: "FK_MomentPets_MomentCollaborations_CollaborationId",
                table: "MomentPets",
                column: "CollaborationId",
                principalTable: "MomentCollaborations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_OwnerNotifications_MomentCollaborations_CollaborationId",
                table: "OwnerNotifications",
                column: "CollaborationId",
                principalTable: "MomentCollaborations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MomentPets_MomentCollaborations_CollaborationId",
                table: "MomentPets");

            migrationBuilder.DropForeignKey(
                name: "FK_OwnerNotifications_MomentCollaborations_CollaborationId",
                table: "OwnerNotifications");

            migrationBuilder.DropTable(
                name: "MomentCollaborationPets");

            migrationBuilder.DropTable(
                name: "MomentCollaborations");

            migrationBuilder.DropIndex(
                name: "IX_OwnerNotifications_CollaborationId",
                table: "OwnerNotifications");

            migrationBuilder.DropIndex(
                name: "IX_MomentPets_CollaborationId",
                table: "MomentPets");

            migrationBuilder.DropColumn(
                name: "CollaborationId",
                table: "OwnerNotifications");

            migrationBuilder.DropColumn(
                name: "CollaborationId",
                table: "MomentPets");
        }
    }
}
