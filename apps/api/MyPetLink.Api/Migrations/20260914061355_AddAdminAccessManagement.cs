using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminAccessManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DisabledByAdminUserId",
                table: "AdminUsers",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "AdminUsers",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.CreateTable(
                name: "AdminRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    IsSystemRole = table.Column<bool>(type: "bit", nullable: false),
                    GrantsAllCapabilities = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AdminRoleCapabilities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminRoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Capability = table.Column<string>(type: "nvarchar(96)", maxLength: 96, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminRoleCapabilities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminRoleCapabilities_AdminRoles_AdminRoleId",
                        column: x => x.AdminRoleId,
                        principalTable: "AdminRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AdminUserRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminRoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssignedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AssignedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminUserRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminUserRoles_AdminRoles_AdminRoleId",
                        column: x => x.AdminRoleId,
                        principalTable: "AdminRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AdminUserRoles_AdminUsers_AdminUserId",
                        column: x => x.AdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AdminUserRoles_AdminUsers_AssignedByAdminUserId",
                        column: x => x.AssignedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_DisabledByAdminUserId",
                table: "AdminUsers",
                column: "DisabledByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AdminRoleCapabilities_AdminRoleId_Capability",
                table: "AdminRoleCapabilities",
                columns: new[] { "AdminRoleId", "Capability" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AdminRoleCapabilities_Capability",
                table: "AdminRoleCapabilities",
                column: "Capability");

            migrationBuilder.CreateIndex(
                name: "IX_AdminRoles_Code",
                table: "AdminRoles",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AdminRoles_SortOrder",
                table: "AdminRoles",
                column: "SortOrder");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUserRoles_AdminRoleId",
                table: "AdminUserRoles",
                column: "AdminRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUserRoles_AdminUserId_AdminRoleId",
                table: "AdminUserRoles",
                columns: new[] { "AdminUserId", "AdminRoleId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AdminUserRoles_AssignedByAdminUserId",
                table: "AdminUserRoles",
                column: "AssignedByAdminUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_AdminUsers_AdminUsers_DisabledByAdminUserId",
                table: "AdminUsers",
                column: "DisabledByAdminUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // --- Built-in roles ------------------------------------------------
            //
            // Seeded as literal rows so a deployment is self-contained and the
            // shipped migration.sql never depends on application code. Every
            // statement is guarded, so the script is safe to re-run.
            //
            // Existing administrators are then moved onto the role that matches
            // the single role they already held, so nobody's access changes when
            // this migration is applied.
            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'super-admin')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d01', N'super-admin', N'Super Admin', N'Complete access to everything, including who else can use the Admin Portal. Only a Super Admin can grant or remove Super Admin access.', 1, 1, 10, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'administrator')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'administrator', N'Administrator', N'Day-to-day running of the business across every operational area, plus commission accounting and payout preparation. Cannot release payouts, reverse commission, change commission rules, or change who has Admin Portal access.', 1, 0, 20, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'operations')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'operations', N'Operations', N'Orders, shipping, inventory, Smart Tags, customer support information and business configuration, with visibility of sales performance. No commission accounting, payouts or access management.', 1, 0, 30, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'owner-support')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owner-support', N'Owner Support', N'Customer-facing operational work across orders, Smart Tags, owners and pets. No sales, commission, payout or access management.', 1, 0, 40, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'sales')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales', N'Sales', N'Resellers, salespeople, referral credit, quotations and merchant orders, with visibility of commission earned. No stock creation, no payment approval, no payouts.', 1, 0, 50, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'marketing')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing', N'Marketing', N'Promotions, the sample pet experience, and campaign and referral reporting. No payment proofs, payouts, stock costs or access management.', 1, 0, 60, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'finance')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'finance', N'Finance', N'Payment approval, invoices and receipts, commission accounting, payouts and financial reporting. No stock creation, Smart Tag operations or access management.', 1, 0, 70, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'support')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'support', N'Support', N'Helping owners with their pets, Smart Tags and orders. No financial approval, no stock creation, no customer data downloads and no access management.', 1, 0, 80, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoles WHERE Code = N'auditor')
    INSERT INTO AdminRoles (Id, Code, Name, Description, IsSystemRole, GrantsAllCapabilities, SortOrder, CreatedAt, UpdatedAt)
    VALUES ('b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'auditor', N'Read Only / Auditor', N'Can open every module and read what is there, including the activity history, but cannot change, approve or download anything.', 1, 0, 90, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());



IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'admin.users.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('97549ab8-911c-8e1a-5a65-703dd7c17fd7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'admin.users.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'admin.roles.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ef970da1-abb2-a211-4699-87dcd700906a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'admin.roles.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'audit_log.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ae673b8b-0c06-6cab-80e0-4f41fcbdca38', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'audit_log.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('cb04fcb5-7322-4ade-c6eb-a5b4a11041f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('83c57b92-a73c-870f-39ea-bcc2275cf410', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('778207e1-1be8-108f-8d5b-48a8c2f30433', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.shipping.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c2ca8e52-4967-a9f4-c0da-e24308a3265c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.shipping.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'orders.tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('eddc0d70-bca8-8288-2315-5fd4d4826829', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'orders.tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e42ca727-0208-8146-bac9-896f11d9baac', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9f4529e3-9cb3-1cae-6e16-b1a0c53f3a8f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payment_proofs.review')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('759c62fb-40a7-5a01-128b-950b2e13dd8d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payment_proofs.review', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('44865fe0-08be-932f-2970-019f9791bd67', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('28f04898-65d7-7e39-a037-0afe07d64f95', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e3c4d7a8-0777-624c-e082-151d435156ff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.generate')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('60d2bfe0-3e95-3495-ec62-65d4ca3075a9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.generate', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.receipts.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('76ad1c9d-d782-554b-e837-688ee171953d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'inventory.costs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('dc61d91b-09c9-15f2-9614-f1242acdfa82', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'inventory.costs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8e536b76-ec39-a754-c55f-25a24513d60b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ab8276c2-8489-42d8-c057-1b0c00ade849', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('569a2602-6a15-9746-98f9-fe85938ecb05', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d522d3b6-a1b5-f42b-f325-fdc0ed07fe43', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'smart_tags.transfer')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('25a54be5-fa85-59d8-7533-1947345bce14', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'smart_tags.transfer', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('fd4ca2d1-a0f4-5f8c-f5fd-cc8465f3e0af', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'catalog.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1c56b178-ec7a-c420-4074-81aa36cf13e0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'catalog.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('614ffe3a-bda8-45ca-28c3-6dc497b55b6a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('89cb23f2-5468-fcd9-0539-bdfc35b287a4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'owners.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('42debc09-6590-64fb-3875-0d2ffcea0bf3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'owners.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c616b59a-cd3d-0712-2faa-0e8ea8b68049', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f2b0947b-ba9d-f397-b50c-355efcd69140', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'pets.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d239f8f2-948b-86ae-bb63-dc370eea40e4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'pets.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a9223453-40dd-34a9-82a0-00a2680dd385', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('379d2283-a44d-b70d-721d-c8aedcc30cd2', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('0ec5ec94-373e-444b-734f-ac8f3b2f0832', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7f83fd5f-c1da-8fe0-9b35-65ab46b04333', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_orders.fulfil')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7768e62f-79b0-bdd4-1039-701f1e93385b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_documents.send')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5b10e07a-b6cf-a8bf-15b2-12678f1240ee', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_documents.send', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('25c5d099-f880-c543-4d58-8c47ee86016e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4789b0f7-909e-bdc7-8075-83a5b858f835', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'merchant_invoices.record_payment')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('bd88a79c-0c6e-f128-afb0-4cb0633ea442', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'merchant_invoices.record_payment', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sales_commissions.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('765d2359-5779-fa22-3896-2a37fd03d6d7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sales_commissions.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payouts.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d08dbe58-dc47-31b6-a7af-fc919b8f242f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payouts.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'payouts.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('41fbc6c8-bb1e-af5d-02f2-dd172c1a8650', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'payouts.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'marketing.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ba4d8fd6-bf6f-e0b1-c03b-602d9f0e263e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'marketing.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'marketing.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8e8ba510-b7ea-3245-d27d-44ea655bbe14', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'marketing.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('84e7b4f1-00e8-3a2d-44a9-c4efbd83ecf7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'settings.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5247ef90-07aa-1127-a9e8-6e34e00c407c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'settings.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'settings.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('dcfdeac6-8a67-5ead-6f96-3ff71a848b9a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'settings.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'email_templates.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('37f4821e-f78a-ff94-f1c2-b41d181efe3f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'email_templates.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'email_templates.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('00d93162-6e15-f9de-cacc-e78ff34dfee5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'email_templates.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sample_experience.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7b5cdc66-196f-fd2d-879e-a890a88ee744', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sample_experience.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'sample_experience.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('62ec3dce-6465-adca-bf8a-d7cd074bbb7f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'sample_experience.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02' AND Capability = N'operational_status.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5d0c0b2e-f2b4-f710-eb87-290498bcbc30', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d02', N'operational_status.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'admin.users.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('70ee55db-36be-d762-ca41-ac3f2ff350bf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'admin.users.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'admin.roles.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('6dfb8ce9-ddc9-a123-7b3b-c0c23875509e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'admin.roles.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'audit_log.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('730c66b6-7bac-0ad9-44e1-4d0ed3a2cce8', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'audit_log.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9101f3de-3e12-4b41-97e8-08829e2d3425', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('01e6f65c-1f30-aec3-858e-73305a4ee954', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('bff91a29-37c4-75a0-8736-5baad505b564', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.shipping.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('98d78432-3956-b951-ca8d-9a0f0e2fbcec', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.shipping.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'orders.tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('235b4618-6fa0-78f8-78a8-ebfb21817250', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'orders.tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('14c8643e-d142-ae6f-b700-2a46f76488e3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d18396fc-0167-d977-7a8d-e71af791b2bf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'payment_proofs.review')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('30f69a7c-4972-695a-d4fe-af307a3a4e89', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'payment_proofs.review', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4221fe3d-8ae7-27e4-23ce-f9b63f18bb3d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7f48fdc8-5940-f278-3f7a-dd26463e6b71', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('581230f8-9204-c719-e3f3-e319a012c9f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.generate')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4fc89c54-80c6-2ed0-8e6c-c97d2b070607', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.generate', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.receipts.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('798f72da-caba-225e-ddc0-b2899c377afa', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'inventory.costs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c27eb3fc-d02b-3b3e-3bdd-f165ff7fa685', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'inventory.costs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c89d147f-5c77-4a6c-3cf8-f1f85b03298a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('db888d35-c938-7035-33f0-176150dfd4af', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('03918593-e15d-5c3a-9038-70d420ba8c28', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('600331b5-81e4-683d-55f0-9f7d1f6c622b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'smart_tags.transfer')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f6ec4934-1a27-c760-3460-c885caa7de03', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'smart_tags.transfer', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1609dbae-bf40-9d7d-8135-4a711c596224', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'catalog.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('21e6d739-c65c-9f0d-f463-f9736e75e013', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'catalog.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('21030b60-75a0-7ebe-6155-f9f602290156', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5db0e6fd-bdb5-ad3c-21b1-c925208684ca', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'owners.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e711a961-f074-eb93-94ab-6c94c7bde732', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'owners.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('325d00f9-78d6-7950-7934-bd09e277f71c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9e0140b2-ed14-0e79-c779-077417ad7220', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'pets.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7af9f400-7c31-5671-9105-c71c1458d2f1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'pets.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('fd180002-90df-d015-4abb-1e0e33d6166d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('cf5c75e8-4310-68b3-35f6-54644236d290', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('73b2cf31-df2e-6628-aec6-d7ebb02ef044', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_orders.fulfil')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d4efb5ac-c1e9-107b-bdd1-b1127485e151', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_documents.send')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f82b3495-28b7-cc95-7ade-1216c264837d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_documents.send', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d7bff39b-dc83-c85d-dd87-613e5e4131df', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'merchant_invoices.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a0f00f83-032c-a6bd-f894-8db3f70e2e60', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'marketing.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1cec2982-24f1-4230-5a71-1fdf033bda99', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'marketing.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'marketing.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('0da986a0-d827-d7c6-510f-407359878884', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'marketing.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1fbf200d-9441-4e94-533f-edfd137eb97b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'settings.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('14d185e4-4297-8c9b-e04b-863330bd6d5d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'settings.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'settings.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('39310b50-0cba-d341-a024-29183b28caf0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'settings.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'email_templates.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f0919e4d-2eda-e326-5741-c845e2ef4e8a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'email_templates.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'email_templates.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1ae7eb46-a9bb-ea9e-0522-7892a76ebc3a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'email_templates.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sample_experience.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('701d5a57-6bae-d3eb-f210-509a4ae9d715', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sample_experience.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'sample_experience.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b866c255-035e-785c-2c51-af10d8b01d20', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'sample_experience.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03' AND Capability = N'operational_status.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d3782e37-0ad3-4823-f9ac-a715a0a02480', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d03', N'operational_status.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'admin.users.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7a3dc534-8bbf-fcfc-b039-907f02159a09', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'admin.users.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'admin.roles.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5ac4e5c1-2784-dfe9-8e70-8529b0411317', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'admin.roles.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'audit_log.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('3aa02edb-557b-bb87-8050-b2fc81941d79', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'audit_log.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('be1a787c-d7f4-8fc5-7758-5ffe66845889', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('86d61a43-d6a7-9361-ee85-5334f6ea4449', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8970ed95-ba50-24f7-756c-57f2a83f95cc', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.shipping.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('17603598-94be-c0b8-3e96-e3118f51cbc7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.shipping.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'orders.tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('75f496cd-4b54-5aa4-2d99-c893b7e5d89d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'orders.tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d8f59d8e-cf37-bbf9-2203-b34acbbbf91b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7e8fd76c-845e-128e-72cb-e591d22f286e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'payment_proofs.review')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9b711d66-778b-b502-b1dc-c0c5debf0ef6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'payment_proofs.review', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f85b4188-4389-2d5c-49d0-c5df95bfaca1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('abced24a-c26f-4b09-bd4d-ee58133cc8a9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d4a1ce42-30b2-a1ce-0fe6-e510eec5df88', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.generate')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ef764750-3750-ba24-ccc7-4e7701a1ea81', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.generate', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.receipts.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('709c77af-0469-18d2-f9ea-81c7e0c02404', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.receipts.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'inventory.costs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5960c9b5-b631-bd56-fe92-169f8d2c3343', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'inventory.costs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('bd786928-1474-f824-bef4-818ef1cc0c76', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('04007f6c-98ea-4096-02b5-9182827debdc', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('eebda78d-0bf5-5ddb-a010-7691836677dd', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7742fd62-4f31-391b-4a80-e1e94cad3030', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'smart_tags.transfer')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('69e8cebc-ccaf-6bb1-3091-6f22cd7d83f7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'smart_tags.transfer', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4a47bb50-ece7-ebf0-11f9-f1ebe0238bff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'catalog.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('803e5c40-3a64-b38d-8297-d6e2b8043180', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'catalog.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('20451e9d-3838-55d9-dc16-3ef6910656c0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ba2788da-3bed-da5b-b3b8-3cbba9ad8b76', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'owners.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e94c7f03-fdfd-e47a-3ea8-ef14e8a3ecd5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'owners.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('512cd76d-a30e-9074-8691-8dc1da2ec052', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('67eb5a04-8826-cc19-6a81-5f411226c028', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'pets.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b7870002-8c3b-f3d4-d3f3-478e48642325', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'pets.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('541f8fc0-c4f2-8c7a-73b6-35173b2fa2da', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('6f181ab5-e4e5-6aa5-dcee-359db4fd6c81', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_orders.fulfil')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ef1cf1fb-f3f4-c8b4-975c-e594485b6f7d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_orders.fulfil', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_documents.send')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('025d6c9c-555b-d27e-0cc3-3a06e8393750', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_documents.send', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('78f9383b-250d-81bf-1558-dc8611d9e52e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'merchant_invoices.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f853e68e-a198-4d0e-7462-8d155f0c958e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'marketing.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1b9f2c9a-beca-5b1a-abbe-1366944477cf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'marketing.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'marketing.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('37236806-a1c6-373c-1cd4-f475c03f3254', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'marketing.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ff1a68c1-f451-318c-4259-76111ada6e4c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'settings.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('71447110-9947-16d0-ec19-dccf7d14e2ea', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'settings.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'settings.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7d798fae-5f91-afa0-4ca7-0a61fe2ffc59', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'settings.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'email_templates.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('66373682-4536-8cd2-a4ac-3cbf1e2b7795', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'email_templates.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'email_templates.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('59729b88-434d-d30b-897a-cc16331a3c44', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'email_templates.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'sample_experience.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('538021ed-7bee-cda8-778c-1e7faca07862', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'sample_experience.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'sample_experience.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c4435ed7-8129-cc78-b245-a1f08f83414c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'sample_experience.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04' AND Capability = N'operational_status.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7283b0d0-ce30-3998-060d-b5233b55b522', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d04', N'operational_status.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('68f403c9-7852-e27b-21c7-52c08b0dc93b', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f56ba33b-3c93-0265-571e-e74ca03aaf08', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f6b11200-47f1-e23e-8567-2424961188eb', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('53a3fcc5-f2d2-7d68-42c6-265a4d06762c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a40c7334-4fdb-2cb4-ca6b-dd04e822a514', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e8199546-8f86-07ca-3920-e7512e2e92eb', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_orders.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9d30952c-e323-85f7-c559-31c44caf226a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_orders.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_documents.send')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('632128aa-5ff5-c118-a8bc-11a01194facf', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_documents.send', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f4c355a5-d292-bc0e-7265-f5fa20290c49', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'sales_commissions.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ac091adc-d497-d62e-09df-50dee0bf66a7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'sales_commissions.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('3b5fd63f-ccb6-0c46-89c6-789f25249500', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d05', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('ec406f8b-b6eb-2fa8-ce7b-c0f9f0e493ed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7b73dbaf-eaf0-2ea7-007b-322079cb2360', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'marketing.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('be2cf51b-fa88-bbc8-b11f-16da7ceeeee2', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'marketing.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a1a80aea-b6c0-89bb-0b7d-b34f06bfbed3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'marketing.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('6f206a44-a8df-1e3b-dff2-8783bbfc12fa', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sample_experience.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('66c88b74-bd08-108b-5e44-9b9c4dbb9086', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sample_experience.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06' AND Capability = N'sample_experience.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f2a82974-7ec6-5200-9388-ac9a3575267a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d06', N'sample_experience.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'audit_log.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a954be86-f8cd-2188-7faa-520c8fdff5d3', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'audit_log.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('2aafa96f-f2c4-6e98-cb72-3129dd4887d4', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'orders.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('65f6325a-868e-2826-f584-6df02bc457c8', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'orders.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4ac83038-d3ae-2f39-f20e-135383b2745e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.export')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a8f2d956-0d05-65ad-2341-84943920e6c5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.export', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payment_proofs.review')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8ad05257-695e-8159-c3a1-f0eab83a3872', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payment_proofs.review', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'inventory.costs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('6dd360cc-9fbf-7c40-2f14-016e17ef380d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'inventory.costs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('2c342780-caa3-1c68-0e2a-b9837997f96d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('3f48d11c-235e-53ec-391d-d9e857de0199', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7d9168b9-bed5-177a-d6a1-7fcfc5c00e97', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_documents.send')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4b85a0cc-dc20-57cb-d3fd-dcf49104940d', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_documents.send', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('86617d5a-eb94-a6cd-f9be-1db7f63e100e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('79c50ba0-2156-513b-2db0-f2bb11a768f0', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'merchant_invoices.record_payment')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('84c89695-0017-af2b-e096-c67e807846ab', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'merchant_invoices.record_payment', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8ceb81a4-1698-f6ec-6bed-1d8565f81741', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.reverse')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('28864159-d7a0-f7bc-80cc-71f0e427d7ff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.reverse', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'sales_commissions.rules.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d89192fb-cc99-fa51-35e2-5a92cff5bfc1', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'sales_commissions.rules.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b535331b-ff1b-9c49-4d80-31a6bca1a130', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('12ee6285-b40a-c6da-27de-1548f2e52c59', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'payouts.settle')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('62cce0f6-214a-107f-de3c-a2e84e287687', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'payouts.settle', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b72a8b79-1237-6d68-2f5a-9fd31047ef99', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d07', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('e1df9f74-b78c-4d6b-7b20-be20fd83d5b6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('730b0818-7b0c-4ec1-42e3-a6be27f7b2ab', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('26de3449-9e67-8285-7f1b-a1c08a140592', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('d93e4085-16e0-cb8f-38f0-94b3155f2899', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'smart_tags.assign')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b5a97469-15e7-6fd0-4726-c7a5e4503a5a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'smart_tags.assign', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('fe5da8d9-511a-05f9-2522-a33fbb67bcc6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('0098bd87-54c0-8435-5bb6-715c237e4409', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'owners.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('9fd53350-ef5c-02b2-d098-c8943aca721e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'owners.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'pets.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('087142c6-254e-575a-3bd4-2ce55c00c177', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'pets.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'pets.manage')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7d6395d4-865f-b37a-3457-1ddbeeda7a34', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'pets.manage', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('2041fa5a-0443-78a9-c833-78c2a0a1fa78', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d08', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'admin.users.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('f4e23a87-4df3-2ce1-f059-37c945f97a10', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'admin.users.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'admin.roles.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b5ce351b-9b43-f954-d8a7-db6037f1537c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'admin.roles.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'audit_log.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('1f49f70b-b729-5b93-5dad-26f4f263fbed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'audit_log.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('860671b1-68e6-5a22-a8b8-34cc57000f8f', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'payment_proofs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('30ecae6f-29b3-bab7-104c-ba6436392609', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'payment_proofs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'inventory.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7fb114ea-2386-21ca-aedb-fb35905e600e', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'inventory.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'inventory.costs.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('05ca9ed7-de50-4e18-0b4d-6309cf21b2ed', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'inventory.costs.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'smart_tags.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('7595942e-56da-741b-dbdc-b99a90c60961', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'smart_tags.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'catalog.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('13818fc5-92be-6a14-0e14-6f2e0e961488', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'catalog.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'owners.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('2cb26963-13d4-8a53-37bc-d94c3c2a5037', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'owners.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'pets.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('cc9adf18-f137-2f01-627d-e3da43c56b06', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'pets.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sales.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('0e700e23-5661-7442-91f1-487f448d3249', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sales.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'merchant_orders.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('771d83e7-2566-918b-ee97-9a6e89623aff', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'merchant_orders.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'merchant_invoices.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('c1db8ae3-598d-f41b-a90d-54d2ab391ac7', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'merchant_invoices.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sales_commissions.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('3c4d3842-b4dd-a246-0ca2-9c34dc4f6720', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sales_commissions.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'payouts.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('51adde93-ad7a-68be-dbf8-318efb5a5e7c', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'payouts.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'marketing.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('a4c3d2d8-407f-bfdd-f7d0-3a5730896f9a', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'marketing.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'plans.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('8b555700-e564-87c9-a9f3-7ce188ebf5a6', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'plans.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'settings.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('4293d7ef-c1bc-af98-bfcf-9e3929e3b726', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'settings.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'email_templates.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('5789e86e-50ce-b498-736d-87ff8c24adc9', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'email_templates.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'sample_experience.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('784f833c-e9e0-eaeb-950f-ae92cf2f3f79', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'sample_experience.view', SYSDATETIMEOFFSET());

IF NOT EXISTS (SELECT 1 FROM AdminRoleCapabilities WHERE AdminRoleId = 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09' AND Capability = N'operational_status.view')
    INSERT INTO AdminRoleCapabilities (Id, AdminRoleId, Capability, CreatedAt)
    VALUES ('b2625547-819e-4de9-8992-919e614651a5', 'b2d0a0e4-9f1e-4c58-9c1b-2b6f2f2a7d09', N'operational_status.view', SYSDATETIMEOFFSET());



-- Move every existing administrator onto the built-in role that matches the
-- single role they already held. Only administrators with no role at all are
-- touched, so re-running never overwrites a deliberate assignment.
INSERT INTO AdminUserRoles (Id, AdminUserId, AdminRoleId, AssignedAt, AssignedByAdminUserId)
SELECT NEWID(), a.Id, r.Id, SYSDATETIMEOFFSET(), NULL
FROM AdminUsers a
INNER JOIN AdminRoles r ON r.Code = CASE a.Role
    WHEN 'SuperAdmin' THEN 'super-admin'
    WHEN 'Admin' THEN 'administrator'
    WHEN 'Operations' THEN 'operations'
    ELSE 'owner-support'
END
WHERE NOT EXISTS (SELECT 1 FROM AdminUserRoles x WHERE x.AdminUserId = a.Id);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Roles, their capabilities and the assignments are dropped with
            // their tables below. The legacy AdminUsers.Role column was never
            // emptied, so a rollback leaves every administrator with exactly the
            // access they had before this migration.
            migrationBuilder.DropForeignKey(
                name: "FK_AdminUsers_AdminUsers_DisabledByAdminUserId",
                table: "AdminUsers");

            migrationBuilder.DropTable(
                name: "AdminRoleCapabilities");

            migrationBuilder.DropTable(
                name: "AdminUserRoles");

            migrationBuilder.DropTable(
                name: "AdminRoles");

            migrationBuilder.DropIndex(
                name: "IX_AdminUsers_DisabledByAdminUserId",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "DisabledByAdminUserId",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "AdminUsers");
        }
    }
}
