using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Entity = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OldValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Plans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PriceLabel = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    BillingNote = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Plans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    NormalizedEmail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PhoneE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    WhatsappE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    LastLoginAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlanLimits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MaxPets = table.Column<int>(type: "int", nullable: false),
                    MaxMemoriesPerPet = table.Column<int>(type: "int", nullable: false),
                    MaxMediaPerMemory = table.Column<int>(type: "int", nullable: false),
                    MaxFamilyMembers = table.Column<int>(type: "int", nullable: false),
                    MaxCareRecords = table.Column<int>(type: "int", nullable: false),
                    ScanHistoryDays = table.Column<int>(type: "int", nullable: false),
                    AllowsSmartTagAddOns = table.Column<bool>(type: "bit", nullable: false),
                    AllowsFoundReports = table.Column<bool>(type: "bit", nullable: false),
                    AllowsAdvancedThemes = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanLimits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanLimits_Plans_PlanId",
                        column: x => x.PlanId,
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AdminUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DisabledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminUsers_AdminUsers_CreatedByAdminUserId",
                        column: x => x.CreatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AdminUsers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExternalLogins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ProviderSubjectId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ProviderEmail = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    ProviderDisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalLogins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExternalLogins_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MediaFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    StorageFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    StorageProvider = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    Sha256 = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Width = table.Column<int>(type: "int", nullable: true),
                    Height = table.Column<int>(type: "int", nullable: true),
                    DurationSeconds = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaFiles_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OwnerProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OwnerDisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DefaultGeneralArea = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PrivacyDefaultsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NotificationPreferencesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    GrandfatheredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PlanOverrideJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OwnerProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OwnerProfiles_Plans_PlanId",
                        column: x => x.PlanId,
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OwnerProfiles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Pets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Species = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CustomSpecies = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    Breed = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Gender = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Color = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Birthday = table.Column<DateOnly>(type: "date", nullable: true),
                    AdoptionDay = table.Column<DateOnly>(type: "date", nullable: true),
                    EstimatedAgeLabel = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    GeneralArea = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProfileTheme = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    LifecycleStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PreviousLifecycleStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    MemorialPassedAwayDate = table.Column<DateOnly>(type: "date", nullable: true),
                    MemorialMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ShowMemorialOnPublicProfile = table.Column<bool>(type: "bit", nullable: false),
                    LostModeEnabled = table.Column<bool>(type: "bit", nullable: false),
                    LostLastSeenArea = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LostLastSeenDateTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LostMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LostRewardNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    LostExtraContactInstruction = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Bio = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PersonalityTagsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FavoriteFood = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FavoriteToy = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SafetyNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    EmergencyNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Pets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Pets_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TokenHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReplacedByTokenId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedByIp = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    RevokedByIp = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_RefreshTokens_ReplacedByTokenId",
                        column: x => x.ReplacedByTokenId,
                        principalTable: "RefreshTokens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Key = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ValueJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Category = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsPublic = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AppSettings_AdminUsers_UpdatedByAdminUserId",
                        column: x => x.UpdatedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SmartTagBatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BatchNo = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    HasNfc = table.Column<bool>(type: "bit", nullable: false),
                    Shape = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    GeneratedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    GeneratedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ExportedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    PrintedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    SentToResellerAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ResellerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Remarks = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmartTagBatches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SmartTagBatches_AdminUsers_GeneratedByAdminUserId",
                        column: x => x.GeneratedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MediaFileLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OwnerType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Caption = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    AltText = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MediaFileLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MediaFileLinks_MediaFiles_MediaFileId",
                        column: x => x.MediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CareRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    RecordDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Provider = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PublicVisibility = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CareRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CareRecords_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PetContacts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UseOwnerDefaults = table.Column<bool>(type: "bit", nullable: false),
                    OwnerDisplayName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PhoneE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    WhatsappE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    EmergencyContactE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    GeneralAreaOverride = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PetContacts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PetContacts_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PetMemories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    MomentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Type = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    Caption = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Visibility = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ShowOnPublicProfile = table.Column<bool>(type: "bit", nullable: false),
                    ShowInLifeTimeline = table.Column<bool>(type: "bit", nullable: false),
                    TimelineNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CoverMediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PetMemories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PetMemories_MediaFiles_CoverMediaFileId",
                        column: x => x.CoverMediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PetMemories_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PetPublicProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublicCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    SlugSnapshot = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ShowOwnerName = table.Column<bool>(type: "bit", nullable: false),
                    ShowGeneralArea = table.Column<bool>(type: "bit", nullable: false),
                    ShowCareBadges = table.Column<bool>(type: "bit", nullable: false),
                    ShowMoments = table.Column<bool>(type: "bit", nullable: false),
                    ShowTimeline = table.Column<bool>(type: "bit", nullable: false),
                    ShowBirthdayOnTimeline = table.Column<bool>(type: "bit", nullable: false),
                    ShowAdoptionDayOnTimeline = table.Column<bool>(type: "bit", nullable: false),
                    ShowHealthSummary = table.Column<bool>(type: "bit", nullable: false),
                    IsPublicProfileEnabled = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PetPublicProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PetPublicProfiles_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PetSafetySettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SafetyCode = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    QrSafetyEnabled = table.Column<bool>(type: "bit", nullable: false),
                    ShowPhone = table.Column<bool>(type: "bit", nullable: false),
                    ShowWhatsapp = table.Column<bool>(type: "bit", nullable: false),
                    ShowEmergencyNote = table.Column<bool>(type: "bit", nullable: false),
                    ShowFoundLocationAction = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PetSafetySettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PetSafetySettings_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FoundReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagScanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FinderMessage = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FinderContact = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Latitude = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    Longitude = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    Country = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    PreciseLocationConsent = table.Column<bool>(type: "bit", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FoundReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FoundReports_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentProofs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MediaFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    StorageFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    StorageProvider = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(600)", maxLength: 600, nullable: false),
                    Sha256 = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    PaymentReference = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    OwnerNote = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReviewedByAdminUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RejectionReason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentProofs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentProofs_AdminUsers_ReviewedByAdminUserId",
                        column: x => x.ReviewedByAdminUserId,
                        principalTable: "AdminUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentProofs_MediaFiles_MediaFileId",
                        column: x => x.MediaFileId,
                        principalTable: "MediaFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SmartTags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TagCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BatchId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    HasNfc = table.Column<bool>(type: "bit", nullable: false),
                    Shape = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ActivatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastScannedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReplacementForTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeletedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmartTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SmartTags_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SmartTags_SmartTagBatches_BatchId",
                        column: x => x.BatchId,
                        principalTable: "SmartTagBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SmartTags_SmartTags_ReplacementForTagId",
                        column: x => x.ReplacementForTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SmartTags_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TagOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderNumber = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReplacementForTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Shape = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    DeliveryFee = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PaymentStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PaymentConfirmedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    RecipientName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    DeliveryPhoneE164 = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    AddressLine1 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false),
                    AddressLine2 = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: true),
                    Postcode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    State = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DeliveryNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TrackingStatus = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TrackingNumber = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    ShippedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagOrders_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrders_SmartTags_ReplacementForTagId",
                        column: x => x.ReplacementForTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrders_SmartTags_SmartTagId",
                        column: x => x.SmartTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagOrders_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TagScans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SmartTagId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TagCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ResolvedState = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ScanTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Latitude = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    Longitude = table.Column<decimal>(type: "decimal(9,6)", precision: 9, scale: 6, nullable: true),
                    Country = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    City = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Browser = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OperatingSystem = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DeviceType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Referer = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UserAgent = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FinderConsentPreciseLocation = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TagScans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TagScans_Pets_PetId",
                        column: x => x.PetId,
                        principalTable: "Pets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TagScans_SmartTags_SmartTagId",
                        column: x => x.SmartTagId,
                        principalTable: "SmartTags",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "AppSettings",
                columns: new[] { "Id", "Category", "CreatedAt", "Description", "IsPublic", "Key", "UpdatedAt", "UpdatedByAdminUserId", "ValueJson" },
                values: new object[,]
                {
                    { new Guid("6193a01f-686c-4b11-9a05-8a6e68ae8449"), "Products", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "QR + NFC Smart Tag one-time price.", true, "tag.qr_nfc.price", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "\"RM39.90\"" },
                    { new Guid("661dfec1-4635-44d6-818a-22b6b46ceeb8"), "Payments", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Manual payment proof review mode for Phase 1.", false, "payment.mode", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "\"Manual QR Payment\"" },
                    { new Guid("aa394a86-9c14-4f89-b3ad-1f013097d7e6"), "Features", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "GPS availability label.", true, "gps.status", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "\"Coming Later\"" },
                    { new Guid("b60a097e-9407-4307-b224-e91f79838098"), "Products", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "QR Pet Tag one-time price.", true, "tag.qr.price", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "\"RM19.90\"" },
                    { new Guid("eac37b9d-aa41-4067-8f67-e481aa3d4fec"), "Features", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Premium availability label.", true, "premium.status", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, "\"Coming Soon\"" }
                });

            migrationBuilder.InsertData(
                table: "Plans",
                columns: new[] { "Id", "ArchivedAt", "BillingNote", "Code", "CreatedAt", "Description", "Name", "PriceLabel", "Status", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("1faefb03-9b58-4889-a03b-c9ed34c5fa0f"), null, "Not available in Phase 1", "Premium", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Premium features are planned for a future phase.", "Premium", "Coming Soon", "ComingSoon", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { new Guid("4e5e2a13-34c0-4a36-b1b3-30830ca642e9"), null, "Available now", "Free", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), "Free MyPetLink pet profiles for Phase 1.", "Free", "RM0", "Available", new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.InsertData(
                table: "PlanLimits",
                columns: new[] { "Id", "AllowsAdvancedThemes", "AllowsFoundReports", "AllowsSmartTagAddOns", "CreatedAt", "MaxCareRecords", "MaxFamilyMembers", "MaxMediaPerMemory", "MaxMemoriesPerPet", "MaxPets", "PlanId", "ScanHistoryDays", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("8d6684b1-b25f-4e1a-a353-48621f6fb2c2"), false, true, true, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), 100, 0, 5, 10, 3, new Guid("4e5e2a13-34c0-4a36-b1b3-30830ca642e9"), 0, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { new Guid("d65c4c7d-821b-496c-bb3d-ea5bf951d65d"), true, true, true, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), 500, 5, 20, 100, 10, new Guid("1faefb03-9b58-4889-a03b-c9ed34c5fa0f"), 365, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_CreatedByAdminUserId",
                table: "AdminUsers",
                column: "CreatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_IsActive",
                table: "AdminUsers",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_Role",
                table: "AdminUsers",
                column: "Role");

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_UserId",
                table: "AdminUsers",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AppSettings_Category",
                table: "AppSettings",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_AppSettings_IsPublic",
                table: "AppSettings",
                column: "IsPublic");

            migrationBuilder.CreateIndex(
                name: "IX_AppSettings_Key",
                table: "AppSettings",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AppSettings_UpdatedByAdminUserId",
                table: "AppSettings",
                column: "UpdatedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Action",
                table: "AuditLogs",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_ActorType_ActorId",
                table: "AuditLogs",
                columns: new[] { "ActorType", "ActorId" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_CreatedAt",
                table: "AuditLogs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Entity_EntityId",
                table: "AuditLogs",
                columns: new[] { "Entity", "EntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_PetId_DueDate",
                table: "CareRecords",
                columns: new[] { "PetId", "DueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_PetId_PublicVisibility",
                table: "CareRecords",
                columns: new[] { "PetId", "PublicVisibility" });

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_PetId_RecordDate",
                table: "CareRecords",
                columns: new[] { "PetId", "RecordDate" });

            migrationBuilder.CreateIndex(
                name: "IX_CareRecords_PetId_Type",
                table: "CareRecords",
                columns: new[] { "PetId", "Type" });

            migrationBuilder.CreateIndex(
                name: "IX_ExternalLogins_Provider_ProviderSubjectId",
                table: "ExternalLogins",
                columns: new[] { "Provider", "ProviderSubjectId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExternalLogins_UserId",
                table: "ExternalLogins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FoundReports_PetId",
                table: "FoundReports",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_FoundReports_SmartTagId",
                table: "FoundReports",
                column: "SmartTagId");

            migrationBuilder.CreateIndex(
                name: "IX_FoundReports_SubmittedAt",
                table: "FoundReports",
                column: "SubmittedAt");

            migrationBuilder.CreateIndex(
                name: "IX_FoundReports_TagScanId",
                table: "FoundReports",
                column: "TagScanId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFileLinks_MediaFileId",
                table: "MediaFileLinks",
                column: "MediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFileLinks_OwnerType_OwnerId_SortOrder",
                table: "MediaFileLinks",
                columns: new[] { "OwnerType", "OwnerId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_DeletedAt",
                table: "MediaFiles",
                column: "DeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_OwnerUserId",
                table: "MediaFiles",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_Sha256",
                table: "MediaFiles",
                column: "Sha256");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_StorageProvider",
                table: "MediaFiles",
                column: "StorageProvider");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_UploadedAt",
                table: "MediaFiles",
                column: "UploadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerProfiles_PlanId",
                table: "OwnerProfiles",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnerProfiles_UserId",
                table: "OwnerProfiles",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_MediaFileId",
                table: "PaymentProofs",
                column: "MediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_OrderId",
                table: "PaymentProofs",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_ReviewedByAdminUserId",
                table: "PaymentProofs",
                column: "ReviewedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_Status",
                table: "PaymentProofs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_UploadedAt",
                table: "PaymentProofs",
                column: "UploadedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PetContacts_PetId",
                table: "PetContacts",
                column: "PetId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_CoverMediaFileId",
                table: "PetMemories",
                column: "CoverMediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_PetId_CreatedAt",
                table: "PetMemories",
                columns: new[] { "PetId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_PetId_ShowInLifeTimeline",
                table: "PetMemories",
                columns: new[] { "PetId", "ShowInLifeTimeline" });

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_PetId_ShowOnPublicProfile",
                table: "PetMemories",
                columns: new[] { "PetId", "ShowOnPublicProfile" });

            migrationBuilder.CreateIndex(
                name: "IX_PetMemories_PetId_Visibility",
                table: "PetMemories",
                columns: new[] { "PetId", "Visibility" });

            migrationBuilder.CreateIndex(
                name: "IX_PetPublicProfiles_IsPublicProfileEnabled_UpdatedAt",
                table: "PetPublicProfiles",
                columns: new[] { "IsPublicProfileEnabled", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PetPublicProfiles_PetId",
                table: "PetPublicProfiles",
                column: "PetId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PetPublicProfiles_PublicCode",
                table: "PetPublicProfiles",
                column: "PublicCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Pets_CreatedAt",
                table: "Pets",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_LifecycleStatus",
                table: "Pets",
                column: "LifecycleStatus");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_LostModeEnabled",
                table: "Pets",
                column: "LostModeEnabled");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_OwnerUserId",
                table: "Pets",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_OwnerUserId_LifecycleStatus",
                table: "Pets",
                columns: new[] { "OwnerUserId", "LifecycleStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_PetSafetySettings_PetId",
                table: "PetSafetySettings",
                column: "PetId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PetSafetySettings_QrSafetyEnabled_UpdatedAt",
                table: "PetSafetySettings",
                columns: new[] { "QrSafetyEnabled", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PetSafetySettings_SafetyCode",
                table: "PetSafetySettings",
                column: "SafetyCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlanLimits_PlanId",
                table: "PlanLimits",
                column: "PlanId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Plans_Code",
                table: "Plans",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Plans_Status",
                table: "Plans",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_ExpiresAt",
                table: "RefreshTokens",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_ReplacedByTokenId",
                table: "RefreshTokens",
                column: "ReplacedByTokenId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_TokenHash",
                table: "RefreshTokens",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_UserId",
                table: "RefreshTokens",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_BatchNo",
                table: "SmartTagBatches",
                column: "BatchNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_GeneratedAt",
                table: "SmartTagBatches",
                column: "GeneratedAt");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_GeneratedByAdminUserId",
                table: "SmartTagBatches",
                column: "GeneratedByAdminUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_HasNfc",
                table: "SmartTagBatches",
                column: "HasNfc");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTagBatches_Shape",
                table: "SmartTagBatches",
                column: "Shape");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_BatchId",
                table: "SmartTags",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_LastScannedAt",
                table: "SmartTags",
                column: "LastScannedAt");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_OrderId",
                table: "SmartTags",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_OwnerUserId",
                table: "SmartTags",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_PetId",
                table: "SmartTags",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_ReplacementForTagId",
                table: "SmartTags",
                column: "ReplacementForTagId");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_Status",
                table: "SmartTags",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_Status_PetId",
                table: "SmartTags",
                columns: new[] { "Status", "PetId" });

            migrationBuilder.CreateIndex(
                name: "IX_SmartTags_TagCode",
                table: "SmartTags",
                column: "TagCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_CreatedAt",
                table: "TagOrders",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_OrderNumber",
                table: "TagOrders",
                column: "OrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_OwnerUserId",
                table: "TagOrders",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_PaymentStatus",
                table: "TagOrders",
                column: "PaymentStatus");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_PaymentStatus_CreatedAt",
                table: "TagOrders",
                columns: new[] { "PaymentStatus", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_PetId",
                table: "TagOrders",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_ReplacementForTagId",
                table: "TagOrders",
                column: "ReplacementForTagId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_SmartTagId",
                table: "TagOrders",
                column: "SmartTagId");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_Status",
                table: "TagOrders",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_TagOrders_Status_CreatedAt",
                table: "TagOrders",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_Country_City",
                table: "TagScans",
                columns: new[] { "Country", "City" });

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_PetId",
                table: "TagScans",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_PetId_ScanTime",
                table: "TagScans",
                columns: new[] { "PetId", "ScanTime" });

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_ResolvedState",
                table: "TagScans",
                column: "ResolvedState");

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_ScanTime",
                table: "TagScans",
                column: "ScanTime");

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_SmartTagId",
                table: "TagScans",
                column: "SmartTagId");

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_SmartTagId_ScanTime",
                table: "TagScans",
                columns: new[] { "SmartTagId", "ScanTime" });

            migrationBuilder.CreateIndex(
                name: "IX_TagScans_TagCode",
                table: "TagScans",
                column: "TagCode");

            migrationBuilder.CreateIndex(
                name: "IX_Users_CreatedAt",
                table: "Users",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Status",
                table: "Users",
                column: "Status");

            migrationBuilder.AddForeignKey(
                name: "FK_FoundReports_SmartTags_SmartTagId",
                table: "FoundReports",
                column: "SmartTagId",
                principalTable: "SmartTags",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_FoundReports_TagScans_TagScanId",
                table: "FoundReports",
                column: "TagScanId",
                principalTable: "TagScans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_PaymentProofs_TagOrders_OrderId",
                table: "PaymentProofs",
                column: "OrderId",
                principalTable: "TagOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_SmartTags_TagOrders_OrderId",
                table: "SmartTags",
                column: "OrderId",
                principalTable: "TagOrders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AdminUsers_Users_UserId",
                table: "AdminUsers");

            migrationBuilder.DropForeignKey(
                name: "FK_Pets_Users_OwnerUserId",
                table: "Pets");

            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_Users_OwnerUserId",
                table: "SmartTags");

            migrationBuilder.DropForeignKey(
                name: "FK_TagOrders_Users_OwnerUserId",
                table: "TagOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_SmartTagBatches_AdminUsers_GeneratedByAdminUserId",
                table: "SmartTagBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_SmartTags_Pets_PetId",
                table: "SmartTags");

            migrationBuilder.DropForeignKey(
                name: "FK_TagOrders_Pets_PetId",
                table: "TagOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_TagOrders_SmartTags_ReplacementForTagId",
                table: "TagOrders");

            migrationBuilder.DropForeignKey(
                name: "FK_TagOrders_SmartTags_SmartTagId",
                table: "TagOrders");

            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "CareRecords");

            migrationBuilder.DropTable(
                name: "ExternalLogins");

            migrationBuilder.DropTable(
                name: "FoundReports");

            migrationBuilder.DropTable(
                name: "MediaFileLinks");

            migrationBuilder.DropTable(
                name: "OwnerProfiles");

            migrationBuilder.DropTable(
                name: "PaymentProofs");

            migrationBuilder.DropTable(
                name: "PetContacts");

            migrationBuilder.DropTable(
                name: "PetMemories");

            migrationBuilder.DropTable(
                name: "PetPublicProfiles");

            migrationBuilder.DropTable(
                name: "PetSafetySettings");

            migrationBuilder.DropTable(
                name: "PlanLimits");

            migrationBuilder.DropTable(
                name: "RefreshTokens");

            migrationBuilder.DropTable(
                name: "TagScans");

            migrationBuilder.DropTable(
                name: "MediaFiles");

            migrationBuilder.DropTable(
                name: "Plans");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "AdminUsers");

            migrationBuilder.DropTable(
                name: "Pets");

            migrationBuilder.DropTable(
                name: "SmartTags");

            migrationBuilder.DropTable(
                name: "SmartTagBatches");

            migrationBuilder.DropTable(
                name: "TagOrders");
        }
    }
}
