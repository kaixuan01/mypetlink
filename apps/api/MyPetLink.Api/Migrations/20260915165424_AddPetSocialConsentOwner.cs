using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <summary>
    /// Records WHO put a pet into Social, so consent cannot outlive the person
    /// who gave it.
    ///
    /// SocialVisibility requires this to equal the pet's current owner, which
    /// is what makes a change of ownership withdraw the consent by itself
    /// rather than depending on a future transfer feature to remember to.
    ///
    /// Nullable because null is a real state, not a missing value: it means
    /// nobody has consented, which is where every pet starts.
    ///
    /// The backfill attributes only rows that are ALREADY enabled, and in
    /// production there are none — every PetSocialProfiles row that exists was
    /// created with IsSocialEnabled = 0, by the AddMomentSocialContent backfill
    /// for pets that predate Social and by PetService for pets created since,
    /// and until this release no code path could set it to 1. So this changes
    /// nothing in production and is not a way of inventing consent.
    ///
    /// It matters for databases that are not production. A development
    /// database seeded before this column existed holds pets with the switch on
    /// and no stamp, which would read as "enabled but invisible" — the one
    /// state that makes a local walkthrough lie about what a real owner sees.
    /// Attributing those to the pet's current owner is the only reading
    /// available and leaves no environment in that state.
    /// </summary>
    public partial class AddPetSocialConsentOwner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ConsentedByUserId",
                table: "PetSocialProfiles",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE s
                SET s.[ConsentedByUserId] = p.[OwnerUserId]
                FROM [PetSocialProfiles] AS s
                INNER JOIN [Pets] AS p ON p.[Id] = s.[PetId]
                WHERE s.[IsSocialEnabled] = 1
                  AND s.[ConsentedByUserId] IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConsentedByUserId",
                table: "PetSocialProfiles");
        }
    }
}
