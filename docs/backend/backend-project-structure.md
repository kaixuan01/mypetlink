# MyPetLink Backend Project Structure

Planning recommendation for the future backend. Do not generate the backend project until explicitly requested.

Target stack:

- C# .NET 8 Web API
- SQL Server
- EF Core
- REST API
- JWT access tokens and refresh tokens
- Google Sign-In as preferred initial login
- Admin role enforcement
- Audit logs

## Recommendation

Use the **Simple MVP** structure first:

```txt
apps/api/MyPetLink.Api
```

This is the best fit for the current stage because:

- The backend does not exist yet.
- A solo developer can move faster with one deployable project.
- The first backend goal is to replace local/demo state with real users, pets, public profiles, QR Safety, orders, payment proofs, and admin operations.
- Clear folders inside one API project are enough until real complexity appears.
- Splitting into multiple projects too early creates more ceremony without improving the Phase 1 delivery path.

## Simple MVP Structure

```txt
apps/api/
  MyPetLink.Api/
    Controllers/
      AuthController.cs
      AccountController.cs
      PetsController.cs
      PublicController.cs
      MemoriesController.cs
      CareRecordsController.cs
      MediaFilesController.cs
      TagsController.cs
      OrdersController.cs
      Admin/
        AdminDashboardController.cs
        AdminOwnersController.cs
        AdminPetsController.cs
        AdminOrdersController.cs
        AdminPaymentProofsController.cs
        AdminTagsController.cs
        AdminAuditLogsController.cs
        AdminSettingsController.cs
    Data/
      MyPetLinkDbContext.cs
      EntityConfigurations/
      Migrations/
      Seed/
    Entities/
      Users/
      Pets/
      Plans/
      Media/
      Tags/
      Orders/
      Operations/
      Notifications/
    Dtos/
      Requests/
      Responses/
      Public/
      Admin/
    Services/
      Auth/
      Owners/
      Pets/
      PublicProfiles/
      Media/
      Tags/
      Orders/
      Payments/
      Admin/
      Audit/
      Notifications/
    Auth/
      JwtOptions.cs
      GoogleAuthOptions.cs
      CurrentUser.cs
      Policies.cs
    Storage/
      IFileStorageProvider.cs
      LocalFileStorageProvider.cs
      StorageOptions.cs
    Validation/
    Middleware/
      ErrorHandlingMiddleware.cs
      RequestContextMiddleware.cs
    Options/
    Program.cs
    appsettings.json
    appsettings.Development.json
  tests/
    MyPetLink.Api.Tests/
```

## Controller Rules

- Keep controllers thin.
- Controllers handle routing, auth attributes, request binding, and HTTP status selection.
- Business rules live in services.
- Services validate ownership and lifecycle/status transitions.
- Controllers return the shared response envelope:

```json
{ "data": {}, "meta": { "requestId": "..." } }
```

## Service Boundaries

### Auth Services

Responsibilities:

- Google token validation
- user lookup/create
- JWT creation
- refresh token rotation
- token revocation
- current user resolution

Phase A should implement auth before protected resource APIs so later APIs do not need auth refactors.

### Pet Services

Responsibilities:

- pet CRUD
- lifecycle transitions
- Lost Mode updates
- plan limit checks
- public code and safety code generation
- privacy-safe public projections

### Media Services

Responsibilities:

- validate uploads
- compute SHA-256
- write to configured storage provider
- create `MediaFiles` rows
- link media to memories, care records, payment proofs, and future documents

The interface should allow Local Storage, Azure Blob Storage, Amazon S3, Cloudflare R2, or a later provider without changing domain schema.

### Tag And Order Services

Responsibilities:

- secure random TagCode generation
- retail/unclaimed tag activation
- owner tag status actions
- portal order creation
- payment proof submission
- order fulfillment transitions
- tag scan resolution and scan analytics

### Admin Services

Responsibilities:

- dashboard summaries
- owner/pet/order/tag lists with pagination/search
- payment proof review
- tag inventory generation/export
- settings updates later
- audit log querying

### Audit Service

Responsibilities:

- write standard audit logs for admin mutations
- write important owner/system audit entries
- capture actor, entity, before/after values, IP address, user agent, and timestamp

## Simple MVP vs Layered Solution

### Option A: Simple MVP

```txt
apps/api/MyPetLink.Api
```

Pros:

- fastest to build
- fewer project references
- easier debugging for a solo developer
- one EF Core context and one deployable app
- enough separation through folders and interfaces

Cons:

- project can grow large over time
- domain/application boundaries rely on discipline
- future extraction may require moving files

### Option B: Layered

```txt
apps/api/src/MyPetLink.Api
apps/api/src/MyPetLink.Application
apps/api/src/MyPetLink.Domain
apps/api/src/MyPetLink.Infrastructure
apps/api/tests/MyPetLink.Tests
```

Pros:

- stronger architectural boundaries
- easier to enforce domain purity
- clearer long-term separation for a team

Cons:

- more setup before the first usable backend
- more files and references to maintain
- likely slows Phase 1 without immediate payoff

## Decision

Start with **Simple MVP**.

Use folder boundaries, service interfaces, DTOs, and EF entity configurations carefully so the code can later be split into layered projects if needed. Avoid putting business rules directly in controllers. Avoid exposing EF entities directly as API response contracts.

## Future Extraction Trigger

Consider moving to layered projects only when at least two of these are true:

- multiple developers are working on the backend
- service classes become hard to test in one project
- background jobs or notification workers need shared domain/application code
- external integrations grow beyond file storage and Google login
- deployment splits into API, worker, and admin tooling

## Security Defaults

- JWT auth and refresh tokens are Phase A.
- Google Sign-In is the preferred initial login method.
- Admin authorization is enforced by policy, not only by route naming.
- All public lookups are rate-limit candidates.
- Public identifiers are secure random strings; internal ids are never exposed in public routes.
- Audit logs are required for admin mutations from the first admin API.
