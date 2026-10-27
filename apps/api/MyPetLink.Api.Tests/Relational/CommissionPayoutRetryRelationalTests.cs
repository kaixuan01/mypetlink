using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.Relational.MerchantFulfilmentFixture;

namespace MyPetLink.Api.Tests.Relational;

// Phase 1A final remediation (R0): a payout operation that SQL Server rolls back with a real
// deadlock (1205) while saving is retried by the execution strategy. Every retry must start from
// the committed rows, so a success always means the change is committed, exactly once.
//
// The deadlock is never thrown by the test. The operation is paused just before its save (after
// the production code has made its changes in memory), a competing transaction takes the admin row
// the save must reference, the save is released and waits on that row, and the competitor then
// asks for the commission row the operation already holds. SQL Server closes the cycle and picks
// the operation, which runs at LOW deadlock priority, as the victim.
public sealed partial class ConsignmentRelationalTests
{
    private static readonly DateOnly TransferDay = new(2026, 9, 8);

    /// <summary>Pauses the first save before any SQL is sent and records the SQL errors saves raise.</summary>
    private sealed class SavePause : SaveChangesInterceptor
    {
        public readonly TaskCompletionSource Paused = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource Resume = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public int Saves, Deadlocks;

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref Saves) == 1)
            {
                Paused.TrySetResult();
                await Resume.Task.WaitAsync(TimeSpan.FromSeconds(60), cancellationToken);
            }
            return result;
        }

        public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
        {
            if (IsDeadlock(eventData.Exception)) Interlocked.Increment(ref Deadlocks);
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Lets the first commit reach SQL Server, then reports a client-side timeout, as a dropped
    /// connection would after the server committed. The retry cannot know the commit happened.
    /// </summary>
    private sealed class LostCommitAcknowledgement : DbTransactionInterceptor
    {
        public int Commits;
        public override Task TransactionCommittedAsync(DbTransaction transaction, TransactionEndEventData eventData,
            CancellationToken cancellationToken = default) =>
            Interlocked.Increment(ref Commits) == 1
                ? throw new TimeoutException("The commit acknowledgement was lost.")
                : Task.CompletedTask;
    }

    private static bool IsDeadlock(Exception? error)
    {
        for (; error is not null; error = error.InnerException)
            if (error is SqlException sql && sql.Errors.Cast<SqlError>().Any(item => item.Number == 1205)) return true;
        return false;
    }

    private static MyPetLinkDbContext RetryingContext(string connection, int retries, params IInterceptor[] interceptors) =>
        new(new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseSqlServer(connection, options => options.EnableRetryOnFailure(retries, TimeSpan.FromSeconds(1), null))
            .AddInterceptors(interceptors).Options);

    /// <summary>Opens the context's connection for the whole test and returns its session id.</summary>
    private static async Task<int> SessionAsync(MyPetLinkDbContext db, bool lowDeadlockPriority)
    {
        await db.Database.OpenConnectionAsync();
        await db.Database.ExecuteSqlRawAsync(lowDeadlockPriority ? "SET DEADLOCK_PRIORITY LOW" : "SET DEADLOCK_PRIORITY NORMAL");
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "SELECT @@SPID";
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task WaitUntilBlockedAsync(MyPetLinkDbContext check, int waiter, int holder, string failure)
    {
        await check.Database.OpenConnectionAsync();
        for (var attempt = 0; attempt < 300; attempt++)
        {
            await using var command = check.Database.GetDbConnection().CreateCommand();
            command.CommandText = $"SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id = {waiter} AND blocking_session_id = {holder}";
            if (Convert.ToInt32(await command.ExecuteScalarAsync()) > 0) return;
            await Task.Delay(20);
        }
        Assert.Fail(failure);
    }

    /// <summary>
    /// Closes a real lock cycle with an operation paused before its save: the competitor holds the
    /// admin row the save references, then asks for the commission row the operation holds.
    /// <paramref name="afterWinning"/> runs inside the competitor once SQL Server has chosen the victim.
    /// </summary>
    private static async Task DeadlockTheSaveAsync(string connection, MyPetLinkDbContext check, int victim,
        SavePause pause, Guid adminRowId, Guid commissionId, Func<SqlConnection, SqlTransaction, Task>? afterWinning = null)
    {
        await pause.Paused.Task.WaitAsync(TimeSpan.FromSeconds(40));
        await using var competitor = new SqlConnection(connection);
        await competitor.OpenAsync();
        await using var transaction = (SqlTransaction)await competitor.BeginTransactionAsync();
        int session;
        await using (var command = new SqlCommand("SET DEADLOCK_PRIORITY NORMAL; SELECT @@SPID", competitor, transaction))
            session = Convert.ToInt32(await command.ExecuteScalarAsync());
        await using (var command = new SqlCommand("SELECT [Id] FROM [AdminUsers] WITH (XLOCK, HOLDLOCK) WHERE [Id] = @id", competitor, transaction))
        {
            command.Parameters.AddWithValue("@id", adminRowId);
            Assert.NotNull(await command.ExecuteScalarAsync());
        }
        pause.Resume.TrySetResult();
        await WaitUntilBlockedAsync(check, victim, session, "The save did not wait on the admin row the competing transaction holds.");
        await using (var command = new SqlCommand("SELECT 1 FROM [SalesCommissions] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = @id", competitor, transaction))
        {
            command.Parameters.AddWithValue("@id", commissionId);
            await command.ExecuteScalarAsync();
        }
        if (afterWinning is not null) await afterWinning(competitor, transaction);
        await transaction.CommitAsync();
    }

    /// <summary>A fully received RM45 consignment commission (10 Standard tags) ready for a payout.</summary>
    private static async Task<(Guid Seller, Guid Commission)> PayableConsignmentCommissionAsync(RelationalScope scope, string code)
    {
        await using var seed = scope.NewContext();
        var (agreement, standard, _) = await PartnerWithStock(seed, 20);
        var seller = await Seller(seed, code, "Retry Rep");
        await Serve(seed, seller, Now.AddDays(-30));
        await OnV11(seed, seller);
        var report = await Verified(seed, agreement.Id, [Sale(standard.Id, 10)]);
        await Remit(seed, (await SettlementFor(seed, report)).Summary.Id, 259.35m, code.ToLowerInvariant());
        var row = Assert.Single(await Effective(seed));
        Assert.Equal((SalesCommissionStatus.Payable, 45m), (row.Status, row.CommissionAmount));
        return (seller, row.Id);
    }

    private static PrepareCommissionPayoutRequest PrepareRequest(Guid seller, Guid commission, string key) =>
        new([commission], seller, ReportClock.AddDays(-1), ReportClock.AddDays(1), 45m, key);

    private static MarkCommissionPayoutPaidRequest PaidRequest(CommissionPayoutResponse payout) =>
        new(payout.Summary.ConcurrencyToken, CommissionPayoutPaymentMethod.BankTransfer, "IBG-RETRY-0001", TransferDay);

    private static async Task<Guid> AdminRowAsync(RelationalScope scope, Guid userId)
    {
        await using var db = scope.NewContext();
        return await db.AdminUsers.Where(item => item.UserId == userId).Select(item => item.Id).SingleAsync();
    }

    private static Task<int> AuditCountAsync(MyPetLinkDbContext db, string action, Guid entityId) =>
        db.AuditLogs.AsNoTracking().CountAsync(item => item.Action == action && item.EntityId == entityId);

    private static async Task ReportStateAsync(MyPetLinkDbContext check, string label, SavePause pause, string returned, Guid commission)
    {
        var payouts = await check.CommissionPayouts.AsNoTracking().OrderBy(item => item.PreparedAt).ToListAsync();
        var row = await check.SalesCommissions.AsNoTracking().SingleAsync(item => item.Id == commission);
        var audits = await check.AuditLogs.AsNoTracking().Where(item => item.Action.StartsWith("commission-payout.")).GroupBy(item => item.Action)
            .Select(group => group.Key + "=" + group.Count()).ToListAsync();
        Console.WriteLine($"{label}: actual1205={pause.Deadlocks}, saves={pause.Saves}, returned={returned}, payouts=[{string.Join(";", payouts.Select(p => $"{p.PayoutNumber}:{p.Status}:paidAt={p.PaidAt:O}:transferredOn={p.TransferredOn}"))}], commission={row.Status}, audits=[{string.Join(",", audits.OrderBy(a => a))}]");
    }

    [Fact]
    public async Task MarkPaidRecordsThePaymentAfterARealSaveTimeDeadlockRetry()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-PAID");
            CommissionPayoutResponse prepared;
            await using (var db = scope.NewContext())
                prepared = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-paid"));
            var payer = await AdminRowAsync(scope, OwnerAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var payDb = RetryingContext(connection, 6, pause);
            var victim = await SessionAsync(payDb, lowDeadlockPriority: true);
            var paying = Task.Run(() => Payouts(payDb).MarkPaidAsync(OwnerAccountId, prepared.Summary.Id, PaidRequest(prepared)));
            try { await DeadlockTheSaveAsync(connection, check, victim, pause, payer, commission); }
            finally { pause.Resume.TrySetResult(); }
            var response = await paying.WaitAsync(TimeSpan.FromSeconds(70));
            await ReportStateAsync(check, "MARK-PAID SAVE-TIME RETRY", pause, response.Summary.Status, commission);

            Assert.Equal(1, pause.Deadlocks);
            Assert.Equal(2, pause.Saves); // the retry saved again instead of trusting the rolled-back attempt
            Assert.Empty(payDb.ChangeTracker.Entries());
            Assert.Equal("Paid", response.Summary.Status);
            var payout = await check.CommissionPayouts.AsNoTracking().Include(item => item.Items).SingleAsync();
            Assert.Equal(prepared.Summary.Id, payout.Id);
            Assert.Equal(CommissionPayoutStatus.Paid, payout.Status);
            Assert.Equal(PayoutClock, payout.PaidAt);
            Assert.Equal(TransferDay, payout.TransferredOn);
            Assert.Equal((CommissionPayoutPaymentMethod.BankTransfer, "IBG-RETRY-0001"), (payout.PaymentMethod, payout.PaymentReference));
            Assert.Equal(payer, payout.PaidByAdminUserId);
            var item = Assert.Single(payout.Items);
            Assert.Null(item.ReleasedAt);
            Assert.Equal(payout.PreparedAmount, item.CommissionAmountSnapshot);
            var row = await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission);
            Assert.Equal((SalesCommissionStatus.Paid, PayoutClock, payer), (row.Status, row.PaidAt, row.PaidByAdminUserId));
            Assert.Equal(45m, row.CommissionAmount);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.paid", payout.Id));
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.prepared", payout.Id));

            // The same request again is an exact replay of the recorded payment, not a second one.
            await using var replayDb = scope.NewContext();
            var replay = await Payouts(replayDb).MarkPaidAsync(OwnerAccountId, payout.Id, PaidRequest(prepared));
            Assert.Equal(("Paid", PayoutClock), (replay.Summary.Status, replay.Summary.PaidAt));
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.paid", payout.Id));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task MarkPaidThatCannotRetryReportsTheDeadlockInsteadOfSuccess()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-NORETRY");
            CommissionPayoutResponse prepared;
            await using (var db = scope.NewContext())
                prepared = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-noretry"));
            var payer = await AdminRowAsync(scope, OwnerAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var payDb = RetryingContext(connection, 0, pause);
            var victim = await SessionAsync(payDb, lowDeadlockPriority: true);
            var paying = Task.Run(() => Payouts(payDb).MarkPaidAsync(OwnerAccountId, prepared.Summary.Id, PaidRequest(prepared)));
            try { await DeadlockTheSaveAsync(connection, check, victim, pause, payer, commission); }
            finally { pause.Resume.TrySetResult(); }

            var failure = await Assert.ThrowsAnyAsync<Exception>(() => paying.WaitAsync(TimeSpan.FromSeconds(70)));
            Assert.True(IsDeadlock(failure), failure.ToString());
            Assert.Equal(1, pause.Saves);
            var payout = await check.CommissionPayouts.AsNoTracking().SingleAsync();
            Assert.Equal((CommissionPayoutStatus.Prepared, (DateTimeOffset?)null, (DateOnly?)null), (payout.Status, payout.PaidAt, payout.TransferredOn));
            Assert.Equal(SalesCommissionStatus.Payable, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission)).Status);
            Assert.Equal(0, await AuditCountAsync(check, "commission-payout.paid", payout.Id));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task MarkPaidRetryRefusesWhenTheCommissionChangedWhileItWaited()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-CHANGED");
            CommissionPayoutResponse prepared;
            await using (var db = scope.NewContext())
                prepared = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-changed"));
            var payer = await AdminRowAsync(scope, OwnerAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var payDb = RetryingContext(connection, 6, pause);
            var victim = await SessionAsync(payDb, lowDeadlockPriority: true);
            var paying = Task.Run(() => Payouts(payDb).MarkPaidAsync(OwnerAccountId, prepared.Summary.Id, PaidRequest(prepared)));
            try
            {
                // Once SQL Server rolls the payment back, the competitor reverses the commission it now holds.
                await DeadlockTheSaveAsync(connection, check, victim, pause, payer, commission, async (competitor, transaction) =>
                {
                    await using var command = new SqlCommand(
                        "UPDATE [SalesCommissions] SET [Status] = 'Reversed', [ReversedAt] = SYSDATETIMEOFFSET(), [ReversalReason] = 'Changed while the payment waited' WHERE [Id] = @id",
                        competitor, transaction);
                    command.Parameters.AddWithValue("@id", commission);
                    Assert.Equal(1, await command.ExecuteNonQueryAsync());
                });
            }
            finally { pause.Resume.TrySetResult(); }

            var outcome = await Record.ExceptionAsync(() => paying.WaitAsync(TimeSpan.FromSeconds(70)));
            await ReportStateAsync(check, "MARK-PAID CHANGED-WHILE-WAITING", pause, outcome is ApiException api ? $"{api.StatusCode}:{api.Code}" : outcome?.GetType().Name ?? paying.Result.Summary.Status, commission);
            var refused = Assert.IsType<ApiException>(outcome);
            Assert.Equal((409, "payout_reconciliation_failed"), (refused.StatusCode, refused.Code));
            Assert.Equal(1, pause.Deadlocks);
            var payout = await check.CommissionPayouts.AsNoTracking().SingleAsync();
            Assert.Equal((CommissionPayoutStatus.Prepared, (DateTimeOffset?)null), (payout.Status, payout.PaidAt));
            Assert.Equal(SalesCommissionStatus.Reversed, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission)).Status);
            Assert.Equal(0, await AuditCountAsync(check, "commission-payout.paid", payout.Id));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task AnIdenticalPaymentRecordedDuringTheDeadlockRetryLeavesOnePayment()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-TWICE");
            CommissionPayoutResponse prepared;
            await using (var db = scope.NewContext())
                prepared = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-twice"));
            var payer = await AdminRowAsync(scope, OwnerAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var payDb = RetryingContext(connection, 6, pause);
            await using var secondDb = RetryingContext(connection, 6);
            var victim = await SessionAsync(payDb, lowDeadlockPriority: true);
            var second = await SessionAsync(secondDb, lowDeadlockPriority: false);
            var paying = Task.Run(() => Payouts(payDb).MarkPaidAsync(OwnerAccountId, prepared.Summary.Id, PaidRequest(prepared)));
            Task<CommissionPayoutResponse>? duplicate = null;
            try
            {
                await pause.Paused.Task.WaitAsync(TimeSpan.FromSeconds(40));
                // A second operator submits the same payment and waits behind the first one's payout lock.
                duplicate = Task.Run(() => Payouts(secondDb).MarkPaidAsync(OwnerAccountId, prepared.Summary.Id, PaidRequest(prepared)));
                await WaitUntilBlockedAsync(check, second, victim, "The second payment did not wait on the first one's payout lock.");
                await DeadlockTheSaveAsync(connection, check, victim, pause, payer, commission);
            }
            finally { pause.Resume.TrySetResult(); }
            var results = await Task.WhenAll(paying, duplicate!).WaitAsync(TimeSpan.FromSeconds(70));

            Assert.Equal(1, pause.Deadlocks);
            Assert.All(results, result => Assert.Equal("Paid", result.Summary.Status));
            Assert.Equal(results[0].Summary.PaidAt, results[1].Summary.PaidAt);
            var payout = await check.CommissionPayouts.AsNoTracking().SingleAsync();
            Assert.Equal((CommissionPayoutStatus.Paid, TransferDay), (payout.Status, payout.TransferredOn));
            Assert.Equal(SalesCommissionStatus.Paid, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission)).Status);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.paid", payout.Id));
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task PrepareCreatesExactlyOnePayoutAfterARealSaveTimeDeadlockRetry()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-PREP");
            var preparer = await AdminRowAsync(scope, AdminAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var prepareDb = RetryingContext(connection, 6, pause);
            var victim = await SessionAsync(prepareDb, lowDeadlockPriority: true);
            var preparing = Task.Run(() => Payouts(prepareDb).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-prep")));
            try { await DeadlockTheSaveAsync(connection, check, victim, pause, preparer, commission); }
            finally { pause.Resume.TrySetResult(); }
            CommissionPayoutResponse response;
            try { response = await preparing.WaitAsync(TimeSpan.FromSeconds(70)); }
            catch (ApiException error)
            {
                await ReportStateAsync(check, "PREPARE SAVE-TIME RETRY", pause, $"{error.StatusCode}:{error.Code}", commission);
                throw;
            }
            await ReportStateAsync(check, "PREPARE SAVE-TIME RETRY", pause, response.Summary.Status, commission);

            Assert.Equal(1, pause.Deadlocks);
            Assert.Equal(2, pause.Saves);
            Assert.Equal(("Prepared", 45m), (response.Summary.Status, response.Summary.PreparedAmount));
            var payout = await check.CommissionPayouts.AsNoTracking().Include(item => item.Items).SingleAsync();
            Assert.Equal(response.Summary.Id, payout.Id);
            Assert.EndsWith("-0001", payout.PayoutNumber); // the rolled-back attempt's number went back with it
            var claim = Assert.Single(payout.Items);
            Assert.Equal((commission, (DateTimeOffset?)null, 45m), (claim.SalesCommissionId, claim.ReleasedAt, claim.CommissionAmountSnapshot));
            Assert.Equal(1, await check.CommissionPayoutItems.AsNoTracking().CountAsync(item => item.SalesCommissionId == commission));
            Assert.Equal(SalesCommissionStatus.Payable, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission)).Status);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.prepared", payout.Id));
            Assert.Equal(1, await check.AuditLogs.AsNoTracking().CountAsync(item => item.Action == "commission-payout.prepared"));

            await using var replayDb = scope.NewContext();
            var replay = await Payouts(replayDb).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-prep"));
            Assert.Equal(payout.Id, replay.Summary.Id);
            Assert.Equal(1, await check.CommissionPayouts.AsNoTracking().CountAsync());
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task CancelReleasesTheReservationExactlyOnceAfterARealSaveTimeDeadlockRetry()
    {
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-CANCEL");
            CommissionPayoutResponse prepared;
            await using (var db = scope.NewContext())
                prepared = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-cancel"));
            var canceller = await AdminRowAsync(scope, OwnerAccountId);

            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;
            var pause = new SavePause();
            await using var cancelDb = RetryingContext(connection, 6, pause);
            var victim = await SessionAsync(cancelDb, lowDeadlockPriority: true);
            var cancelling = Task.Run(() => Payouts(cancelDb).CancelAsync(OwnerAccountId, prepared.Summary.Id,
                new(prepared.Summary.ConcurrencyToken, "Wrong bank account")));
            try { await DeadlockTheSaveAsync(connection, check, victim, pause, canceller, commission); }
            finally { pause.Resume.TrySetResult(); }
            var response = await cancelling.WaitAsync(TimeSpan.FromSeconds(70));
            await ReportStateAsync(check, "CANCEL SAVE-TIME RETRY", pause, response.Summary.Status, commission);

            Assert.Equal(1, pause.Deadlocks);
            Assert.Equal(2, pause.Saves);
            Assert.Equal("Cancelled", response.Summary.Status);
            var payout = await check.CommissionPayouts.AsNoTracking().Include(item => item.Items).SingleAsync();
            Assert.Equal((CommissionPayoutStatus.Cancelled, "Wrong bank account", canceller),
                (payout.Status, payout.CancellationReason, payout.CancelledByAdminUserId));
            var claim = Assert.Single(payout.Items);
            Assert.NotNull(claim.ReleasedAt);
            Assert.Equal(("Wrong bank account", (Guid?)canceller), (claim.ReleaseReason, claim.ReleasedByAdminUserId));
            Assert.Equal(SalesCommissionStatus.Payable, (await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission)).Status);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.cancelled", payout.Id));
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.item-released", claim.Id));

            // The released commission can be reserved again: the claim really was released.
            await using var again = scope.NewContext();
            var next = await Payouts(again).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-cancel-again"));
            Assert.Equal("Prepared", next.Summary.Status);
        }
        finally { MigratedSchema.Value = false; }
    }

    [Fact]
    public async Task ARetryAfterALostCommitAcknowledgementReturnsTheRecordedResultOnce()
    {
        // SQL Server commits each operation for real; only the acknowledgement to the client is lost,
        // so the execution strategy runs the whole operation again without knowing it succeeded.
        MigratedSchema.Value = true;
        try
        {
            await using var scope = await Database(30);
            var (seller, commission) = await PayableConsignmentCommissionAsync(scope, "RT-AMBIG");
            await using var check = scope.NewContext();
            var connection = check.Database.GetConnectionString()!;

            var lostPrepare = new LostCommitAcknowledgement();
            CommissionPayoutResponse first;
            await using (var db = RetryingContext(connection, 6, lostPrepare))
                first = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-ambig-1"));
            Assert.Equal((2, "Prepared"), (lostPrepare.Commits, first.Summary.Status));
            Assert.Equal(1, await check.CommissionPayouts.AsNoTracking().CountAsync());
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.prepared", first.Summary.Id));

            var lostCancel = new LostCommitAcknowledgement();
            await using (var db = RetryingContext(connection, 6, lostCancel))
            {
                var cancelled = await Payouts(db).CancelAsync(OwnerAccountId, first.Summary.Id, new(first.Summary.ConcurrencyToken, "Prepared twice by mistake"));
                Assert.Equal("Cancelled", cancelled.Summary.Status);
            }
            Assert.Equal(2, lostCancel.Commits);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.cancelled", first.Summary.Id));

            CommissionPayoutResponse second;
            await using (var db = scope.NewContext())
                second = await Payouts(db).PrepareAsync(AdminAccountId, PrepareRequest(seller, commission, "rt-ambig-2"));
            var lostPayment = new LostCommitAcknowledgement();
            await using (var db = RetryingContext(connection, 6, lostPayment))
            {
                var paid = await Payouts(db).MarkPaidAsync(OwnerAccountId, second.Summary.Id, PaidRequest(second));
                Assert.Equal(("Paid", TransferDay), (paid.Summary.Status, paid.Summary.TransferredOn));
            }
            Assert.Equal(2, lostPayment.Commits);
            Assert.Equal(1, await AuditCountAsync(check, "commission-payout.paid", second.Summary.Id));
            var row = await check.SalesCommissions.AsNoTracking().SingleAsync(c => c.Id == commission);
            Assert.Equal((SalesCommissionStatus.Paid, PayoutClock), (row.Status, row.PaidAt));
            Assert.Equal(45m, (await check.CommissionPayouts.AsNoTracking().Where(p => p.Status == CommissionPayoutStatus.Paid).ToListAsync()).Sum(p => p.PreparedAmount));
        }
        finally { MigratedSchema.Value = false; }
    }
}
