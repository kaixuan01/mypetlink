using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The Weekly Recap on real SQL Server. InMemory runs the week, subject and
/// pending rules in process; this proves SQL Server receives them — the
/// undated-Moment fallback, the extra-pet EXISTS and the "no active
/// fulfiller" rule — and that the number of statements does not grow with
/// the number of Moments.
/// </summary>
public sealed class PetWeeklyRecapRelationalTests
{
    private static readonly Guid Owner = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    private static readonly Guid Milo = Guid.Parse("b2222222-2222-2222-2222-222222222221");
    private static readonly Guid Oyen = Guid.Parse("b2222222-2222-2222-2222-222222222222");

    // Thursday 22 October 2026, 10:00 in Malaysia; last week is 12–18 October.
    private static readonly DateTimeOffset Now = new(2026, 10, 22, 2, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 22);
    private static readonly DateOnly LastWeek = new(2026, 10, 12);

    [RelationalFact]
    public async Task WeekSubjectAndPendingRules_RunInSqlServer()
    {
        var capture = new CaptureSql();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        Guid dated, undatedFirst, together, logged, stillDue, dueToday;

        await using (var db = scope.NewContext())
        {
            await SeedOwnerAsync(db);
            var datedMoment = Moment(Milo, "Dated", LastWeek.AddDays(3));
            var undatedIn = Moment(Milo, "Undated Monday 00:00", null);
            var undatedOut = Moment(Milo, "Undated Sunday 23:59:59 before", null);
            var future = Moment(Milo, "Next week", LastWeek.AddDays(7));
            var togetherMoment = Moment(Oyen, "Together", LastWeek.AddDays(5));
            db.PetMemories.AddRange(datedMoment, undatedIn, undatedOut, future, togetherMoment);
            db.MomentPets.Add(new MomentPet { MomentId = togetherMoment.Id, PetId = Milo });
            AddPhoto(db, datedMoment);

            var target = Record(Milo, "Deworm", LastWeek.AddDays(-30), LastWeek.AddDays(1));
            var missed = Record(Milo, "Grooming", LastWeek.AddDays(-30), LastWeek.AddDays(4));
            var today = Record(Milo, "Pill", LastWeek.AddDays(-30), Today);
            db.CareRecords.AddRange(target, missed, today);
            await db.SaveChangesAsync();
            var completion = Record(Milo, "Deworm", LastWeek.AddDays(2), null);
            completion.FulfillsCareRecordId = target.Id;
            db.CareRecords.Add(completion);
            await db.SaveChangesAsync();

            // CreatedAt is stamped on insert; pin the undated pair to the boundary.
            undatedIn.CreatedAt = new DateTimeOffset(2026, 10, 11, 16, 0, 0, TimeSpan.Zero);
            undatedOut.CreatedAt = new DateTimeOffset(2026, 10, 11, 15, 59, 59, TimeSpan.Zero);
            await db.SaveChangesAsync();

            dated = datedMoment.Id;
            undatedFirst = undatedIn.Id;
            together = togetherMoment.Id;
            logged = completion.Id;
            stillDue = missed.Id;
            dueToday = today.Id;
        }

        capture.Queries.Clear();
        await using (var db = scope.NewContext())
        {
            var recap = await NewService(db).GetAsync(Owner, Milo, LastWeek);

            Assert.Equal(3, recap.Moments.Total);
            Assert.Equal(
                new[] { together, dated, undatedFirst },
                recap.Moments.Items.Select(item => item.Id).ToArray());
            Assert.Equal(LastWeek, recap.Moments.Items.Last().Date);
            Assert.False(recap.Moments.Items.First().IsPrimary);
            Assert.Equal("image", recap.Moments.Items.Single(item => item.Id == dated).Preview!.Type);

            Assert.Equal(logged, Assert.Single(recap.Care.Logged.Items).Id);
            Assert.True(recap.Care.Logged.Items.Single().LoggedAsDone);
            Assert.Equal(stillDue, Assert.Single(recap.Care.StillDue.Items).Id);
            Assert.Equal(1, recap.Care.OverdueTotal);
            var coming = Assert.Single(recap.Care.ComingUp.Items);
            Assert.Equal((dueToday, "due-today"), (coming.Id, coming.Status));
        }

        // Pet, Moments, their media and care: one statement each. The Moments
        // and care statements are the only ones that read those tables, so
        // their totals and lists cannot come from different moments.
        Assert.Equal(4, capture.Queries.Count);
        Assert.Single(capture.Queries, sql => sql.Contains("FROM [PetMemories]", StringComparison.Ordinal));
        Assert.Single(capture.Queries, sql => sql.Contains("FROM [CareRecords]", StringComparison.Ordinal));
        var momentSql = capture.Queries.First(sql => sql.Contains("[PetMemories]", StringComparison.Ordinal));
        Assert.Contains("[MomentDate] IS NULL", momentSql, StringComparison.Ordinal);
        Assert.Contains("EXISTS", momentSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("[MomentPets]", momentSql, StringComparison.Ordinal);
        Assert.Contains(
            capture.Queries,
            sql => sql.Contains("[FulfillsCareRecordId]", StringComparison.Ordinal)
                && sql.Contains("NOT EXISTS", StringComparison.OrdinalIgnoreCase));
    }

    [RelationalFact]
    public async Task StatementCount_DoesNotGrowWithTheNumberOfMoments()
    {
        var capture = new CaptureSql();
        await using var scope = await RelationalDatabase.CreateAsync(capture);

        await using (var db = scope.NewContext())
        {
            await SeedOwnerAsync(db);
            var single = Moment(Oyen, "Only one", LastWeek);
            db.PetMemories.Add(single);
            AddPhoto(db, single);
            for (var index = 0; index < 40; index++)
            {
                var moment = Moment(Milo, $"Moment {index}", LastWeek.AddDays(index % 7));
                db.PetMemories.Add(moment);
                AddPhoto(db, moment);
            }
            await db.SaveChangesAsync();
        }

        capture.Queries.Clear();
        await using (var db = scope.NewContext())
        {
            await NewService(db).GetAsync(Owner, Oyen, LastWeek);
        }
        var oneMoment = capture.Queries.Count;

        capture.Queries.Clear();
        await using (var db = scope.NewContext())
        {
            var recap = await NewService(db).GetAsync(Owner, Milo, LastWeek);
            Assert.Equal(40, recap.Moments.Total);
            Assert.All(recap.Moments.Items, item => Assert.NotNull(item.Preview));
        }

        Assert.Equal(oneMoment, capture.Queries.Count);
    }

    /// <summary>
    /// The recap issues four statements here — the pet, the week's Moments,
    /// their media, the care rowset — so there are three boundaries between
    /// them. Another connection writes at each one, and each case asserts the
    /// write really happened. Two kinds of write: <c>change</c> inserts a
    /// public Moment, archives another, archives a missed care item and
    /// completes a coming-up one; <c>move</c> makes a private Moment public
    /// and moves a care item's due date from "coming up" into "still due".
    /// Whichever lands where, the answer must agree with itself: totals that
    /// add up, lists as long as their totals allow, and no item in two due
    /// lists. (Before the single-rowset reads, the separate COUNT and list
    /// statements gave contradictory answers at several boundaries.)
    /// </summary>
    [RelationalTheory]
    [InlineData(1, "change")]
    [InlineData(2, "change")]
    [InlineData(3, "change")]
    [InlineData(1, "move")]
    [InlineData(2, "move")]
    [InlineData(3, "move")]
    public async Task AWriteAtEveryStatementBoundary_LeavesTheRecapCoherent(int afterStatement, string write)
    {
        var injector = new WriteAfterStatement(afterStatement);
        await using var scope = await RelationalDatabase.CreateAsync(injector);
        Guid archivedMoment, missedCare, comingCare;

        await using (var db = scope.NewContext())
        {
            await SeedOwnerAsync(db);
            var keep = Moment(Milo, "Kept", LastWeek.AddDays(1));
            var archive = Moment(Milo, "Archived mid-read", LastWeek.AddDays(2));
            db.PetMemories.AddRange(keep, archive);
            var missed = Record(Milo, "Missed", LastWeek.AddDays(-30), LastWeek.AddDays(3));
            var coming = Record(Milo, "Coming", LastWeek.AddDays(-30), Today.AddDays(2));
            db.CareRecords.AddRange(missed, coming, Record(Milo, "Logged", LastWeek.AddDays(4), null));
            await db.SaveChangesAsync();
            archivedMoment = archive.Id;
            missedCare = missed.Id;
            comingCare = coming.Id;
        }

        injector.Write = async () =>
        {
            await using var writer = scope.NewContext();
            if (write == "change")
            {
                writer.PetMemories.Add(Moment(Milo, "Inserted mid-read", LastWeek.AddDays(5), MemoryVisibility.Public));
                (await writer.PetMemories.SingleAsync(item => item.Id == archivedMoment)).ArchivedAt = Now;
                (await writer.CareRecords.SingleAsync(item => item.Id == missedCare)).ArchivedAt = Now;
                var done = Record(Milo, "Coming done", Today, null);
                done.FulfillsCareRecordId = comingCare;
                writer.CareRecords.Add(done);
            }
            else
            {
                var published = await writer.PetMemories.SingleAsync(item => item.Id == archivedMoment);
                published.Visibility = MemoryVisibility.Public;
                published.PublishedAt = Now;
                (await writer.CareRecords.SingleAsync(item => item.Id == comingCare)).DueDate = LastWeek.AddDays(5);
            }
            await writer.SaveChangesAsync();
        };

        WeeklyRecapResponse recap;
        await using (var db = scope.NewContext())
        {
            injector.Arm();
            recap = await NewService(db).GetAsync(Owner, Milo, LastWeek);
        }

        Assert.True(injector.Fired, $"the write did not happen after statement {afterStatement}");
        Assert.Equal(4, injector.Statements);

        var moments = recap.Moments;
        Assert.True(moments.SharedPubliclyCount >= 0 && moments.OnlyMeCount >= 0, $"negative audience count at {afterStatement}");
        Assert.Equal(moments.Total, moments.SharedPubliclyCount + moments.OnlyMeCount);
        Assert.Equal(Math.Min(moments.Total, MemoryService.WeeklyRecapMomentItemLimit), moments.Items.Count);
        Assert.Equal(moments.Items.Count, moments.Items.Select(item => item.Id).Distinct().Count());
        Assert.Equal(moments.SharedPubliclyCount, moments.Items.Count(item => item.Visibility == MemoryVisibility.Public));

        var care = recap.Care;
        Assert.Equal(Math.Min(care.Logged.Total, CareRecordService.WeeklyRecapLoggedItemLimit), care.Logged.Items.Count);
        Assert.Equal(Math.Min(care.StillDue.Total, CareRecordService.WeeklyRecapStillDueItemLimit), care.StillDue.Items.Count);
        Assert.Equal(Math.Min(care.ComingUp.Total, CareRecordService.WeeklyRecapComingUpItemLimit), care.ComingUp.Items.Count);
        Assert.True(care.StillDue.Total <= care.OverdueTotal, $"still due {care.StillDue.Total} > overdue {care.OverdueTotal} at {afterStatement}");
        Assert.Empty(care.StillDue.Items.Select(item => item.Id).Intersect(care.ComingUp.Items.Select(item => item.Id)));
        Assert.True(care.HasCareRecords);
    }

    /// <summary>
    /// 50 Moments dated Monday and one undated older Moment written on that
    /// week's Sunday in Malaysia: the Sunday one is the newest, so it must be
    /// in the capped list, first — the fallback date is applied before the cap.
    /// </summary>
    [RelationalFact]
    public async Task AnUndatedSundayMoment_IsNotDroppedByFiftyDatedMondayOnes()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        Guid sunday;
        await using (var db = scope.NewContext())
        {
            await SeedOwnerAsync(db);
            for (var index = 0; index < 50; index++)
            {
                db.PetMemories.Add(Moment(Milo, $"Monday {index}", LastWeek));
            }
            var legacy = Moment(Milo, "Legacy Sunday", null);
            db.PetMemories.Add(legacy);
            await db.SaveChangesAsync();
            // Sunday 18 Oct, 20:00 in Malaysia; stamped on insert, so pinned after.
            legacy.CreatedAt = new DateTimeOffset(2026, 10, 18, 12, 0, 0, TimeSpan.Zero);
            await db.SaveChangesAsync();
            sunday = legacy.Id;
        }

        await using (var db = scope.NewContext())
        {
            var recap = await NewService(db).GetAsync(Owner, Milo, LastWeek);

            Assert.Equal(51, recap.Moments.Total);
            Assert.Equal(50, recap.Moments.Items.Count);
            Assert.Equal(sunday, recap.Moments.Items.First().Id);
            Assert.Equal(new DateOnly(2026, 10, 18), recap.Moments.Items.First().Date);
        }
    }

