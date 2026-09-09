using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class NarrowPetBreedLength : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fail closed rather than truncate. Breed has been unbounded since
            // the first release, so a deployment target may hold a value longer
            // than the new limit. Narrowing the column would silently cut it,
            // destroying part of an owner's record, so stop instead and let an
            // operator decide what the value should be.
            migrationBuilder.Sql(@"
IF EXISTS (SELECT 1 FROM [Pets] WHERE LEN([Breed]) > 160)
BEGIN
    THROW 51070, 'Pet breeds longer than 160 characters exist. Shorten them through an audited correction before narrowing the column.', 1;
END;");

            migrationBuilder.AlterColumn<string>(
                name: "Breed",
                table: "Pets",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Breed",
                table: "Pets",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(160)",
                oldMaxLength: 160,
                oldNullable: true);
        }
    }
}
