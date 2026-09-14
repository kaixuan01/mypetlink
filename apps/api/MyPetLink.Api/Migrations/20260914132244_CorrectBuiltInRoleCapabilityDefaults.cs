using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class CorrectBuiltInRoleCapabilityDefaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Remove only the exact rows inserted by AddAdminAccessManagement.
            // If an administrator previously removed one of these grants and
            // deliberately added it back, that replacement has a different Id
            // and must remain untouched.
            migrationBuilder.Sql(
                """
                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] = '7b73dbaf-eaf0-2ea7-007b-322079cb2360'
                  AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06'
                  AND [Capability] = N'sales.view';

                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] = '28864159-d7a0-f7bc-80cc-71f0e427d7ff'
                  AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
                  AND [Capability] = N'sales_commissions.reverse';

                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] = 'd89192fb-cc99-fa51-35e2-5a92cff5bfc1'
                  AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
                  AND [Capability] = N'sales_commissions.rules.manage';

                DELETE FROM [AdminRoleCapabilities]
                WHERE [Id] = '62cce0f6-214a-107f-de3c-a2e84e287687'
                  AND [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
                  AND [Capability] = N'payouts.settle';

                UPDATE [AdminRoles]
                SET [Description] = N'Promotions, product and plan visibility, and the sample pet experience. No broad sales data, payment proofs, payouts, stock costs or access management.',
                    [UpdatedAt] = SYSDATETIMEOFFSET()
                WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06'
                  AND [Code] = N'marketing';

                UPDATE [AdminRoles]
                SET [Description] = N'Payment approval, invoices and receipts, commission accounting, payout preparation and financial reporting. No payout settlement, commission reversal or rule changes.',
                    [UpdatedAt] = SYSDATETIMEOFFSET()
                WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
                  AND [Code] = N'finance';
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND [Code] = N'marketing')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND [Capability] = N'sales.view')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('7b73dbaf-eaf0-2ea7-007b-322079cb2360', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sales.view', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Code] = N'finance')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Capability] = N'sales_commissions.reverse')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('28864159-d7a0-f7bc-80cc-71f0e427d7ff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.reverse', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Code] = N'finance')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Capability] = N'sales_commissions.rules.manage')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('d89192fb-cc99-fa51-35e2-5a92cff5bfc1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.rules.manage', SYSDATETIMEOFFSET());

                IF EXISTS (SELECT 1 FROM [AdminRoles] WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Code] = N'finance')
                   AND NOT EXISTS (SELECT 1 FROM [AdminRoleCapabilities] WHERE [AdminRoleId] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND [Capability] = N'payouts.settle')
                    INSERT INTO [AdminRoleCapabilities] ([Id], [AdminRoleId], [Capability], [CreatedAt])
                    VALUES ('62cce0f6-214a-107f-de3c-a2e84e287687', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.settle', SYSDATETIMEOFFSET());

                UPDATE [AdminRoles]
                SET [Description] = N'Promotions, the sample pet experience, and campaign and referral reporting. No payment proofs, payouts, stock costs or access management.',
                    [UpdatedAt] = SYSDATETIMEOFFSET()
                WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06'
                  AND [Code] = N'marketing';

                UPDATE [AdminRoles]
                SET [Description] = N'Payment approval, invoices and receipts, commission accounting, payouts and financial reporting. No stock creation, Smart Tag operations or access management.',
                    [UpdatedAt] = SYSDATETIMEOFFSET()
                WHERE [Id] = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07'
                  AND [Code] = N'finance';
                """);

        }
    }
}