    private static PetWeeklyRecapService NewService(MyPetLinkDbContext db)
    {
        var time = new FixedTime(Now);
        return new PetWeeklyRecapService(
            db,
            new MemoryService(db, Options.Create(new CloudflareR2Options { PublicBaseUrl = "https://media.example.test" })),
            new CareRecordService(db, time),
            time);
    }

    private static async Task SeedOwnerAsync(MyPetLinkDbContext db)
    {
        db.Users.Add(new User
        {
            Id = Owner,
            Email = "owner@example.com",
            NormalizedEmail = "OWNER@EXAMPLE.COM",
            DisplayName = "Owner",
            Status = UserStatus.Active
        });
        db.Pets.Add(Pet(Milo, "Milo"));
        db.Pets.Add(Pet(Oyen, "Oyen"));
        await db.SaveChangesAsync();
        foreach (var pet in db.Pets)
        {
            pet.CreatedAt = Now.AddYears(-1);
        }
        await db.SaveChangesAsync();
    }

    private static Pet Pet(Guid id, string name) => new()
    {
        Id = id,
        OwnerUserId = Owner,
        Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
        Name = name,
        Species = "Cat"
    };

    private static PetMemory Moment(
        Guid petId,
        string title,
        DateOnly? date,
        MemoryVisibility visibility = MemoryVisibility.Private) => new()
    {
        Id = Guid.NewGuid(),
        PetId = petId,
        AuthorUserId = Owner,
        Title = title,
        MomentDate = date,
        Type = "Everyday",
        Visibility = visibility,
        PublishedAt = visibility == MemoryVisibility.Public ? Now : null
    };

