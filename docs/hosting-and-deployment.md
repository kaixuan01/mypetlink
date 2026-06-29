# MyPetLink Hosting & Deployment Strategy

## Purpose

This document defines the recommended hosting, database, storage, and deployment architecture for the MyPetLink project.

Codex / Claude Code / AI coding assistants should refer to this document before making infrastructure, backend, database, storage, or deployment-related changes.

---

## Final Direction

MyPetLink should **not** be hosted as a single-server monolith where frontend, backend, database, and uploaded files are all stored on one VPS/server.

The project should use a managed, scalable architecture:

```txt
Cloudflare
- DNS
- CDN
- WAF
- Pages hosting

Supabase
- PostgreSQL database
- Authentication
- Early-stage file storage

.NET Web API
- Business logic
- Admin APIs
- Sensitive operations
- Payment/webhook handling
- Tag binding logic

Cloudflare R2
- Future object storage for images, PDFs, documents, and media files

Cloudflare Stream
- Future video hosting/streaming if video becomes a real feature
```

---

## Recommended Architecture

```txt
User
 ↓
Cloudflare DNS / CDN / WAF
 ↓
Cloudflare Pages
 - Landing Page
 - Owner Portal
 - Admin Portal
 - Public Pet Profile
 - QR Safety Profile

 ↓ API call

api.mypetlink.com
 ↓
.NET Web API
- Pet CRUD
- Owner account logic
- Tag binding
- QR scan logging
- Lost Mode
- Contact privacy rules
- Admin functions
- Future Premium/subscription logic
- Future payment webhook handling
- Upload signed URL generation

 ↓
Supabase PostgreSQL
 - users
 - pets
 - pet_profiles
 - tags
 - tag_bindings
 - scan_logs
 - care_records
 - reminders
 - subscriptions
 - uploaded_documents

 ↓
Storage
 - Early stage: Supabase Storage
 - Later stage: Cloudflare R2
 - Video: Cloudflare Stream
```

---

## Database Decision

Use **Supabase PostgreSQL** as the main database.

Do not replace Supabase with Cloudflare D1, SQLite, Firebase, or a self-hosted database unless there is a clear technical reason and the architecture decision is reviewed first.

Supabase is preferred because:

* It uses PostgreSQL.
* It supports relational data well.
* It works well for users, pets, tags, scans, subscriptions, and care records.
* It includes Supabase Auth.
* It supports Row Level Security.
* It has Supabase Storage for early-stage file uploads.
* It is easier to migrate later to another PostgreSQL provider if needed.

The database should store structured data only.

Examples:

```txt
Pet name
Breed
Owner ID
QR token
Lost mode status
Contact preference
Scan timestamp
Care record metadata
Document file key
```

Do not store large image, PDF, or video binary data directly in the database.

---

## Cloudflare Pages Usage

Cloudflare Pages should be used for frontend hosting.

Cloudflare Pages can host:

```txt
mypetlink.com
- Landing page
- Marketing pages
- Pricing page
- Privacy Policy
- Terms page

app.mypetlink.com
- Owner portal

admin.mypetlink.com
- Admin portal

mypetlink.com/p/{petSlug}-{publicCode}
- Public Share Profile

mypetlink.com/q/{safetyCode}
- Pet-level QR Safety Page

mypetlink.com/t/{tagCode}
- Physical tag scan link; active tags open the QR Safety Page
```

Cloudflare Pages is suitable for frontend applications such as:

```txt
React
Vite
Next.js static/export mode
Vue
Static HTML/CSS/JS
```

Cloudflare Pages should not be used to host a full ASP.NET Core / .NET Web API application.

---

## .NET Web API Hosting

The `.NET Web API` must be hosted separately from Cloudflare Pages.

Recommended hosting options:

```txt
Option 1:
Azure App Service

Option 2:
Azure Container Apps

Option 3:
Fly.io / Render / Railway using Docker
```

Preferred early-stage recommendation:

```txt
Azure App Service
```

Reason:

* Best fit for .NET.
* Simple deployment.
* Managed hosting.
* No need to manage OS, Nginx, IIS, firewall, or SSL manually.
* Easier for production support.

Recommended API domain:

```txt
api.mypetlink.com
```

The frontend should communicate with the backend using this API domain.

Example:

```txt
Frontend:
https://app.mypetlink.com

Backend:
https://api.mypetlink.com
```

---

## Backend Responsibility

The .NET Web API should handle all business logic and sensitive operations.

The frontend should not directly perform sensitive operations against the database.

The following should go through the .NET Web API:

```txt
Admin actions
Pet create/update/delete
Tag activation
Tag binding / unbinding
QR scan logging
Lost Mode update
Contact privacy logic
Future payment webhook handling
Future Premium plan update
Future subscription status update
Upload signed URL generation
Delete document
Delete pet
Family access management
Reminder logic
```

---

## Frontend Responsibility

The frontend should focus on UI and user interaction only.

Frontend applications include:

```txt
Landing page
Owner dashboard
Pet profile editor
Public profile display
QR safety profile display
Admin portal UI
```

The frontend may read public-safe data only when protected by API rules or Supabase RLS.

Public pages must never expose private owner data unless explicitly allowed by the privacy settings.

---

## Storage Strategy

### Early Stage

Use Supabase Storage first.

This is suitable for:

```txt
Pet profile images
Pet gallery images
Vaccination documents
Medical documents
Basic uploaded files
```

Reason:

* Faster to build.
* Easier integration with Supabase Auth.
* Good enough for MVP and beta stage.
* Less infrastructure complexity.

### Later Stage

