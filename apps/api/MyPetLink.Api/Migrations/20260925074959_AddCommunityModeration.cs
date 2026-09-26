using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommunityModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ModeratedAt",
                table: "PetMemories",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ModeratedByUserId",
                table: "PetMemories",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "CommunityEnabledBeforeRestriction",
                table: "OwnerSocialProfiles",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CommunityRestrictedAt",
                table: "OwnerSocialProfiles",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CommunityReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReporterUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TargetType = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    CommentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReportedUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Details = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SnapshotHandle = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    SnapshotDisplayName = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    SnapshotTitle = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    SnapshotText = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SnapshotAvatarMediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Resolution = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    ReviewNote = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommunityReports", x => x.Id);
                    table.CheckConstraint("CK_CommunityReports_Details", "[Reason] <> N'Other' OR ([Details] IS NOT NULL AND LEN([Details]) > 0)");
                    table.CheckConstraint("CK_CommunityReports_Review", "([Status] = N'Open' AND [Resolution] IS NULL AND [ReviewedAt] IS NULL AND [ReviewedByUserId] IS NULL) OR ([Status] = N'Resolved' AND [Resolution] IS NOT NULL AND [ReviewedAt] IS NOT NULL AND [ReviewedByUserId] IS NOT NULL)");
                    table.CheckConstraint("CK_CommunityReports_Snapshot", "([SnapshotTitle] IS NULL OR [TargetType] = N'Moment') AND ([SnapshotAvatarMediaFileId] IS NULL OR [TargetType] = N'Household') AND [ReporterUserId] <> [ReportedUserId]");
                    table.CheckConstraint("CK_CommunityReports_Target", "([TargetType] = N'Comment' AND [CommentId] IS NOT NULL AND [MomentId] IS NULL) OR ([TargetType] = N'Moment' AND [MomentId] IS NOT NULL AND [CommentId] IS NULL) OR ([TargetType] = N'Household' AND [CommentId] IS NULL AND [MomentId] IS NULL)");
                    table.ForeignKey(
                        name: "FK_CommunityReports_MediaFiles_SnapshotAvatarMediaFileId",
                        column: x => x.SnapshotAvatarMediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityReports_MomentComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "MomentComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityReports_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityReports_Users_ReportedUserId",
                        column: x => x.ReportedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityReports_Users_ReporterUserId",
                        column: x => x.ReporterUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CommunityReports_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_ModeratedByUserId",
                table: "PetMemories",
                column: "ModeratedByUserId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PetMemories_Moderation",
                table: "PetMemories",
                sql: "([ModeratedAt] IS NULL AND [ModeratedByUserId] IS NULL) OR ([ModeratedAt] IS NOT NULL AND [ModeratedByUserId] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerSocialProfiles_CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles",
                column: "CommunityRestrictedByUserId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_OwnerSocialProfiles_CommunityRestriction",
                table: "OwnerSocialProfiles",
                sql: "([CommunityRestrictedAt] IS NULL AND [CommunityRestrictedByUserId] IS NULL AND [CommunityEnabledBeforeRestriction] IS NULL) OR ([CommunityRestrictedAt] IS NOT NULL AND [CommunityRestrictedByUserId] IS NOT NULL AND [CommunityEnabledBeforeRestriction] IS NOT NULL AND [IsSocialEnabled] = 0)");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_CommentId",
                table: "CommunityReports",
                column: "CommentId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_MomentId",
                table: "CommunityReports",
                column: "MomentId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_OpenPerReporterAndTarget",
                table: "CommunityReports",
                columns: new[] { "ReporterUserId", "TargetType", "CommentId", "MomentId", "ReportedUserId" },
                unique: true,
                filter: "[Status] = N'Open'");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_ReportedUserId_CreatedAt",
                table: "CommunityReports",
                columns: new[] { "ReportedUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_ReporterUserId_CreatedAt",
                table: "CommunityReports",
                columns: new[] { "ReporterUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_ReviewedByUserId",
                table: "CommunityReports",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_SnapshotAvatarMediaFileId",
                table: "CommunityReports",
                column: "SnapshotAvatarMediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_CommunityReports_Status_CreatedAt",
                table: "CommunityReports",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_OwnerSocialProfiles_Users_CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles",
                column: "CommunityRestrictedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PetMemories_Users_ModeratedByUserId",
                table: "PetMemories",
                column: "ModeratedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Default grants for the new Community moderation capabilities on
            // the built-in roles that already exist, matching AdminRoleTemplates:
            // Administrator gets all three, Owner Support view and resolve.
            // Super Admin needs none — it grants everything. Nothing else is
            // touched, and a role that is missing or has been renamed is left
            // alone. Fixed row ids, so Down removes exactly these grants.
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Code] = N'administrator')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Capability] = N'community_reports.view')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a01', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'community_reports.view', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Code] = N'administrator')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Capability] = N'community_reports.resolve')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a02', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'community_reports.resolve', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Code] = N'administrator')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND [Capability] = N'community_moderation.enforce')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a03', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'community_moderation.enforce', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND [Code] = N'owner-support')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND [Capability] = N'community_reports.view')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a04', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'community_reports.view', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND [Code] = N'owner-support')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND [Capability] = N'community_reports.resolve')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a05', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'community_reports.resolve', SYSDATETIMEOFFSET());
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only the exact grant rows Up inserted; a grant somebody added by
            // hand has a different id and stays.
            migrationBuilder.Sql(
                """
                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] IN (
                    'c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a01',
                    'c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a02',
                    'c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a03',
                    'c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a04',
                    'c2e1a9d4-5b7f-4e30-9a61-2e0b8f4c7a05');
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_OwnerSocialProfiles_Users_CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_PetMemories_Users_ModeratedByUserId",
                table: "PetMemories");

            migrationBuilder.DropTable(
                name: "CommunityReports");

            migrationBuilder.DropIndex(
                name: "IX_PetMemories_ModeratedByUserId",
                table: "PetMemories");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PetMemories_Moderation",
                table: "PetMemories");

            migrationBuilder.DropIndex(
                name: "IX_OwnerSocialProfiles_CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_OwnerSocialProfiles_CommunityRestriction",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropColumn(
                name: "ModeratedAt",
                table: "PetMemories");

            migrationBuilder.DropColumn(
                name: "ModeratedByUserId",
                table: "PetMemories");

            migrationBuilder.DropColumn(
                name: "CommunityEnabledBeforeRestriction",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropColumn(
                name: "CommunityRestrictedAt",
                table: "OwnerSocialProfiles");

            migrationBuilder.DropColumn(
                name: "CommunityRestrictedByUserId",
                table: "OwnerSocialProfiles");
        }
    }
}
