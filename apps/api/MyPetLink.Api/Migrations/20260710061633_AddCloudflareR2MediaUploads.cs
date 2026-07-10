using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyPetLink.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCloudflareR2MediaUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CoverMediaFileId",
                table: "Pets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProfileMediaFileId",
                table: "Pets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BucketName",
                table: "MediaFiles",
                type: "nvarchar(160)",
                maxLength: 160,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "MediaFiles",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "Other");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CompletedAt",
                table: "MediaFiles",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "MediaFiles",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "MediaType",
                table: "MediaFiles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Document");

            migrationBuilder.AddColumn<string>(
                name: "ObjectKey",
                table: "MediaFiles",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "PetId",
                table: "MediaFiles",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ThumbnailObjectKey",
                table: "MediaFiles",
                type: "nvarchar(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UploadStatus",
                table: "MediaFiles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Ready");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_CoverMediaFileId",
                table: "Pets",
                column: "CoverMediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_Pets_ProfileMediaFileId",
                table: "Pets",
                column: "ProfileMediaFileId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_BucketName_ObjectKey",
                table: "MediaFiles",
                columns: new[] { "BucketName", "ObjectKey" },
                unique: true,
                filter: "[ObjectKey] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_Category",
                table: "MediaFiles",
                column: "Category");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_CompletedAt",
                table: "MediaFiles",
                column: "CompletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_IsPublic",
                table: "MediaFiles",
                column: "IsPublic");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_MediaType",
                table: "MediaFiles",
                column: "MediaType");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_PetId",
                table: "MediaFiles",
                column: "PetId");

            migrationBuilder.CreateIndex(
                name: "IX_MediaFiles_UploadStatus",
                table: "MediaFiles",
                column: "UploadStatus");

            migrationBuilder.AddForeignKey(
                name: "FK_MediaFiles_Pets_PetId",
                table: "MediaFiles",
                column: "PetId",
                principalTable: "Pets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Pets_MediaFiles_CoverMediaFileId",
                table: "Pets",
                column: "CoverMediaFileId",
                principalTable: "MediaFiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Pets_MediaFiles_ProfileMediaFileId",
                table: "Pets",
                column: "ProfileMediaFileId",
                principalTable: "MediaFiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_MediaFiles_Pets_PetId",
                table: "MediaFiles");

            migrationBuilder.DropForeignKey(
                name: "FK_Pets_MediaFiles_CoverMediaFileId",
                table: "Pets");

            migrationBuilder.DropForeignKey(
                name: "FK_Pets_MediaFiles_ProfileMediaFileId",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_Pets_CoverMediaFileId",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_Pets_ProfileMediaFileId",
                table: "Pets");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_BucketName_ObjectKey",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_Category",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_CompletedAt",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_IsPublic",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_MediaType",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_PetId",
                table: "MediaFiles");

            migrationBuilder.DropIndex(
                name: "IX_MediaFiles_UploadStatus",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "CoverMediaFileId",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "ProfileMediaFileId",
                table: "Pets");

            migrationBuilder.DropColumn(
                name: "BucketName",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "MediaType",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "ObjectKey",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "PetId",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "ThumbnailObjectKey",
                table: "MediaFiles");

            migrationBuilder.DropColumn(
                name: "UploadStatus",
                table: "MediaFiles");
        }
    }
}