Move heavier file storage to Cloudflare R2 when the product has more users or more uploaded media.

Cloudflare R2 should be used for:

```txt
Pet photos
Pet gallery images
Vaccination PDFs
Medical documents
Owner uploaded documents
Lost pet poster images
QR tag artwork
```

The database should store only the file key or URL reference.

Example:

```txt
pets.profile_photo_key = "pets/{petId}/profile.jpg"
documents.file_key = "documents/{petId}/vaccine-2026.pdf"
```

Do not store file binary data directly inside PostgreSQL.

### Video

If video becomes a real feature, use Cloudflare Stream instead of manually storing and serving video from R2.

Cloudflare Stream is better for:

```txt
Video upload
Video encoding
Adaptive playback
Streaming delivery
Video player integration
```

R2 can store video files, but it is not ideal for full video streaming workflows.

---

## Public Profile & QR Token Rules

Public pet profile and QR safety profile URLs must not expose internal database IDs.

Do not use URLs like:

```txt
/t/123
/p/1
/p/pet-1
```

Use public-safe slugs and tokens instead:

```txt
/t/8KX29A7PZQ
/p/milo-k7q2
```

The backend should resolve the token or slug internally.

Example:

```txt
/t/8KX29A7PZQ
 ↓
.NET Web API
 ↓
Find active tag binding
 ↓
Find pet public profile
 ↓
Return only public-safe fields
```

The QR token should be treated as public but non-guessable.

---

## Privacy Rules

Finder contact should not be locked behind Premium.

A finder scanning the QR code should still be able to contact the owner based on the owner’s privacy settings.

Premium is Coming Soon in Phase 1. When launched, Premium features may include:

```txt
More pets
More care records
Vaccine reminders
Deworming reminders
Grooming reminders
Vet visit history
Medication records
Allergy records
Lost Mode
Scan history
Found location reports
Document upload
Family access
Advanced profile customization
```

But basic finder contact must remain available for safety.

---

## Suggested Domain Setup

```txt
mypetlink.com
- Landing page
- Public profile route
- QR safety profile route

app.mypetlink.com
- Owner portal

admin.mypetlink.com
- Admin portal

api.mypetlink.com
- .NET Web API

assets.mypetlink.com
- Optional future CDN/custom domain for R2 assets
```

---

## Recommended Phase Plan

### Phase 1: MVP / Beta

```txt
Frontend:
Cloudflare Pages

Database:
Supabase PostgreSQL

Authentication:
Supabase Auth with Google login

Storage:
Supabase Storage

Backend:
.NET Web API hosted on Azure App Service

Domain:
Cloudflare DNS
```

Main goal:

```txt
Fast launch
Low cost
Low maintenance
Easy iteration
```

---

### Phase 2: Growth

```txt
Move heavier image/document storage to Cloudflare R2
Add signed upload URLs
Add better scan logging
Add admin analytics
Add reminder jobs
Add background workers if needed
```

---

### Phase 3: Scale

```txt
Use Cloudflare R2 for most files
Use Cloudflare Stream for videos
Use Azure Container Apps or container hosting if API/background jobs grow
Add queue-based processing if needed
Add proper monitoring/logging/alerting
```

---

## Do Not Do This Initially

Do not start with this architecture:

```txt
Single VPS
- Frontend
- Backend
- Database
- Uploaded files
- Admin portal
- Public website
```

Avoid this because it creates unnecessary maintenance:

```txt
Manual SSL
Manual server patching
Manual firewall setup
Manual database backup
Manual file backup
Disk full risk
Harder deployment rollback
Harder scaling
Higher risk if server goes down
```

For MyPetLink, QR profile availability is important. If a finder scans a QR tag and the server is down, trust in the product will be affected.

---

## AI Coding Assistant Rules

When modifying this project, Codex / Claude Code should follow these rules:

### Must Follow

```txt
Use Supabase PostgreSQL as the main database.
Use Cloudflare Pages for frontend deployment.
Use .NET Web API for business logic.
Keep sensitive logic out of the frontend.
Store uploaded file references in the database, not file binaries.
Use non-guessable public tokens for QR/tag routes.
Keep QR safety contact available for basic users.
```

### Must Not Do

```txt
Do not replace Supabase without instruction.
Do not migrate database to Cloudflare D1 without review.
Do not store large files directly in PostgreSQL.
Do not expose internal database IDs in public URLs.
Do not put admin business logic directly in the frontend.
Do not assume Cloudflare Pages can host the .NET Web API.
Do not build a single VPS deployment unless explicitly requested.
```

### Should Prefer

```txt
Managed services over self-hosting.
Simple deployment over complex infrastructure.
PostgreSQL-compatible design.
Clear separation between frontend, API, database, and storage.
Security-first handling for public QR pages.
```

---

## Environment Variables

Frontend should only use public-safe environment variables.

Example:

```txt
VITE_API_BASE_URL=https://api.mypetlink.com
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Backend should use private secrets.

Example:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_CONNECTION_STRING=
JWT_SECRET=
PAYMENT_WEBHOOK_SECRET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
```

Never expose service role keys, database connection strings, R2 secret keys, or webhook secrets in frontend code.

---

## Summary

The approved direction for MyPetLink is:

```txt
Cloudflare Pages
- Frontend hosting

Supabase PostgreSQL
- Main database

Supabase Auth
- User authentication

Supabase Storage
- Early-stage file storage

.NET Web API
- Business logic and sensitive operations

Cloudflare R2
- Future image/document/object storage

Cloudflare Stream
- Future video hosting
```

This architecture keeps MyPetLink simple, scalable, low-maintenance, and suitable for early product launch.
