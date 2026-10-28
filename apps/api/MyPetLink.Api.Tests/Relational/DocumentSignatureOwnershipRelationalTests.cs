using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// SQL Server itself refuses a signed Delivery Order that carries a signature its signer doesn't own,
// whoever writes the row. The signer is always the issuer (CK_ConsignmentDeliveryOrder_Signature), so
// the composite key (SignatureId, SignedByAdminUserId) -> DocumentSignatures (Id, SignatoryAdminUserId)
// ties the signature's owner to both. Administrator A is AdminRecordId (account AdminAccountId);
// administrator B is CheckerAdminId (account OwnerAccountId). Every attempt below is plain SQL on the
// full migration chain, bypassing EF and the API.
public sealed partial class ConsignmentRelationalTests
{
    private const string OwnershipRule = "FK_ConsignmentDeliveryOrders_DocumentSignatures_SignatureOwner";

    private static async Task<bool> OwnershipRuleTrusted(MyPetLinkDbContext db) =>
        (await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS Value FROM sys.foreign_keys WHERE name = '" + OwnershipRule + "' AND is_not_trusted = 0 AND is_disabled = 0 "
            + "AND delete_referential_action = 0 AND update_referential_action = 0").ToListAsync()).Single() == 1;

    // Signed Delivery Orders whose signature belongs to someone other than the signer.
    private static async Task<int> CrossOwnerRows(MyPetLinkDbContext db) =>
        (await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS Value FROM ConsignmentDeliveryOrders o JOIN DocumentSignatures s ON s.Id = o.SignatureId "
            + "WHERE o.SignedByAdminUserId <> s.SignatoryAdminUserId OR o.IssuedByAdminUserId <> s.SignatoryAdminUserId").ToListAsync()).Single();

    // A copy of an issued signed Delivery Order for another delivery, issued and signed by `issuer`
    // with `signature`'s own printed details and fingerprint, so every other rule is satisfied.
    private static string SignedCopy(Guid prototypeDispatch, Guid dispatch, string number, Guid issuer, Guid signature) =>
        "INSERT INTO ConsignmentDeliveryOrders (Id, DispatchId, MerchantId, DeliveryOrderNumber, DeliveredQuantity, SnapshotJson, Content, "
        + "ContentSha256, FileName, IssuedAt, IssuedByAdminUserId, SignatureId, SignedByAdminUserId, SignedAt, SignatoryName, SignatoryPosition, "
        + $"SignatureImageSha256) SELECT NEWID(), '{dispatch}', o.MerchantId, N'{number}', o.DeliveredQuantity, o.SnapshotJson, o.Content, "
        + $"o.ContentSha256, o.FileName, o.IssuedAt, '{issuer}', s.Id, '{issuer}', o.IssuedAt, s.SignatoryName, s.SignatoryPosition, s.ImageSha256 "
        + $"FROM ConsignmentDeliveryOrders o CROSS JOIN DocumentSignatures s WHERE o.DispatchId = '{prototypeDispatch}' AND s.Id = '{signature}'";

    private static async Task<SqlException> SqlRefusal(MyPetLinkDbContext db, string sql)
    {
        // Each attempt is rolled back whatever happens, so a wrongly accepted row can't leak into the next one.
        await using var attempt = await db.Database.BeginTransactionAsync();
        try { return await Assert.ThrowsAsync<SqlException>(() => db.Database.ExecuteSqlRawAsync(sql)); }
        finally { await attempt.RollbackAsync(); }
    }

    private static async Task AssertOwnershipRefusal(MyPetLinkDbContext db, string sql)
    {
        var error = await SqlRefusal(db, sql);
        Assert.Equal(547, error.Number);
        Assert.Contains(OwnershipRule, error.Message);
    }

    private static async Task<(DocumentSignatureSummary Mine, DocumentSignatureSummary Theirs)> TwoSigners(MyPetLinkDbContext db)
    {
        await SignatureAccess(db, AdminRecordId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        await SignatureAccess(db, CheckerAdminId, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.DocumentSignatureManage);
        var mine = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(null), default)).Signature!;
        var theirs = (await Signatures(db).SaveOwnAsync(OwnerAccountId, Upload(null, "Other Synthetic Signer", "Manager"), default)).Signature!;
        return (mine, theirs);
    }

    [Fact]
    public async Task MigratedSchemaRefusesASignedDeliveryOrderCarryingAnotherAdministratorsSignature()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            Assert.True(await OwnershipRuleTrusted(db));
            var (mine, theirs) = await TwoSigners(db);
            var a = await Agreement(db);
            var signed = await Dispatched(db, a.Id, 2, "owner-signed");
            var target = await Dispatched(db, a.Id, 2, "owner-target");
            var other = await Dispatched(db, a.Id, 1, "owner-other");

            // The API already refuses A signing with B's signature, before any number is taken.
            var api = await Assert.ThrowsAsync<ApiException>(() => Signer(db).IssueDeliveryOrderAsync(AdminAccountId, target.Id, Sign(theirs.Id), default));
            Assert.Equal((403, "signature_not_yours"), (api.StatusCode, api.Code));
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, signed.Id, Sign(mine.Id), default);
            var issued = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync(o => o.DispatchId == signed.Id);

            // SQL Server refuses it too: A issues and signs with B's signature, or B with A's. Every
            // other column is complete and consistent, so only the ownership rule stands in the way.
            await AssertOwnershipRefusal(db, SignedCopy(signed.Id, target.Id, "SQL-CROSS-OWNER-1", AdminRecordId, theirs.Id));
            await AssertOwnershipRefusal(db, SignedCopy(signed.Id, target.Id, "SQL-CROSS-OWNER-2", CheckerAdminId, mine.Id));
            // An unknown signature, and a signer with no administrator record, are refused as well.
            Assert.Equal(547, (await SqlRefusal(db, SignedCopy(signed.Id, target.Id, "SQL-CROSS-OWNER-3", AdminRecordId, mine.Id)
                .Replace(", s.Id, ", $", '{Guid.NewGuid()}', "))).Number);
            Assert.Equal(547, (await SqlRefusal(db, SignedCopy(signed.Id, target.Id, "SQL-CROSS-OWNER-4", Guid.NewGuid(), mine.Id))).Number);
            Assert.False(await db.ConsignmentDeliveryOrders.AnyAsync(o => o.DispatchId == target.Id));

            // The signer's own signature is accepted, written the same way.
            await db.Database.ExecuteSqlRawAsync(SignedCopy(signed.Id, target.Id, "SQL-OWN-SIGNATURE", AdminRecordId, mine.Id));
            await db.Database.ExecuteSqlRawAsync(SignedCopy(signed.Id, other.Id, "SQL-OTHER-OWN-SIGNATURE", CheckerAdminId, theirs.Id));

            // An issued row can't be switched to someone else's signature...
            await AssertOwnershipRefusal(db, $"UPDATE ConsignmentDeliveryOrders SET SignatureId = '{theirs.Id}' WHERE DispatchId = '{target.Id}'");
            // ...and switching every identity at once to a consistent B is still an edit of an issued DO.
            Assert.Equal(51059, (await SqlRefusal(db, "UPDATE o SET SignatureId = s.Id, IssuedByAdminUserId = s.SignatoryAdminUserId, "
                + "SignedByAdminUserId = s.SignatoryAdminUserId, SignatoryName = s.SignatoryName, SignatoryPosition = s.SignatoryPosition, "
                + $"SignatureImageSha256 = s.ImageSha256 FROM ConsignmentDeliveryOrders o CROSS JOIN DocumentSignatures s WHERE o.DispatchId = '{target.Id}' AND s.Id = '{theirs.Id}'")).Number);

            // A signature's owner can't change: a version a DO was signed with is held by the rule
            // itself, and any other version by the history trigger (checked below, once retired).
            var replaced = (await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(mine.Id, "Synthetic Signatory", "Managing Director", keepImage: true), default)).Signature!;
            await AssertOwnershipRefusal(db, $"UPDATE DocumentSignatures SET SignatoryAdminUserId = '{CheckerAdminId}' WHERE Id = '{mine.Id}'");
            Assert.Equal(547, (await SqlRefusal(db, $"DELETE FROM DocumentSignatures WHERE Id = '{mine.Id}'")).Number);

            // Replacing and then removing the signature leaves every signed DO exactly as issued and still valid.
            await Signatures(db).RemoveOwnAsync(AdminAccountId, new(replaced.Id), default);
            Assert.Equal(51061, (await SqlRefusal(db, $"UPDATE DocumentSignatures SET SignatoryAdminUserId = '{CheckerAdminId}' WHERE Id = '{replaced.Id}'")).Number);
            var after = await db.ConsignmentDeliveryOrders.AsNoTracking().SingleAsync(o => o.DispatchId == signed.Id);
            Assert.Equal(issued.Content, after.Content);
            Assert.Equal((issued.ContentSha256, issued.SignatureId, issued.SignedByAdminUserId), (after.ContentSha256, after.SignatureId, after.SignedByAdminUserId));
            Assert.Equal(3, await db.ConsignmentDeliveryOrders.CountAsync(o => o.SignatureId != null));
            Assert.Equal(0, await CrossOwnerRows(db));
            Assert.True(await OwnershipRuleTrusted(db));

            // Unsigned Delivery Orders are untouched by the rule.
            var unsigned = await Dispatched(db, a.Id, 1, "owner-unsigned");
            Assert.Null((await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, unsigned.Id, default)).SignatoryName);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task ConcurrentCrossOwnerWritesNeverGetPastTheOwnershipRule()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database();
            Guid prototype; Guid[] targets; DocumentSignatureSummary mine, theirs; Guid[] legitimate;
            await using (var db = scope.NewContext())
            {
                (mine, theirs) = await TwoSigners(db);
                var a = await Agreement(db);
                prototype = (await Dispatched(db, a.Id, 2, "race-prototype")).Id;
                await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, prototype, Sign(mine.Id), default);
                targets = new Guid[6];
                for (var i = 0; i < targets.Length; i++) targets[i] = (await Dispatched(db, a.Id, 1, $"race-cross-{i}")).Id;
                legitimate = [(await Dispatched(db, a.Id, 1, "race-own-1")).Id, (await Dispatched(db, a.Id, 1, "race-own-2")).Id];
            }

            // Six cross-owner inserts race two genuine signings by A and B replacing their signature.
            var contexts = Enumerable.Range(0, 9).Select(_ => scope.NewContext()).ToArray();
            try
            {
                var cross = targets.Select((target, i) => Task.Run(async () =>
                {
                    try { await contexts[i].Database.ExecuteSqlRawAsync(SignedCopy(prototype, target, $"RACE-CROSS-{i}", AdminRecordId, theirs.Id)); return (int?)null; }
                    catch (SqlException e) { return e.Message.Contains(OwnershipRule) ? e.Number : -e.Number; }
                })).ToArray();
                var own = legitimate.Select((target, i) => Task.Run(() => Signer(contexts[6 + i]).IssueDeliveryOrderAsync(AdminAccountId, target, Sign(mine.Id), default))).ToArray();
                var replace = Task.Run(() => Signatures(contexts[8]).SaveOwnAsync(OwnerAccountId, Upload(theirs.Id, "Other Synthetic Signer", "Director", keepImage: true), default));
                Assert.All(await Task.WhenAll(cross), number => Assert.Equal(547, number));
                Assert.All(await Task.WhenAll(own), issued => Assert.Equal("Synthetic Signatory", issued.SignatoryName));
                await replace;
            }
            finally { foreach (var c in contexts) await c.DisposeAsync(); }

            await using var check = scope.NewContext();
            Assert.False(await check.ConsignmentDeliveryOrders.AnyAsync(o => targets.Contains(o.DispatchId)));
            Assert.Equal(3, await check.ConsignmentDeliveryOrders.CountAsync(o => o.SignatureId == mine.Id));
            Assert.Equal(0, await CrossOwnerRows(check));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task OwnershipMigrationKeepsSignedHistoryAndIsKeptOnceASignatureExists()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            var migrator = db.GetService<IMigrator>();
            // Back to the released schema, which had no ownership rule, while nothing is signed.
            await migrator.MigrateAsync(RecoveriesMigration);
            Assert.Equal([SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.False(await OwnershipRuleTrusted(db));

            // History written under the released schema: one signed DO, one unsigned, and a replaced signature.
            var (mine, _) = await TwoSigners(db);
            var a = await Agreement(db);
            var signed = await Dispatched(db, a.Id, 2, "history-signed");
            var unsigned = await Dispatched(db, a.Id, 1, "history-unsigned");
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, signed.Id, Sign(mine.Id), default);
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, unsigned.Id, default);
            await Signatures(db).SaveOwnAsync(AdminAccountId, Upload(mine.Id, "Synthetic Signatory", "Managing Director", keepImage: true), default);
            var before = await db.ConsignmentDeliveryOrders.AsNoTracking().OrderBy(o => o.DeliveryOrderNumber).ToListAsync();

            await db.Database.MigrateAsync();
            db.ChangeTracker.Clear();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.True(await OwnershipRuleTrusted(db));
            var after = await db.ConsignmentDeliveryOrders.AsNoTracking().OrderBy(o => o.DeliveryOrderNumber).ToListAsync();
            Assert.Equal(before.Select(o => (o.Id, o.ContentSha256, o.SnapshotJson, o.SignatureId, o.SignedByAdminUserId)),
                after.Select(o => (o.Id, o.ContentSha256, o.SnapshotJson, o.SignatureId, o.SignedByAdminUserId)));
            Assert.Equal(before.Select(o => o.Content), after.Select(o => o.Content));
            Assert.Equal(2, await db.DocumentSignatures.CountAsync(s => s.SignatoryAdminUserId == AdminRecordId));

            // Now that signatures exist, the rule can't be rolled back: no step rolls back at all.
            Assert.Contains("51066", (await Assert.ThrowsAnyAsync<Exception>(() => migrator.MigrateAsync(RecoveriesMigration))).ToString());
            db.ChangeTracker.Clear();
            Assert.Empty(await db.Database.GetPendingMigrationsAsync());
            Assert.True(await OwnershipRuleTrusted(db));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task OwnershipMigrationStopsWithoutChangingAnythingWhenHistoryHasACrossOwnerSignature()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(); await using var db = scope.NewContext();
            await db.GetService<IMigrator>().MigrateAsync(RecoveriesMigration);
            var (mine, theirs) = await TwoSigners(db);
            var a = await Agreement(db);
            var signed = await Dispatched(db, a.Id, 2, "preflight-signed");
            var target = await Dispatched(db, a.Id, 2, "preflight-cross");
            await Signer(db).IssueDeliveryOrderAsync(AdminAccountId, signed.Id, Sign(mine.Id), default);
            // The released schema accepted this row; it is exactly what the corrective migration looks for.
            await db.Database.ExecuteSqlRawAsync(SignedCopy(signed.Id, target.Id, "PREFLIGHT-CROSS-OWNER", AdminRecordId, theirs.Id));
            var before = await db.ConsignmentDeliveryOrders.AsNoTracking().OrderBy(o => o.DeliveryOrderNumber).ToListAsync();

            Assert.Contains("51065", (await Assert.ThrowsAnyAsync<Exception>(() => db.Database.MigrateAsync())).ToString());
            db.ChangeTracker.Clear();
            // Nothing was applied, reassigned or removed: the row is still there, still pointing at B's signature.
            Assert.Equal([SignatureOwnershipMigration], await db.Database.GetPendingMigrationsAsync());
            Assert.False(await OwnershipRuleTrusted(db));
            Assert.Equal(1, await CrossOwnerRows(db));
            var after = await db.ConsignmentDeliveryOrders.AsNoTracking().OrderBy(o => o.DeliveryOrderNumber).ToListAsync();
            Assert.Equal(before.Select(o => (o.Id, o.ContentSha256, o.SignatureId, o.SignedByAdminUserId)), after.Select(o => (o.Id, o.ContentSha256, o.SignatureId, o.SignedByAdminUserId)));
            Assert.Equal(0, (await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS Value FROM sys.key_constraints WHERE name = 'AK_DocumentSignatures_Id_SignatoryAdminUserId'").ToListAsync()).Single());
        }
        finally { MigratedSchema.Value = false; }
    }
}
