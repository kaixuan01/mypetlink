using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommunityModerationActions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CommunityRestrictedUntil",
                table: "OwnerSocialProfiles",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ModerationActionId",
                table: "OwnerNotifications",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CommunityModerationActions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActionType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    InternalRemark = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    PerformedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RestrictedUntil = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CommentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CommunityReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ContentSnapshot = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunityModerationActions", x => x.Id);
                    table.CheckConstraint("CK_CommunityModerationActions_Target", "([ActionType] NOT IN (N'MomentRemoved', N'MomentRestored') OR ([MomentId] IS NOT NULL AND [CommentId] IS NULL)) AND ([ActionType] NOT IN (N'CommentRemoved', N'ReplyRemoved') OR [CommentId] IS NOT NULL) AND ([RestrictedUntil] IS NULL OR [ActionType] = N'CommunityRestricted') AND (([PerformedByUserId] IS NULL AND [ActionType] = N'CommunityRestrictionExpired') OR ([PerformedByUserId] IS NOT NULL AND [ActionType] <> N'CommunityRestrictionExpired'))");
                    table.ForeignKey(
                        name: "FK_CommunityModerationActions_CommunityReports_CommunityReportId",
                        column: x => x.CommunityReportId,
                        principalTable: "CommunityReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityModerationActions_MomentComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "MomentComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityModerationActions_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityModerationActions_Users_PerformedByUserId",
                        column: x => x.PerformedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityModerationActions_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OwnerSocialProfiles_CommunityRestrictedUntil",
                table: "OwnerSocialProfiles",
                column: "CommunityRestrictedUntil",
                filter: "[CommunityRestrictedUntil] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_OwnerSocialProfiles_CommunityRestrictionEnd",
                table: "OwnerSocialProfiles",
                sql: "[CommunityRestrictedUntil] IS NULL OR ([CommunityRestrictedAt] IS NOT NULL AND [CommunityRestrictedUntil] > [CommunityRestrictedAt])");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerNotifications_ModerationActionId",
                table: "OwnerNotifications",
                column: "ModerationActionId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_CommentId",
                table: "CommunityModerationActions",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_CommunityReportId",
                table: "CommunityModerationActions",
                column: "CommunityReportId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_MomentId",
                table: "CommunityModerationActions",
                column: "MomentId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_PerformedByUserId",
                table: "CommunityModerationActions",
                column: "PerformedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_TargetUserId_ActionType",
                table: "CommunityModerationActions",
                columns: new[] { "TargetUserId", "ActionType" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunityModerationActions_TargetUserId_CreatedAt",
                table: "CommunityModerationActions",
                columns: new[] { "TargetUserId", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_OwnerNotifications_CommunityModerationActions_ModerationActionId",
                table: "OwnerNotifications",
                column: "ModerationActionId",
                principalTable: "CommunityModerationActions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // The default grant for the new account-suspension capability on the
            // built-in Administrator role, matching AdminRoleTemplates. Super
            // Admin needs none — it grants everything — and Owner Support and
            // Operations do not get it. A role that is missing or renamed is
            // left alone. A fixed row id, so Down removes exactly this grant.
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Code] = N'administrator')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Capability] = N'owners.suspend')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('d3f2b0e5-6c80-4f41-8b72-3f1c9a5d8b01', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.suspend', SYSDATETIMEOFFSET());
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only the exact grant row Up inserted; one added by hand stays.
            migrationBuilder.Sql(
                """
                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] = 'd3f2b0e5-6c80-4f41-8b72-3f1c9a5d8b01';
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_OwnerNotifications_CommunityModerationActions_ModerationActionId",
                table: "OwnerNotifications");

            migrationBuilder.DropTable(
                name: "CommunityModerationActions");

            migrationBuilder.DropIndex(
                name: "IX_OwnerSocialProfiles_CommunityRestrictedUntil",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_OwnerSocialProfiles_CommunityRestrictionEnd",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropIndex(
                name: "IX_OwnerNotifications_ModerationActionId",
                table: "OwnerNotifications");

            migrationBuilder.DropColumn(
                name: "CommunityRestrictedUntil",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropColumn(
                name: "ModerationActionId",
                table: "OwnerNotifications");
        }
    }
}
