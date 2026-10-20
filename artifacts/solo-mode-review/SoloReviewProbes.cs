using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit.Abstractions;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Independent Solo Operator Mode review probes. Synthetic data, disposable SQL Server only.
[Collection("PDF document rendering")]
public sealed class SoloReviewProbes(ITestOutputHelper log)
{
    static readonly Guid Branch = Guid.Parse("e7000000-0000-0000-0000-0000000000b1");
    static readonly Guid UserB = OwnerAccountId, UserC = Guid.Parse("e7000000-0000-0000-0000-0000000000c3");
    static readonly Guid AdminB = Guid.Parse("e7000000-0000-0000-0000-0000000000a2"), AdminC = Guid.Parse("e7000000-0000-0000-0000-0000000000a3");
    static readonly Guid A = AdminAccountId; // founder user; admin record = AdminRecordId
    const string Signed = "SYN-SIGNED-ACCEPT-001";

    static readonly string[] FounderCaps = [AdminCapabilities.ConsignmentView, AdminCapabilities.ConsignmentAgreementsManage, AdminCapabilities.ConsignmentAgreementsApprove,
        AdminCapabilities.ConsignmentAllocate, AdminCapabilities.ConsignmentDispatch, AdminCapabilities.ConsignmentReconcile, AdminCapabilities.ConsignmentReturn,
        AdminCapabilities.ConsignmentRelease, AdminCapabilities.ConsignmentWriteOff, AdminCapabilities.ConsignmentManifestExport,
        AdminCapabilities.ConsignmentSelfReview, AdminCapabilities.ConsignmentPolicyManage];

