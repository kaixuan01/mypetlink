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
dotnet tool restore
dotnet restore apps/api/MyPetLink.Api.sln
dotnet build apps/api/MyPetLink.Api.sln
dotnet run --project apps/api/MyPetLink.Api --launch-profile http
```

Local endpoints (Development, `http` profile on port 5281):

```txt
http://localhost:5281/swagger
http://localhost:5281/health
http://localhost:5281/api/v1/health
```

## EF Core Migrations

`dotnet-ef` is installed as a **local tool** pinned in the repo-root manifest at `.config/dotnet-tools.json` (version matches the EF Core packages). After cloning, restore it once:

```bash
dotnet tool restore
```

The `InitialCreate` migration exists in `apps/api/MyPetLink.Api/Migrations/` and creates all 23 Phase 1 tables plus the Free/Premium plan, plan limit, and app-setting seed rows.

Create the local database / apply migrations (run from the repository root):

```bash
dotnet ef database update --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Add a new migration after entity changes:

```bash
dotnet ef migrations add <MigrationName> --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
```

Reset the local database (safe while it only holds local dev data):

```bash
dotnet ef database drop --project apps/api/MyPetLink.Api --startup-project apps/api/MyPetLink.Api
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