    private static void AddPhoto(MyPetLinkDbContext db, PetMemory moment)
    {
        var key = $"moments/{moment.PetId:N}/{Guid.NewGuid():N}.jpg";
        var media = new MediaFile
        {
            Id = Guid.NewGuid(),
            OwnerUserId = Owner,
            PetId = moment.PetId,
            MediaType = MediaFileType.Image,
            Category = MediaUploadCategory.MomentImage,
            IsPublic = true,
            UploadStatus = MediaUploadStatus.Ready,
            ObjectKey = key,
            ThumbnailObjectKey = MediaDerivatives.BuildThumbnailObjectKey(key),
            DerivativeStatus = MediaDerivativeStatus.Ready,
            ContentType = "image/jpeg"
        };
        db.MediaFiles.Add(media);
        db.MediaFileLinks.Add(new MediaFileLink
        {
            MediaFileId = media.Id,
            OwnerType = MediaOwnerType.PetMemory,
            OwnerId = moment.Id
        });
    }

    private static CareRecord Record(Guid petId, string title, DateOnly recordDate, DateOnly? dueDate) => new()
    {
        PetId = petId,
        Type = CareRecordType.Vaccine,
        Title = title,
        RecordDate = recordDate,
        DueDate = dueDate,
        PublicVisibility = CareRecordPublicVisibility.Private
    };

