using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMomentSocialContent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // AuthorUserId is a required domain relationship, but it cannot be
            // added as NOT NULL against a table that already has rows: the
            // scaffolded default of an empty Guid is not a real account and the
            // foreign key below would reject every existing Moment.
            //
            // So: add it nullable, backfill it, then tighten it.
            migrationBuilder.AddColumn<Guid>(
                name: "AuthorUserId",
                table: "PetMemories",
                type: "uniqueidentifier",
                nullable: true);

            // Backfill authorship from the pet's CURRENT owner.
            //
            // This is an APPROXIMATION and is documented as one. Authorship was
            // never recorded before this migration, so the owning account today
            // is the only evidence available. For any pet that has changed hands
            // it may name the wrong person — which is exactly the case the
            // column exists to get right from now on. Every Moment created after
            // this migration takes its author from the authenticated session.
            //
            // Set-based: one statement regardless of row count, with nothing
            // loaded into application memory.
            migrationBuilder.Sql(@"
                UPDATE m
                SET m.[AuthorUserId] = p.[OwnerUserId]
                FROM [PetMemories] AS m
                INNER JOIN [Pets] AS p ON p.[Id] = m.[PetId]
                WHERE m.[AuthorUserId] IS NULL;
            ");

            migrationBuilder.Sql(
                "ALTER TABLE [PetMemories] ALTER COLUMN [AuthorUserId] uniqueidentifier NOT NULL;");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PublishedAt",
                table: "PetMemories",
                type: "datetimeoffset",
                nullable: true);

            // Give already-public Moments a publication time so they are not all
            // treated as unpublished.
            //
            // CreatedAt is the closest available evidence. MomentDate would be
            // wrong: it is the date the memory is ABOUT and is routinely
            // backdated years, so using it would order a feed by when things
            // happened to a pet rather than by when they were shared. Private
            // Moments stay NULL and get a real timestamp if they are ever
            // published.
            migrationBuilder.Sql(@"
                UPDATE [PetMemories]
                SET [PublishedAt] = [CreatedAt]
                WHERE [Visibility] = 'Public' AND [PublishedAt] IS NULL;
            ");

            migrationBuilder.CreateTable(
                name: "MomentLikes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MomentLikes_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MomentLikes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MomentPets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MomentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MomentPets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MomentPets_PetMemories_MomentId",
                        column: x => x.MomentId,
                        principalTable: "PetMemories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MomentPets_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PetSocialProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsSocialEnabled = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDiscoverable = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PetSocialProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PetSocialProfiles_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_AuthorUserId_PublishedAt",
                table: "PetMemories",
                columns: new[] { "AuthorUserId", "PublishedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MomentLikes_MomentId_UserId",
                table: "MomentLikes",
                columns: new[] { "MomentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentLikes_UserId_CreatedAt",
                table: "MomentLikes",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MomentPets_MomentId_PetId",
                table: "MomentPets",
                columns: new[] { "MomentId", "PetId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MomentPets_PetId_MomentId",
                table: "MomentPets",
                columns: new[] { "PetId", "MomentId" });

            migrationBuilder.CreateIndex(
                name: "IX_PetSocialProfiles_IsSocialEnabled_IsDiscoverable_UpdatedAt",
                table: "PetSocialProfiles",
                columns: new[] { "IsSocialEnabled", "IsDiscoverable", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PetSocialProfiles_PetId",
                table: "PetSocialProfiles",
                column: "PetId",
                unique: true);

            // Every existing Moment gets a membership row for its own pet, so
            // "which pets are in this Moment" is one query with no special case
            // — including for Moments that predate the table.
            //
            // There is no "primary" marker to set: the primary pet is whichever
            // membership row matches PetMemories.PetId, which is the single
            // authoritative place it is recorded.
            migrationBuilder.Sql(@"
                INSERT INTO [MomentPets] ([Id], [MomentId], [PetId], [CreatedAt])
                SELECT NEWID(), m.[Id], m.[PetId], m.[CreatedAt]
                FROM [PetMemories] AS m
                WHERE NOT EXISTS (
                    SELECT 1 FROM [MomentPets] AS mp WHERE mp.[MomentId] = m.[Id]);
            ");

            // Every existing pet gets a social row, SWITCHED OFF.
            //
            // PetPublicProfiles.IsPublicProfileEnabled is deliberately not
            // consulted. It means "I am happy to hand this link to people", and
            // reading it as consent to be browsable by strangers would enrol
            // every already-public pet into a network its owner never joined.
            migrationBuilder.Sql(@"
                INSERT INTO [PetSocialProfiles]
                    ([Id], [PetId], [IsSocialEnabled], [IsDiscoverable],
                     [CreatedAt], [UpdatedAt])
                SELECT NEWID(), p.[Id], 0, 0, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
                FROM [Pets] AS p
                WHERE p.[DeletedAt] IS NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM [PetSocialProfiles] AS s WHERE s.[PetId] = p.[Id]);
            ");

            migrationBuilder.AddForeignKey(
                name: "FK_PetMemories_Users_AuthorUserId",
                table: "PetMemories",
                column: "AuthorUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PetMemories_Users_AuthorUserId",
                table: "PetMemories");

            migrationBuilder.DropTable(
                name: "MomentLikes");

            migrationBuilder.DropTable(
                name: "MomentPets");

            migrationBuilder.DropTable(
                name: "PetSocialProfiles");

            migrationBuilder.DropIndex(
                name: "IX_PetMemories_AuthorUserId_PublishedAt",
                table: "PetMemories");

            migrationBuilder.DropColumn(
                name: "AuthorUserId",
                table: "PetMemories");

            migrationBuilder.DropColumn(
                name: "PublishedAt",
                table: "PetMemories");
        }
    }
}
