-- Removes the marketing demo identity from a LOCAL development database so the
-- seeder can build it again.
--
-- It deletes by the seeder's fixed identifiers and nothing else, so it cannot
-- reach a row it did not create. Every statement is scoped to one of:
--
--   owner  b4a4de70-0000-4000-8000-000000000001
--   pets   b4a4de70-0000-4000-8000-0000000000{02,03}   (Linko, Linky)
--   media  b4a4de70-0000-4000-8000-0000000000{10..14,31..35}
--   moment b4a4de70-0000-4000-8000-0000000000{21..25}
--
-- Run it against your development database only. There is no marketing demo
-- account in production to remove, because the seeder cannot run there.
--
--   sqlcmd -S "(localdb)\MSSQLLocalDB" -d MyPetLinkDev -E -i marketing/demo/scripts/reset.sql

-- Required before touching any table carrying a filtered index, which several of
-- these do. sqlcmd runs with QUOTED_IDENTIFIER off by default, and SQL Server
-- refuses the UPDATE rather than skipping the index.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Owner uniqueidentifier = 'b4a4de70-0000-4000-8000-000000000001';

DECLARE @Pets TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @Pets (Id) VALUES
    ('b4a4de70-0000-4000-8000-000000000002'),   -- Linko
    ('b4a4de70-0000-4000-8000-000000000003');   -- Linky

DECLARE @Moments TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @Moments (Id) VALUES
    ('b4a4de70-0000-4000-8000-000000000021'),
    ('b4a4de70-0000-4000-8000-000000000022'),
    ('b4a4de70-0000-4000-8000-000000000023'),
    ('b4a4de70-0000-4000-8000-000000000024'),
    ('b4a4de70-0000-4000-8000-000000000025');

DECLARE @Media TABLE (Id uniqueidentifier PRIMARY KEY);
INSERT INTO @Media (Id) VALUES
    ('b4a4de70-0000-4000-8000-000000000010'),   -- owner avatar
    ('b4a4de70-0000-4000-8000-000000000011'),   -- Linko profile
    ('b4a4de70-0000-4000-8000-000000000012'),   -- Linko cover
    ('b4a4de70-0000-4000-8000-000000000013'),   -- Linky profile
    ('b4a4de70-0000-4000-8000-000000000014'),   -- Linky cover
    ('b4a4de70-0000-4000-8000-000000000031'),
    ('b4a4de70-0000-4000-8000-000000000032'),
    ('b4a4de70-0000-4000-8000-000000000033'),
    ('b4a4de70-0000-4000-8000-000000000034'),
    ('b4a4de70-0000-4000-8000-000000000035');

IF NOT EXISTS (SELECT 1 FROM Users WHERE Id = @Owner)
BEGIN
    PRINT 'No marketing demo account found. Nothing to remove.';
    RETURN;
END

BEGIN TRANSACTION;

-- Release the picture columns first: the pet and the social profile point at
-- media rows that point back at them, so nothing can be deleted until one side
-- of each pair lets go.
UPDATE Pets SET ProfileMediaFileId = NULL, CoverMediaFileId = NULL WHERE Id IN (SELECT Id FROM @Pets);
UPDATE OwnerSocialProfiles SET AvatarMediaFileId = NULL WHERE UserId = @Owner;
UPDATE PetMemories SET CoverMediaFileId = NULL WHERE Id IN (SELECT Id FROM @Moments);

DELETE FROM MediaFileLinks WHERE MediaFileId IN (SELECT Id FROM @Media);
DELETE FROM MomentLikes WHERE MomentId IN (SELECT Id FROM @Moments);
DELETE FROM MomentPets WHERE MomentId IN (SELECT Id FROM @Moments);
DELETE FROM PetMemories WHERE Id IN (SELECT Id FROM @Moments);
DELETE FROM MediaFiles WHERE Id IN (SELECT Id FROM @Media);

DELETE FROM PetSocialProfiles WHERE PetId IN (SELECT Id FROM @Pets);
DELETE FROM PetSafetySettings WHERE PetId IN (SELECT Id FROM @Pets);
DELETE FROM PetPublicProfiles WHERE PetId IN (SELECT Id FROM @Pets);
DELETE FROM PetContacts WHERE PetId IN (SELECT Id FROM @Pets);
DELETE FROM Pets WHERE Id IN (SELECT Id FROM @Pets);

-- Handle history and the audit row written when the reserved handle was
-- assigned. The System reservation on "mypetlink" in OwnerHandleReservations is
-- deliberately left alone: it is what keeps the brand name unclaimable, and it
-- has to outlive any profile that holds the handle.
DELETE FROM OwnerHandleHistories WHERE UserId = @Owner;
DELETE FROM OwnerSocialProfiles WHERE UserId = @Owner;
DELETE FROM OwnerProfiles WHERE UserId = @Owner;
DELETE FROM ExternalLogins WHERE UserId = @Owner;
DELETE FROM RefreshTokens WHERE UserId = @Owner;
DELETE FROM Users WHERE Id = @Owner;

COMMIT TRANSACTION;

PRINT 'Marketing demo account removed. Start the API with the marketing-demo profile to rebuild it.';