    private sealed class FixedTime(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    /// <summary>
    /// Runs <see cref="Write"/> once, on another connection, just before the
    /// statement after the Nth one the recap issues — so the Nth has finished
    /// and the next has not started.
    /// </summary>
    private sealed class WriteAfterStatement(int afterStatement) : DbCommandInterceptor
    {
        private int _seen;
        private bool _armed;
        private bool _counting;

        public Func<Task> Write { get; set; } = () => Task.CompletedTask;

        /// <summary>The write ran, between the statements it was meant for.</summary>
        public bool Fired { get; private set; }

        /// <summary>Statements the recap issued once armed; the write's own are not counted.</summary>
        public int Statements { get; private set; }

        public void Arm()
        {
            _seen = 0;
            _armed = true;
            _counting = true;
            Fired = false;
            Statements = 0;
        }

        public override async ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            await BeforeStatementAsync();
            return result;
        }

        public override async ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<object> result,
            CancellationToken cancellationToken = default)
        {
            await BeforeStatementAsync();
            return result;
        }

        private async Task BeforeStatementAsync()
        {
            if (!_counting) return;
            if (_armed && _seen == afterStatement)
            {
                _armed = false;
                _counting = false;
                await Write();
                Fired = true;
                _counting = true;
            }

            _seen++;
            Statements++;
        }
    }

    private sealed class CaptureSql : DbCommandInterceptor
    {
        public List<string> Queries { get; } = [];

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Queries.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
}
