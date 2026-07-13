# Database Persistence Audit

## F-01 corrected schema finding

The prior audit incorrectly reported that Favourite Food and Favourite Toy had no entity properties or columns.

- Entity: `Pet.FavoriteFood`, `Pet.FavoriteToy`
- Table: `dbo.Pets`
- Columns: nullable `FavoriteFood`, nullable `FavoriteToy`
- Origin migration: `20260703020004_InitialCreate`
- Current snapshot: both properties present in `MyPetLinkDbContextModelSnapshot`
- Current EF status: `dotnet ef migrations has-pending-model-changes` reports no changes

The columns use the existing schema type `nvarchar(max) NULL`; the frontend and API enforce the product limit of 80 characters. No narrowing/alter migration was introduced because that would not be the requested additive nullable-column change and could create unnecessary compatibility risk.

## Persistence implementation

- Create assigns normalized request values to the existing entity properties.
- Update applies provided values; whitespace/empty input normalizes to `NULL`.
- Omitted values remain unchanged for partial-update safety.
- Detail and public response DTOs now map the saved entity values.
- Ownership filtering remains in `LoadOwnedPetAsync`; another owner's ID returns the existing privacy-preserving 404.

## Migration result

**New migration created: none.** Creating another `FavoriteFood`/`FavoriteToy` migration would duplicate existing columns; creating an empty migration would misrepresent the schema change. The local database was updated only to the repository's latest existing migration, `20260712094248_AddPetCoverFocalPosition`. Production was not changed.

## Local live verification

Using SQL Server LocalDB `MyPetLinkDev` and the Development-only real JWT/API path:

1. Created a pet with multilingual/emoji Favourite Food and Toy values.
2. Confirmed the create response and authenticated GET returned both values.
3. Queried `dbo.Pets` directly with `sqlcmd`; both exact values were present.
4. Confirmed the public API returned both values.
5. Sent empty strings; response, owner reload, and direct SQL all confirmed database `NULL`.
6. Sent 81 characters; API returned HTTP 400.
7. Restored unique values, logged out, logged back in, and confirmed both values reloaded.

## Remaining live tests

- Repeat against a disposable environment that matches production SQL configuration.
- Complete the signed-in browser Edit Pet save/refresh/logout-login flow.
- Verify production deployment and migration history before release; do not apply migrations blindly.
- Other fields, media lifecycle, concurrency, and transaction behavior remain outside this F-01/F-02 verification.
