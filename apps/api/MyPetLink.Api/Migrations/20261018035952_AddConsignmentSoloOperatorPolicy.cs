using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConsignmentSoloOperatorPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReviewMode",
                table: "ConsignmentMovements",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovalReviewMode",
                table: "ConsignmentAgreements",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConsignmentApprovalPolicies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    SelfReviewerAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentApprovalPolicies", x => x.Id);
                    table.CheckConstraint("CK_ConsignmentApprovalPolicy", "[Id] = 1 AND [Mode] IN ('Team','Solo') AND ([Mode] = 'Team' OR [SelfReviewerAdminUserId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_ConsignmentApprovalPolicies_AdminUsers_SelfReviewerAdminUserId",
                        column: x => x.SelfReviewerAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentApprovalPolicies_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsignmentReviewEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AgreementId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DispatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Action = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReviewMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PolicyMode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    PreviousPolicyMode = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    SelfReviewerAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PreviousSelfReviewerAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RequestReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    PolicyVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ActorAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ExternalEvidenceReference = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsignmentReviewEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsignmentReviewEvents_AdminUsers_ActorAdminUserId",
                        column: x => x.ActorAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentReviewEvents_AdminUsers_PreviousSelfReviewerAdminUserId",
                        column: x => x.PreviousSelfReviewerAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentReviewEvents_AdminUsers_SelfReviewerAdminUserId",
                        column: x => x.SelfReviewerAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentReviewEvents_ConsignmentAgreements_AgreementId",
                        column: x => x.AgreementId,
                        principalTable: "ConsignmentAgreements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ConsignmentReviewEvents_ConsignmentDispatches_DispatchId",
                        column: x => x.DispatchId,
                        principalTable: "ConsignmentDispatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentApprovalPolicies_SelfReviewerAdminUserId",
                table: "ConsignmentApprovalPolicies",
                column: "SelfReviewerAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentApprovalPolicies_UpdatedByAdminUserId",
                table: "ConsignmentApprovalPolicies",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_ActorAdminUserId",
                table: "ConsignmentReviewEvents",
                column: "ActorAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_AgreementId",
                table: "ConsignmentReviewEvents",
                column: "AgreementId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_DispatchId_Action_RequestReference",
                table: "ConsignmentReviewEvents",
                columns: new[] { "DispatchId", "Action", "RequestReference" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_PreviousSelfReviewerAdminUserId",
                table: "ConsignmentReviewEvents",
                column: "PreviousSelfReviewerAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_RecordedAt_ReviewMode",
                table: "ConsignmentReviewEvents",
                columns: new[] { "RecordedAt", "ReviewMode" });

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentReviewEvents_SelfReviewerAdminUserId",
                table: "ConsignmentReviewEvents",
                column: "SelfReviewerAdminUserId");
            migrationBuilder.Sql("INSERT INTO ConsignmentApprovalPolicies(Id,Mode) VALUES(1,'Team');");
            migrationBuilder.Sql("""
                EXEC(N'CREATE TRIGGER TR_ConsignmentReviewEvents_AppendOnly ON ConsignmentReviewEvents
                AFTER UPDATE, DELETE AS
                BEGIN
                    SET NOCOUNT ON;
                    THROW 51042, ''Consignment review history is append-only.'', 1;
                END;');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS(SELECT 1 FROM ConsignmentReviewEvents WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentApprovalPolicies WITH(TABLOCKX,HOLDLOCK) WHERE UpdatedAt IS NOT NULL)
                  OR EXISTS(SELECT 1 FROM ConsignmentAgreements WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentDispatches WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentUnits WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentMovements WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentHandoverRecords WITH(TABLOCKX,HOLDLOCK))
                  OR EXISTS(SELECT 1 FROM ConsignmentDraftContributors WITH(TABLOCKX,HOLDLOCK))
                    THROW 51040, 'Consignment rollback blocked: retain approval policy, review and custody evidence.', 1;
                """);
            migrationBuilder.DropTable(
                name: "ConsignmentApprovalPolicies");

            migrationBuilder.DropTable(
                name: "ConsignmentReviewEvents");

            migrationBuilder.DropColumn(
                name: "ReviewMode",
                table: "ConsignmentMovements");

            migrationBuilder.DropColumn(
                name: "ApprovalReviewMode",
                table: "ConsignmentAgreements");
        }
    }
}
