# MyPetLink API

Initial .NET 8 Web API skeleton for the MyPetLink backend.

## Project

```txt
apps/api/
  MyPetLink.Api.sln
  MyPetLink.Api/
    Controllers/
    Data/
    Entities/
    DTOs/
    Services/
    Auth/
    Storage/
    Validation/
    Middleware/
    Common/
```

## Local Database

Development defaults to SQL Server LocalDB:

```txt
Server=(localdb)\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;
```

Override with:

```txt
ConnectionStrings__MyPetLinkDb
```

## Commands

Run from the repository root:

```bash
dotnet restore apps/api/MyPetLink.Api.sln
dotnet build apps/api/MyPetLink.Api.sln
dotnet run --project apps/api/MyPetLink.Api
```

Swagger runs in development at:

```txt
https://localhost:<port>/swagger
```

## EF Core Migrations

`dotnet-ef` was not installed when this skeleton was generated, so `InitialCreate` was not created yet.

After installing EF tooling, run:

```bash
dotnet ef migrations add InitialCreate --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api --output-dir Data/Migrations
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Do not run production migrations from local development settings.

## Current Skeleton Scope

- SQL Server EF Core `MyPetLinkDbContext` with Phase 1 entities, indexes, restrictive FK behavior, and seed defaults for Free/Premium plans and app settings.
- `/api/v1` controller route skeletons with response envelopes.
- JWT bearer authentication wiring and admin authorization policy placeholder.
- Google login endpoint placeholder only; no OAuth validation logic yet.
- Audit log service placeholder for admin mutations.
- Local file storage provider abstraction for development only.
- No payment gateway, Premium subscription, GPS tracking, outbound notifications, or real upload workflow yet.
