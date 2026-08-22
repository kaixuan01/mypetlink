using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeCareVisibilitySemantics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // PublicDetails is retired at the product layer but remains in the
            // enum temporarily so EF can materialize a pre-migration row.
            // This correction only narrows audience; it never promotes data.
            migrationBuilder.Sql(
                """
                UPDATE [CareRecords]
                SET [PublicVisibility] = N'PublicBadgeOnly'
                WHERE [PublicVisibility] = N'PublicDetails';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately irreversible: the old PublicDetails distinction
            // cannot be reconstructed safely, and restoring it would widen
            // the public audience of care information.
        }
    }
}
