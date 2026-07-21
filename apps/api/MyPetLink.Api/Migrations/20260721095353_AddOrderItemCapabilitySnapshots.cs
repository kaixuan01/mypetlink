using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderItemCapabilitySnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "SupportsNfcSnapshot",
                table: "TagOrderItems",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SupportsQrSnapshot",
                table: "TagOrderItems",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Backfill what existing orders were actually sold. Before this
            // column the capability lived only in the two-value TagOrder.TagType
            // enum, which always implied a QR code and added NFC for the Smart
            // Tag. Reading it here keeps order history truthful instead of
            // showing every historical order as having no features.
            migrationBuilder.Sql(@"
                UPDATE item
                SET item.SupportsQrSnapshot = 1,
                    item.SupportsNfcSnapshot = CASE WHEN o.TagType = 'QrNfcSmartTag' THEN 1 ELSE 0 END
                FROM TagOrderItems AS item
                INNER JOIN TagOrders AS o ON o.Id = item.OrderId;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SupportsNfcSnapshot",
                table: "TagOrderItems");

            migrationBuilder.DropColumn(
                name: "SupportsQrSnapshot",
                table: "TagOrderItems");
        }
    }
}
