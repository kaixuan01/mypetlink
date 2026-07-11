-- ---------------------------------------------------------------------------
-- Public media bucket diagnostics + corrective guidance
-- ---------------------------------------------------------------------------
-- Context: pet profile and cover photos are PUBLIC media and must live in the
-- public bucket (mypetlink-public-media) and be served from the public media
-- domain (https://media.mypetlink.com.my/<objectKey>). The object key never
-- contains the bucket name.
--
-- These statements are READ-ONLY diagnostics plus a reviewed, SINGLE-RECORD
-- corrective template. Do NOT run a blanket UPDATE across MediaFiles. Confirm
-- the object actually exists in the public bucket before changing any row.
-- ---------------------------------------------------------------------------

-- 1) Inspect the profile photo of a specific pet (@PetId).
DECLARE @PetId uniqueidentifier = '00000000-0000-0000-0000-000000000000'; -- <- set me

SELECT
    mf.Id,
    mf.BucketName,
    mf.ObjectKey,
    mf.StoragePath,
    mf.StorageFileName,
    mf.IsPublic,
    mf.Category,
    mf.UploadStatus,
    mf.PetId
FROM dbo.MediaFiles mf
WHERE mf.Id IN (
    SELECT ProfileMediaFileId
    FROM dbo.Pets
    WHERE Id = @PetId
);

-- 2) Find any PUBLIC-category media that is mis-stored in the private bucket,
--    or whose object key accidentally contains a bucket name. These are the
--    rows that render as a broken/relative image.
SELECT
    mf.Id,
    mf.BucketName,
    mf.ObjectKey,
    mf.IsPublic,
    mf.Category,
    mf.UploadStatus,
    mf.PetId
FROM dbo.MediaFiles mf
WHERE mf.Category IN ('PetProfilePhoto', 'PetCoverPhoto', 'MomentImage', 'MomentVideo')
  AND (
        mf.BucketName = 'mypetlink-private-files'
     OR mf.IsPublic = 0
     OR mf.ObjectKey LIKE 'mypetlink-public-media/%'
     OR mf.ObjectKey LIKE 'mypetlink-private-files/%'
  );

-- ---------------------------------------------------------------------------
-- 3) Reviewed SINGLE-RECORD correction.
--
-- Only apply this AFTER confirming (via the Cloudflare R2 dashboard or API)
-- that the object exists in the public bucket at the given object key. Set
-- @MediaId to the exact row and, if the object key had a bucket name baked in,
-- set @CleanObjectKey to the key WITHOUT the bucket prefix.
--
-- Example bad value:  ObjectKey = 'mypetlink-private-files/pets/<id>/profile/<file>.jpg'
-- Corrected value:    ObjectKey = 'pets/<id>/profile/<file>.jpg'
-- ---------------------------------------------------------------------------
-- BEGIN TRANSACTION;
--
-- DECLARE @MediaId uniqueidentifier = '00000000-0000-0000-0000-000000000000';
-- DECLARE @CleanObjectKey nvarchar(600) = 'pets/<petId>/profile/<file>.jpg';
--
-- UPDATE dbo.MediaFiles
-- SET BucketName = 'mypetlink-public-media',
--     ObjectKey  = @CleanObjectKey,
--     StoragePath = @CleanObjectKey,
--     IsPublic   = 1,
--     UploadStatus = 'Ready'
-- WHERE Id = @MediaId
--   AND Category IN ('PetProfilePhoto', 'PetCoverPhoto', 'MomentImage', 'MomentVideo');
--
-- -- Verify exactly one row changed and the values look right, THEN COMMIT.
-- -- ROLLBACK;  -- COMMIT;
