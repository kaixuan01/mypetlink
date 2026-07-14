using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class FavoriteFoodsAndToysAsLists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FavoriteFoodsJson",
                table: "Pets",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "FavoriteToysJson",
                table: "Pets",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            // Preserve existing single-value favourites by wrapping each one as a
            // one-item JSON array before the old columns are dropped.
            migrationBuilder.Sql(
                """
                UPDATE Pets
                SET FavoriteFoodsJson = N'["' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteFood)), 'json') + N'"]'
                WHERE FavoriteFood IS NOT NULL AND LTRIM(RTRIM(FavoriteFood)) <> N'';
                """);

            migrationBuilder.Sql(
                """
                UPDATE Pets
                SET FavoriteToysJson = N'["' + STRING_ESCAPE(LTRIM(RTRIM(FavoriteToy)), 'json') + N'"]'
                WHERE FavoriteToy IS NOT NULL AND LTRIM(RTRIM(FavoriteToy)) <> N'';
                """);

            migrationBuilder.DropColumn(
                name: "FavoriteFood",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "FavoriteToy",
                table: "Pets");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FavoriteFood",
                table: "Pets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FavoriteToy",
                table: "Pets",
                type: "nvarchar(max)",
                nullable: true);

            // Best-effort downgrade: keep the first list item as the single value.
            migrationBuilder.Sql(
                """
                UPDATE Pets
                SET FavoriteFood = JSON_VALUE(FavoriteFoodsJson, '$[0]')
                WHERE ISJSON(FavoriteFoodsJson) = 1;
                """);

            migrationBuilder.Sql(
                """
                UPDATE Pets
                SET FavoriteToy = JSON_VALUE(FavoriteToysJson, '$[0]')
                WHERE ISJSON(FavoriteToysJson) = 1;
                """);

            migrationBuilder.DropColumn(
                name: "FavoriteFoodsJson",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "FavoriteToysJson",
                table: "Pets");
        }
    }
}