    static async Task<RelationalScope> Db(int stock)
    {
        Assert.True(RelationalDatabase.IsAvailable);
        var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await using var db = scope.NewContext();
        await SeedAsync(db, qrStock: 0, nfcStock: stock);
        await ReceivedStockFixture.ReceiveAllAsync(db, NfcVariantId);
        db.Users.Add(new User { Id = UserC, Email = "qa.c@mypetlink.local", NormalizedEmail = "QA.C@MYPETLINK.LOCAL", DisplayName = "QA Super C", Status = UserStatus.Active, CreatedAt = Now, UpdatedAt = Now });
        db.AdminUsers.Add(new AdminUser { Id = AdminB, UserId = UserB, IsActive = true });
        db.AdminUsers.Add(new AdminUser { Id = AdminC, UserId = UserC, IsActive = true });
        var founder = new AdminRoleDefinition { Code = "QA-FOUNDER", Name = "QA founder" };
        foreach (var c in FounderCaps) founder.Capabilities.Add(new AdminRoleCapability { Capability = c });
        founder.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminRecordId });
        var ops = new AdminRoleDefinition { Code = "QA-OPS", Name = "QA ops (no self-review)" };
        foreach (var c in FounderCaps.Where(c => c != AdminCapabilities.ConsignmentSelfReview && c != AdminCapabilities.ConsignmentPolicyManage)) ops.Capabilities.Add(new AdminRoleCapability { Capability = c });
        ops.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminB });
        var super = new AdminRoleDefinition { Code = "QA-SUPER", Name = "QA unrelated super", GrantsAllCapabilities = true };
        super.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminC });
        db.AdminRoles.AddRange(founder, ops, super);
        db.ConsignmentApprovalPolicies.Add(new ConsignmentApprovalPolicy { Mode = ConsignmentApprovalMode.Team }); // mirrors the migration seed (Team)
        db.MerchantBranches.Add(new MerchantBranch { Id = Branch, MerchantId = MerchantId, Name = "SYN branch", AddressLine1 = "1 Synthetic Road", Postcode = "50000", City = "KL", State = "KL", Country = "Malaysia", IsActive = true });
        var tags = await db.SmartTags.OrderBy(t => t.Id).ToListAsync();
        const string al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (var i = 0; i < tags.Count; i++) tags[i].TagCode = "MPL-TEST-" + new string([al[(i / 1024) % 32], al[(i / 32) % 32], al[i % 32], 'S']);
        var id = await db.BusinessIdentitySettings.SingleAsync();
        id.LegalBusinessName = "SYN Seller"; id.BrandName = "MyPetLink"; id.BusinessRegistrationNumber = "SYN-REG"; id.RegisteredAddressLine1 = "Addr";
        id.RegisteredPostcode = "50000"; id.RegisteredCity = "KL"; id.RegisteredState = "KL"; id.RegisteredCountry = "Malaysia"; id.SupportEmail = "syn@example.invalid";
        await db.SaveChangesAsync();
        return scope;
    }
    static ConsignmentService S(MyPetLinkDbContext db, DateTimeOffset? at = null)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor()); var c = new FixedClock(at ?? Now);
        return new(db, audit, new BusinessIdentityService(db, audit, c), new DocumentNumberService(db), c, new AdminAccessResolver(db, new StubCurrentUserService(A)));
    }
    static SaveConsignmentAgreementRequest Terms() => new(MerchantId, "SYN-AGR", 35m, Now.AddDays(-1), null,
        "SYN duration", "SYN settlement", 14, "SYN discounts", "SYN returns", "SYN loss", Signed, "SYN-TRACKER");
    static ReserveConsignmentRequest R(Guid agreement, int qty, string key) => new(agreement,
        "SYN branch, 1 Synthetic Road, 50000, KL, KL, Malaysia", "SYN-TRACKER", key, [new(NfcVariantId, qty)], Branch);
    static ConsignmentActionRequest Act(ConsignmentDispatchResponse d, string reference, IReadOnlyList<Guid>? units = null) => new(d.ConcurrencyToken, reference, units);
    static ConsignmentSelfReview Att(string evidence) => new(true, "Solo founder self-review with retained partner evidence", evidence);
    static ConsignmentReceiptEvidence Rx(int qty, int damaged, int missing, string evidence, IEnumerable<Guid>? good = null, IEnumerable<Guid>? dmg = null, IEnumerable<Guid>? miss = null, IEnumerable<Guid>? ret = null)
        => new("SYN recipient", Now, qty, damaged, missing, evidence, good?.ToArray(), dmg?.ToArray(), miss?.ToArray(), ret?.ToArray());
    async Task<string> Err(Func<Task> f) { try { await f(); return "OK"; } catch (ApiException e) { return $"{e.StatusCode} {e.Code}: {e.Message}"; } }
    static async Task<string> Policy(MyPetLinkDbContext db, Guid actor, string mode, Guid? nominee, bool confirmed = true, string? token = null)
    {
        try { token ??= (await S(db).ApprovalPolicyAsync(actor, default)).ConcurrencyToken;
              var p = await S(db).SaveApprovalPolicyAsync(actor, new(token, mode, nominee, confirmed, "Synthetic QA policy change reason"), default);
              return $"OK mode={p.Mode} founder={(p.SelfReviewerAdminUserId == AdminRecordId ? "A" : p.SelfReviewerAdminUserId == AdminC ? "C" : p.SelfReviewerAdminUserId?.ToString() ?? "none")}"; }
        catch (ApiException e) { return $"{e.StatusCode} {e.Code}: {e.Message}"; }
    }
    static int Finance(MyPetLinkDbContext db) => db.MerchantInvoices.Count() + db.MerchantPayments.Count() + db.MerchantReceipts.Count()
        + db.SalesCommissions.Count() + db.CommissionPayouts.Count() + db.TagOrders.Count();

    [Fact]
    public async Task S01_TeamDefault_FailsClosed_AndPolicyAuthorization()
    {
        await using var scope = await Db(2); await using var db = scope.NewContext();
        var p = await S(db).ApprovalPolicyAsync(A, default);
        log.WriteLine($"Fresh policy: mode={p.Mode} founder={(p.SelfReviewerAdminUserId?.ToString() ?? "none")} canSelfReview={p.CanSelfReview}");
        var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default);
        log.WriteLine("Team: creator self-approves with attestation: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        log.WriteLine("B (no policy capability) enables Solo: " + await Policy(db, UserB, "Solo", AdminB));
        log.WriteLine("A nominates B (no self_review capability): " + await Policy(db, A, "Solo", AdminB));
        log.WriteLine("A enables Solo without confirmation: " + await Policy(db, A, "Solo", AdminRecordId, confirmed: false));
        log.WriteLine("A enables Solo with stale token: " + await Policy(db, A, "Solo", AdminRecordId, token: "AAAAAAAAB9E="));
        log.WriteLine("A enables Solo, nominates self: " + await Policy(db, A, "Solo", AdminRecordId));
        db.Database.ExecuteSqlRaw("DELETE FROM ConsignmentApprovalPolicies"); // simulate missing policy row
        a = (await S(db).AgreementsAsync(1, 5, null, default)).Items.Single();
        log.WriteLine("Policy row missing, founder self-approves: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
    }

    [Fact]
    public async Task S02_SoloFounderEndToEnd()
    {
        await using var scope = await Db(6); await using var db = scope.NewContext();
        log.WriteLine("Enable Solo: " + await Policy(db, A, "Solo", AdminRecordId));
        var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default);
        log.WriteLine("Self-approve without attestation: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x"), default)));
        log.WriteLine("Self-approve, unconfirmed attestation: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed) with { Confirmed = false }), default)));
        log.WriteLine("Self-approve, evidence not the signed acceptance: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att("SOME-OTHER-DOC")), default)));
        var ag = await S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "Founder approval", SelfReview: Att(Signed)), default);
        log.WriteLine($"Self-approve with signed acceptance ref: status={ag.Status} reviewMode={ag.ApprovalReviewMode}");
        var d = await S(db).ReserveAsync(A, R(ag.Id, 4, "s02"), default);
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN-SHIP"), default);
        var u = d.Units.Select(x => x.Id).ToArray();
        log.WriteLine("Self-receipt without attestation: " + await Err(() => S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(3, 1, 1, "SYN-PARTNER-DN-001", [u[0], u[1]], [u[2]], [u[3]]) }, default)));
        log.WriteLine("Self-receipt, attestation evidence differs from receipt evidence: " + await Err(() => S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(3, 1, 1, "SYN-PARTNER-DN-001", [u[0], u[1]], [u[2]], [u[3]]), SelfReview = Att("SYN-OTHER") }, default)));
        d = await S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(3, 1, 1, "SYN-PARTNER-DN-001", [u[0], u[1]], [u[2]], [u[3]]), SelfReview = Att("SYN-PARTNER-DN-001") }, default);
        var ev1 = await db.ConsignmentReviewEvents.CountAsync();
        var replay = await Err(() => S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(3, 1, 1, "SYN-PARTNER-DN-001", [u[0], u[1]], [u[2]], [u[3]]), SelfReview = Att("SYN-PARTNER-DN-001") }, default));
        var altered = await Err(() => S(db).ActionAsync(A, d.Id, "record-discrepancy", Act(d, "RX-1") with { Receipt = Rx(3, 1, 1, "SYN-PARTNER-DN-001", [u[0], u[1]], [u[2]], [u[3]]), SelfReview = Att("SYN-PARTNER-DN-001") with { Reason = "A different reason for the same event" } }, default));
        log.WriteLine($"Partial self-receipt 2 good/1 damaged/1 missing: OK. Exact replay: {replay}; review events {ev1}->{await db.ConsignmentReviewEvents.CountAsync()}; altered attestation replay: {altered}");
        d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine($"  Good={d.Units.Count(x => x.ReceivingState == "Good")} Damaged={d.Units.Count(x => x.ReceivingState == "Damaged")} Missing={d.Units.Count(x => x.ReceivingState == "Missing")} status={d.Status}; history review modes={string.Join(",", d.History.Select(h => h.ReviewMode).Where(m => m != null).Distinct())}");
        d = await S(db).ActionAsync(A, d.Id, "external-handover", Act(d, "tracker row", [u[0]]) with { Handover = new("SALE-S02-1", Now, true, 34.90m, 0m, null) }, default);
        log.WriteLine("Handover of good unit: OK; handover of missing unit: " + await Err(() => S(db).ActionAsync(A, d.Id, "external-handover", Act(d, "tracker row", [u[3]]) with { Handover = new("SALE-S02-2", Now, false, null, null, null) }, default)));
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(A, d.Id, "return", Act(d, "SYN damaged returned to warehouse", [u[2]]), default);
        var tag = await db.SmartTags.SingleAsync(t => t.Id == db.ConsignmentUnits.Single(x => x.Id == u[2]).SmartTagId);
        var qa = PhysicalQaTests.Service(db, new FixedClock(Now.AddMinutes(1)));
        var qr = await qa.CaptureAsync(A, new(tag.TagCode, tag.QaVersion, QaCaptureSource.Camera, $"https://mypetlink.example/q/{tag.TagCode}", null), default);
        var nfc = await qa.CaptureAsync(A, new(tag.TagCode, tag.QaVersion, QaCaptureSource.WebNfc, $"https://mypetlink.example/n/{tag.TagCode}", tag.QaNfcSerialNumber ?? "04A1B2C3D4E5F6"), default);
        await qa.SaveAsync(A, tag.Id, new(Guid.NewGuid(), tag.QaVersion, PhysicalQaStatus.Failed, PhysicalTagCondition.Damaged, qr.Evidence, nfc.Evidence, "SYN damaged on return"), default);
        db.ChangeTracker.Clear(); d = await S(db).GetAsync(d.Id, false, default);
        log.WriteLine($"Real Physical QA: return failed (qr match={qr.Matches}, nfc match={nfc.Matches}).");
        log.WriteLine("Self-resolve return reusing earlier evidence: " + await Err(() => S(db).ActionAsync(A, d.Id, "resolve-discrepancy", Act(d, "REV-1") with { Receipt = Rx(0, 0, 0, "SYN-PARTNER-DN-001", ret: [u[2]]), SelfReview = Att("SYN-PARTNER-DN-001") }, default)));
        log.WriteLine("Write-off before review: " + await Err(() => S(db).ActionAsync(A, d.Id, "write-off", Act(d, "SYN damaged", [u[2]]), default)));
        d = await S(db).GetAsync(d.Id, false, default);
        d = await S(db).ActionAsync(A, d.Id, "resolve-discrepancy", Act(d, "REV-1") with { Receipt = Rx(0, 0, 0, "SYN-RETURN-NOTE-002", ret: [u[2]]), SelfReview = Att("SYN-RETURN-NOTE-002") }, default);
        log.WriteLine("Self-resolve return with new evidence: OK");
        log.WriteLine("Unit status after earlier write-off + review: " + d.Units.Single(x => x.Id == u[2]).Status + "/" + d.Units.Single(x => x.Id == u[2]).ReceivingState);
        log.WriteLine("Self-resolve missing as still missing: " + await Err(() => S(db).ActionAsync(A, d.Id, "resolve-discrepancy", Act(d, "REV-2") with { Receipt = Rx(0, 0, 1, "SYN-INVESTIGATION-003", miss: [u[3]]), SelfReview = Att("SYN-INVESTIGATION-003") }, default)));
        var docs = new ConsignmentDocumentService(db, S(db), new AuditLogService(db, new HttpContextAccessor()));
        var log1 = System.Text.Encoding.UTF8.GetString(await S(db).ReviewLogCsvAsync(A, Now.AddDays(-1), Now.AddDays(1), default));
        var lines = log1.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        log.WriteLine($"Review log rows={lines.Length - 1}; modes={string.Join(",", lines.Skip(1).Select(l => l.Split(',')[2]).Distinct())}");
        var manifest = System.Text.Encoding.UTF8.GetString(await docs.CsvAsync(A, d.Id, default));
        log.WriteLine("Manifest CSV header tail: " + string.Join(",", manifest.Split('\n')[0].Trim().Split(',').TakeLast(2)));
        log.WriteLine("Signature wording in review log: " + (log1.Contains("verified signature", StringComparison.OrdinalIgnoreCase) ? "claims verified signature" : "no verified-signature claim"));
        log.WriteLine($"Finance rows={Finance(db)}; tag disabled after write-off={(await db.SmartTags.AsNoTracking().SingleAsync(t => t.Id == tag.Id)).Status}");
        Assert.Equal(0, Finance(db));
    }

    [Fact]
    public async Task S03_SuperAdminNominationRevocationAndTeamSwitch()
    {
        await using var scope = await Db(4); await using var db = scope.NewContext();
        log.WriteLine("Enable Solo for founder A: " + await Policy(db, A, "Solo", AdminRecordId));
        var c = await S(db).SaveAgreementAsync(UserC, null, Terms() with { Reference = "SYN-AGR-C" }, null, default);
        log.WriteLine("Unrelated Super Admin C self-approves own draft: " + await Err(() => S(db).AgreementActionAsync(UserC, c.Id, "approve", new(c.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        var ca = await S(db).AgreementActionAsync(A, c.Id, "approve", new(c.ConcurrencyToken, "A approves C's draft"), default);
        log.WriteLine($"Founder A approves C's draft (independent): mode={ca.ApprovalReviewMode}");
        var a = await S(db).SaveAgreementAsync(A, null, Terms() with { Reference = "SYN-AGR-A" }, null, default);
        // Revoke founder's self_review capability
        var cap = await db.AdminRoleCapabilities.SingleAsync(x => x.Capability == AdminCapabilities.ConsignmentSelfReview && x.AdminRole.Code == "QA-FOUNDER");
        db.AdminRoleCapabilities.Remove(cap); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Capability revoked, A self-approves: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        db.AdminRoleCapabilities.Add(new AdminRoleCapability { AdminRoleId = cap.AdminRoleId, Capability = cap.Capability }); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Founder changed to Super Admin C: " + await Policy(db, A, "Solo", AdminC));
        log.WriteLine("A (no longer founder) self-approves: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        log.WriteLine("Back to founder A: " + await Policy(db, A, "Solo", AdminRecordId));
        var acc = await db.AdminUsers.SingleAsync(x => x.Id == AdminRecordId); acc.IsActive = false; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Founder account deactivated, self-approve: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        acc = await db.AdminUsers.SingleAsync(x => x.Id == AdminRecordId); acc.IsActive = true; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Switch to Team: " + await Policy(db, A, "Team", null));
        log.WriteLine("Team: A self-approves with attestation: " + await Err(() => S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default)));
        var a2 = await S(db).AgreementActionAsync(UserB, a.Id, "approve", new(a.ConcurrencyToken, "B independent approval"), default);
        log.WriteLine($"Team: B approves independently: mode={a2.ApprovalReviewMode}");
        log.WriteLine($"Policy change events kept={await db.ConsignmentReviewEvents.CountAsync(e => e.Action == "approval-policy-changed")}");
    }

    [Fact]
    public async Task S04_ConcurrentPolicySwitchVsSelfApproval()
    {
        await using var scope = await Db(1); string token; Guid aid; string atoken;
        await using (var db = scope.NewContext()) { await Policy(db, A, "Solo", AdminRecordId); var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default); aid = a.Id; atoken = a.ConcurrencyToken; token = (await S(db).ApprovalPolicyAsync(A, default)).ConcurrencyToken; }
        for (var round = 0; round < 1; round++)
        {
            var go = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            async Task<string> Approve() { await go.Task; await using var db = scope.NewContext(); return await Err(() => S(db).AgreementActionAsync(A, aid, "approve", new(atoken, "race", SelfReview: Att(Signed)), default)); }
            async Task<string> ToTeam() { await go.Task; await using var db = scope.NewContext(); return await Policy(db, A, "Team", null, token: token); }
            var t1 = Approve(); var t2 = ToTeam(); go.SetResult(); var r = await Task.WhenAll(t1, t2);
            await using var check = scope.NewContext();
            var ev = await check.ConsignmentReviewEvents.AsNoTracking().Where(e => e.Action == "approve").ToListAsync();
            var policyEv = await check.ConsignmentReviewEvents.AsNoTracking().Where(e => e.Action == "approval-policy-changed").OrderBy(e => e.RecordedAt).ToListAsync();
            log.WriteLine($"Approve: {r[0]} | Switch to Team: {r[1]}");
            log.WriteLine($"Approval events: {string.Join(";", ev.Select(e => $"{e.ReviewMode} under {e.PolicyMode}"))}; agreement mode={(await check.ConsignmentAgreements.AsNoTracking().SingleAsync(x => x.Id == aid)).ApprovalReviewMode ?? "none"}");
            Assert.All(ev, e => Assert.Equal("Solo", e.PolicyMode));
        }
    }

    [Fact]
    public async Task S05_JournalAppendOnly_EfAndSql()
    {
        // Built from the real migrations so the append-only trigger and seeded Team policy exist.
        await using var scope = await RelationalDatabase.CreateAsync(createSchema: false, enableRetryOnFailure: true);
        await using (var m = scope.NewContext()) await m.Database.MigrateAsync();
        await using var db = scope.NewContext();
        var seeded = await db.ConsignmentApprovalPolicies.AsNoTracking().ToListAsync();
        log.WriteLine($"Migrated policy rows={seeded.Count}; mode={string.Join(",", seeded.Select(x => x.Mode))}; founder={(seeded.FirstOrDefault()?.SelfReviewerAdminUserId?.ToString() ?? "none")}");
        await SeedAsync(db, qrStock: 0, nfcStock: 1);
        db.Users.Add(new User { Id = UserC, Email = "qa.c@mypetlink.local", NormalizedEmail = "QA.C@MYPETLINK.LOCAL", DisplayName = "QA Super C", Status = UserStatus.Active, CreatedAt = Now, UpdatedAt = Now });
        var founder = new AdminRoleDefinition { Code = "QA-FOUNDER", Name = "QA founder" };
        foreach (var c in FounderCaps) founder.Capabilities.Add(new AdminRoleCapability { Capability = c });
        founder.Assignments.Add(new AdminUserRoleAssignment { AdminUserId = AdminRecordId });
        db.AdminRoles.Add(founder); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        log.WriteLine("Enable Solo: " + await Policy(db, A, "Solo", AdminRecordId));
        db.ChangeTracker.Clear();
        var before = await db.ConsignmentReviewEvents.AsNoTracking().ToListAsync();
        var ev = await db.ConsignmentReviewEvents.FirstAsync();
        ev.Reason = "tampered"; string ef; try { await db.SaveChangesAsync(); ef = "update saved"; } catch (Exception e) { ef = e.GetType().Name + ": " + e.Message; }
        db.ChangeTracker.Clear();
        string sqlU, sqlD;
        try { await db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentReviewEvents SET Reason='tampered'"); sqlU = "update succeeded"; } catch (SqlException e) { sqlU = $"SQL {e.Number}: {e.Message}"; }
        try { await db.Database.ExecuteSqlRawAsync("DELETE FROM ConsignmentReviewEvents"); sqlD = "delete succeeded"; } catch (SqlException e) { sqlD = $"SQL {e.Number}: {e.Message}"; }
        var after = await db.ConsignmentReviewEvents.AsNoTracking().ToListAsync();
        log.WriteLine($"EF update: {ef}");
        log.WriteLine($"SQL UPDATE: {sqlU}");
        log.WriteLine($"SQL DELETE: {sqlD}");
        log.WriteLine($"Events before={before.Count} after={after.Count}; reason unchanged={after.Select(x => x.Reason).SequenceEqual(before.Select(x => x.Reason))}");
        string down; try { await db.GetService<IMigrator>().MigrateAsync("20261017160448_CompleteConsignmentReceivingAndApproval"); down = "downgrade succeeded"; } catch (Exception e) { down = "blocked: " + (e.InnerException?.Message ?? e.Message).Split((char)10)[0]; }
        log.WriteLine($"Down past Solo migration with only a policy-change history: {down}; last applied={(await db.Database.GetAppliedMigrationsAsync()).Last()}");
        Assert.Equal(before.Count, after.Count);
    }

    [Fact]
    public async Task S06_HistoricalUnknownAndInventoryGuardsUnchanged()
    {
        await using var scope = await Db(6); await using var db = scope.NewContext();
        await Policy(db, A, "Solo", AdminRecordId);
        var a = await S(db).SaveAgreementAsync(A, null, Terms(), null, default);
        a = await S(db).AgreementActionAsync(A, a.Id, "approve", new(a.ConcurrencyToken, "x", SelfReview: Att(Signed)), default);
        await db.Database.ExecuteSqlRawAsync("UPDATE ConsignmentAgreements SET ApprovalReviewMode = NULL"); // simulate a pre-Solo historical approval
        var d = await S(db).ReserveAsync(A, R(a.Id, 2, "s06"), default);
        d = await S(db).ActionAsync(A, d.Id, "dispatch", Act(d, "SYN"), default);
        var docs = new ConsignmentDocumentService(db, S(db), new AuditLogService(db, new HttpContextAccessor()));
        var csv = System.Text.Encoding.UTF8.GetString(await docs.CsvAsync(A, d.Id, default));
        log.WriteLine("Historical agreement in manifest CSV: " + (csv.Contains("Historical review not recorded") ? "'Historical review not recorded'" : "NOT labelled"));
        var ag = (await S(db).AgreementsAsync(1, 5, null, default)).Items.Single();
        log.WriteLine($"Agreement API approvalReviewMode={(ag.ApprovalReviewMode ?? "null (unknown)")}");
        // H1: retail commitment still protects inspected stock in Solo mode
        var r = await SeedRetailOrderAsync(db); var item = await db.TagOrderItems.SingleAsync(x => x.Id == r.OrderItemId); item.ProductVariantId = NfcVariantId; item.Quantity = 3; await db.SaveChangesAsync();
        log.WriteLine("Solo founder reserves stock needed by paid retail order: " + await Err(() => S(db).ReserveAsync(A, R(a.Id, 2, "s06b"), default)));
        var held = await db.ConsignmentUnits.Select(u => u.SmartTagId).ToListAsync();
        log.WriteLine($"Duplicate-claim index intact: held units={held.Count}, distinct tags={held.Distinct().Count()}");
    }
}
