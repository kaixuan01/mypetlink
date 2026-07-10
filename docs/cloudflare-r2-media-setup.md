# Cloudflare R2 Media Setup

MyPetLink stores uploaded file metadata in the API database and stores binary
files in Cloudflare R2. The current repository uses the .NET API with SQL Server
and EF Core migrations, so the media metadata migration is implemented with that
existing stack rather than Supabase/PostgreSQL.

## Buckets

Create two R2 buckets:

| Bucket | Access | Used for |
| --- | --- | --- |
| `mypetlink-public-media` | Public through custom domain | Pet profile photos, pet cover photos, public memory images/videos |
| `mypetlink-private-files` | Private only | Vaccination documents, medical documents, order receipts |

Do not expose the private bucket through the public media domain.

## Custom Domain

Map the public bucket to:

```text
https://media.mypetlink.com.my
```

The API stores only bucket names and object keys. Public URLs are generated from
`CloudflareR2:PublicBaseUrl`; signed URLs are never stored in the database.

## API Credentials

Create R2 S3-compatible access credentials with the least privilege required for
these buckets:

- Object read/write for `mypetlink-public-media`
- Object read/write for `mypetlink-private-files`
- No account-wide permissions unless your Cloudflare policy model requires them

Do not commit the access key ID or secret access key.

## Backend Configuration

Set `Storage:Provider` to `CloudflareR2` and configure `CloudflareR2`.

Environment variable form:

```text
Storage__Provider=CloudflareR2
CloudflareR2__AccountId=<cloudflare-account-id>
CloudflareR2__AccessKeyId=<r2-access-key-id>
CloudflareR2__SecretAccessKey=<r2-secret-access-key>
CloudflareR2__ServiceUrl=https://<cloudflare-account-id>.r2.cloudflarestorage.com
CloudflareR2__PublicBucketName=mypetlink-public-media
CloudflareR2__PrivateBucketName=mypetlink-private-files
CloudflareR2__PublicBaseUrl=https://media.mypetlink.com.my
CloudflareR2__PresignedUploadExpiryMinutes=5
CloudflareR2__PresignedDownloadExpiryMinutes=5
```

`ServiceUrl` can be omitted if `AccountId` is present; the API will derive the
standard R2 S3 endpoint.

Local setup with user secrets:

```powershell
cd apps/api/MyPetLink.Api
dotnet user-secrets set "Storage:Provider" "CloudflareR2"
dotnet user-secrets set "CloudflareR2:AccountId" "<cloudflare-account-id>"
dotnet user-secrets set "CloudflareR2:AccessKeyId" "<r2-access-key-id>"
dotnet user-secrets set "CloudflareR2:SecretAccessKey" "<r2-secret-access-key>"
dotnet user-secrets set "CloudflareR2:PublicBaseUrl" "https://media.mypetlink.com.my"
```

Production secrets should live in the hosting secret store, such as Azure App
Service configuration or Key Vault references.

## CORS

Configure R2 bucket CORS for direct browser PUTs from the deployed frontend
origin. Use exact origins; do not use a wildcard in production.

Example for production and local development:

```json
[
  {
    "AllowedOrigins": [
      "https://mypetlink.com.my",
      "https://www.mypetlink.com.my",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Apply CORS to both buckets if private uploads are performed from the browser.
Private downloads use short-lived signed GET URLs returned by the API after an
ownership check.

## Upload Flow

1. Authenticated frontend calls `POST /api/v1/media/uploads`.
2. API validates the owner, pet/order/memory ownership, category, MIME type,
   extension, and size.
3. API creates a Pending `MediaFile` row with a server-generated object key.
4. API returns a five-minute signed PUT URL and required headers.
5. Browser uploads directly to R2 using the returned `Content-Type`.
6. Frontend calls `POST /api/v1/media/uploads/{mediaId}/complete`.
7. API confirms the object exists and metadata matches where supported.
8. API marks the media Ready and transactionally updates the pet/memory/document
   relationship.

Pending, Failed, Deleted, and private media are not returned on public profile
responses.

## File Restrictions

| Category | MIME types | Max size |
| --- | --- | --- |
| Images | `image/jpeg`, `image/png`, `image/webp` | 10 MB |
| Videos | `video/mp4` | 50 MB |
| Documents/receipts | `application/pdf`, `image/jpeg`, `image/png` | 10 MB |

SVG, HTML, scripts, executables, unknown MIME types, empty files, oversized
files, and mismatched extensions are rejected by the API.

## Database Migration

Run the EF Core migration that adds R2 media metadata:

```powershell
dotnet ef database update --project apps/api/MyPetLink.Api/MyPetLink.Api.csproj
```

The migration is additive and preserves existing media metadata rows. Existing
rows are treated as Ready metadata-only records.

## Cleanup

`IMediaService.DeleteStalePendingUploadsAsync` soft-deletes Pending media older
than a caller-provided threshold and best-effort deletes the R2 object. Pending
media is never shown publicly even before cleanup.

Until the repo has a background worker, run cleanup from the host's scheduled
job mechanism or an admin maintenance command. Use a 24-hour threshold unless
operations requires a shorter window.

## Troubleshooting

`403` on the PUT request:

- Confirm the signed URL has not expired.
- Confirm the browser sends the exact `Content-Type` returned by the API.
- Confirm the R2 access key has write access to the target bucket.

`SignatureDoesNotMatch`:

- Do not add extra headers to the PUT request.
- Use path-style S3 requests through the configured R2 service URL.
- Make sure the frontend uses the returned URL as-is.

CORS failure:

- Add the exact frontend origin to the R2 bucket CORS config.
- Allow `PUT` and the `Content-Type` header.
- Do not rely on API CORS settings for the direct R2 PUT request.

Private file opens publicly:

- Remove any public custom domain from `mypetlink-private-files`.
- Verify private documents and receipts are stored with `IsPublic = false`.
- Use `GET /api/v1/media/{mediaId}/download` for short-lived private access.
