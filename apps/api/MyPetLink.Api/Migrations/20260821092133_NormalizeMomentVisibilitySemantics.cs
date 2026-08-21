using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeMomentVisibilitySemantics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // FamilyOnly is retired at the product layer but remains in the
            // enum temporarily so EF can materialize a pre-migration row.
            // This correction only narrows audience; it never promotes data.
            migrationBuilder.Sql(
                """
                UPDATE [PetMemories]
                SET [Visibility] = N'Private'
                WHERE [Visibility] = N'FamilyOnly';
                """);

            // ShowOnPublicProfile is retained as a compatibility column. New
            // behavior derives it from Visibility, so normalize old rows to
            // the same invariant without changing Timeline placement.
            migrationBuilder.Sql(
                """
                UPDATE [PetMemories]
                SET [ShowOnPublicProfile] = CASE
                    WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
                    ELSE CAST(0 AS bit)
                END
                WHERE [ShowOnPublicProfile] <> CASE
                    WHEN [Visibility] = N'Public' THEN CAST(1 AS bit)
                    ELSE CAST(0 AS bit)
                END;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately irreversible: the previous FamilyOnly audience and
            // contradictory compatibility flags cannot be reconstructed, and
            // restoring them could widen or misrepresent privacy semantics.
        }
    }
}
