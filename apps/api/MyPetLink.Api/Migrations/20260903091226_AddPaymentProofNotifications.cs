using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentProofNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.AddColumn<Guid>(
                name: "RelatedPaymentProofId",
                table: "EmailOutbox",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_RelatedPaymentProofId_MessageType",
                table: "EmailOutbox",
                columns: new[] { "RelatedPaymentProofId", "MessageType" },
                unique: true,
                filter: "[RelatedPaymentProofId] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedPaymentProofId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END) = 1");

            migrationBuilder.AddForeignKey(
                name: "FK_EmailOutbox_PaymentProofs_RelatedPaymentProofId",
                table: "EmailOutbox",
                column: "RelatedPaymentProofId",
                principalTable: "PaymentProofs",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Email templates are deployment prerequisites, but a migration
            // must never make a delivery decision. Seed missing typed rows in
            // the disabled state; operations enables each one deliberately,
            // which stamps EnabledFromUtc and excludes historical backlog.
            migrationBuilder.Sql(
                """
                IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'PaymentConfirmed')
                    INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
                    VALUES ('531d900b-8b64-4a07-8c2d-a289c05812e1', N'PaymentConfirmed', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

                IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'OrderShipped')
                    INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
                    VALUES ('d8411e2a-6cf3-4705-96d7-97ecbe9e5792', N'OrderShipped', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

                IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'AdminPaymentProofSubmitted')
                    INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
                    VALUES ('75357899-aac6-4d9f-8f2f-8e20812c9677', N'AdminPaymentProofSubmitted', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');

                IF NOT EXISTS (SELECT 1 FROM [EmailTemplateSettings] WHERE [MessageType] = N'PaymentProofRejected')
                    INSERT INTO [EmailTemplateSettings] ([Id], [MessageType], [IsEnabled], [EnabledFromUtc], [UpdatedByAdminUserId], [CreatedAt], [UpdatedAt])
                    VALUES ('8b1117d0-caea-4105-917f-744a926d9255', N'PaymentProofRejected', 0, NULL, NULL, '2026-09-03T00:00:00.0000000+00:00', '2026-09-03T00:00:00.0000000+00:00');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE FROM [EmailOutbox]
                WHERE [MessageType] IN (N'AdminPaymentProofSubmitted', N'PaymentProofRejected');

                DELETE FROM [EmailTemplateSettings]
                WHERE [MessageType] IN (N'AdminPaymentProofSubmitted', N'PaymentProofRejected');
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_EmailOutbox_PaymentProofs_RelatedPaymentProofId",
                table: "EmailOutbox");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_RelatedPaymentProofId_MessageType",
                table: "EmailOutbox");

            migrationBuilder.DropCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "RelatedPaymentProofId",
                table: "EmailOutbox");

            migrationBuilder.AddCheckConstraint(
                name: "CK_EmailOutbox_RelatedEntity",
                table: "EmailOutbox",
                sql: "(CASE WHEN [RelatedOrderId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedUserId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantQuotationId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantInvoiceId] IS NULL THEN 0 ELSE 1 END + CASE WHEN [RelatedMerchantDeliveryOrderId] IS NULL THEN 0 ELSE 1 END) = 1");
        }
    }
}
