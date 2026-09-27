using System.Data.Common;
using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// What the feed and search queries actually do to SQL Server.
///
/// Passing behaviour tests prove a query returns the right rows; they prove
/// nothing about how. These run the real service against a real database with
/// enough rows for the optimiser to have a genuine choice, capture the SQL EF
/// emitted, and read the execution plan back through SHOWPLAN_XML.
/// </summary>
public sealed class SocialQueryPlanRelationalTests
{
    private readonly ITestOutputHelper _output;

    public SocialQueryPlanRelationalTests(ITestOutputHelper output)
    {
        _output = output;
    }

    private static readonly Guid ViewerId = Guid.Parse("d1111111-1111-1111-1111-111111111111");

    /// <summary>
    /// Enough pets that a table scan is a real cost. With a handful of rows SQL
    /// Server scans whatever you give it and the plan says nothing useful.
    /// </summary>
    private const int PetCount = 2_000;

    [RelationalFact]
    public async Task PetNameSearch_IsAPrefixSeekAgainstTheNameIndex()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);

        await SeedAsync(scope);

        await using var context = scope.NewContext();
        var discovery = NewDiscoveryService(context);

        capture.Reset();
        var results = await discovery.SearchAsync(null, "pet17", "pets", null, null);
        Assert.NotEmpty(results.Pets);

        var command = capture.Single(text => text.Contains("[Pets]", StringComparison.Ordinal));

        // Sargable by construction: a bare LIKE against a parameter, never
        // wrapped in a function and never a leading wildcard.
        Assert.Contains("LIKE @", command.CommandText, StringComparison.Ordinal);
        Assert.DoesNotContain("LIKE N'%", command.CommandText, StringComparison.Ordinal);
        Assert.DoesNotContain("LOWER(", command.CommandText, StringComparison.OrdinalIgnoreCase);

        var plan = await ExplainAsync(context, command);
        _output.WriteLine("full search plan");
        _output.WriteLine(Summarise(plan));

        // Every access path is an index. Nothing here reads a heap.
        Assert.DoesNotContain("Table Scan", plan, StringComparison.Ordinal);

        // The index is what SERVES the predicate, which is what we can assert
        // deterministically. Whether the optimiser reaches for it in the full
        // query depends on row counts: at a few thousand pets a scan of the
        // clustered index genuinely costs less than a seek plus a key lookup
        // per row, and it is right to prefer it. The narrow, covering form
        // below is the one that isolates the predicate from that decision.
        var isolated = await ExplainRawAsync(
            context,
            "SELECT [Id] FROM [Pets] WHERE [Name] LIKE N'Pet17%'");
        _output.WriteLine("isolated predicate plan");
        _output.WriteLine(Summarise(isolated));

        Assert.Contains("IX_Pets_Name", isolated, StringComparison.Ordinal);
        Assert.Contains("Index Seek", isolated, StringComparison.Ordinal);
    }

    [RelationalFact]
    public async Task PetNameSearch_IsCaseInsensitiveThroughTheDatabaseCollation()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await SeedAsync(scope);

        await using var context = scope.NewContext();
        var discovery = NewDiscoveryService(context);

        var lower = await discovery.SearchAsync(null, "pet170", "pets", null, null);
        var upper = await discovery.SearchAsync(null, "PET170", "pets", null, null);

        // The column is not lowered in the query — that would make the index
        // unusable. Case-insensitivity comes from the collation instead.
        Assert.NotEmpty(lower.Pets);
        Assert.Equal(
            lower.Pets.Select(pet => pet.Name).ToArray(),
            upper.Pets.Select(pet => pet.Name).ToArray());
    }

    [RelationalFact]
    public async Task OwnerHandleSearch_SeeksTheNormalizedHandleIndex()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);

        await SeedAsync(scope);

        await using var context = scope.NewContext();
        var discovery = NewDiscoveryService(context);

        capture.Reset();
        var results = await discovery.SearchAsync(null, "house17", "owners", null, null);
        Assert.NotEmpty(results.Owners);

        var command = capture.Single(text =>
            text.Contains("NormalizedHandle", StringComparison.Ordinal));

        // Sargable: the normalized column compared to a parameter, not lowered
        // or otherwise wrapped, and no leading wildcard.
        Assert.Contains("[NormalizedHandle] LIKE @", command.CommandText, StringComparison.Ordinal);
        Assert.DoesNotContain("LIKE N'%", command.CommandText, StringComparison.Ordinal);

        var plan = await ExplainAsync(context, command);
        _output.WriteLine("full search plan");
        _output.WriteLine(Summarise(plan));
        Assert.DoesNotContain("Table Scan", plan, StringComparison.Ordinal);

        var isolated = await ExplainRawAsync(
            context,
            "SELECT [UserId] FROM [OwnerSocialProfiles] WHERE [NormalizedHandle] LIKE N'house17%'");
        _output.WriteLine("isolated predicate plan");
        _output.WriteLine(Summarise(isolated));

        Assert.Contains(
            "IX_OwnerSocialProfiles_NormalizedHandle", isolated, StringComparison.Ordinal);
        Assert.Contains("Index Seek", isolated, StringComparison.Ordinal);
    }

    [RelationalFact]
    public async Task TheFeed_IsOneQueryThatJoinsTheFollowGraphInSql()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);

        await SeedAsync(scope, withFollows: true, withMoments: true);

        await using var context = scope.NewContext();
        var feed = new SocialFeedService(context, NewProjection(context));

        capture.Reset();
        var page = await feed.GetFeedAsync(ViewerId, null, null);
        Assert.NotEmpty(page.Items);

        // Nine round trips for a page of ANY size: the Moment selection, then
        // one batched query each for subjects, media, authors, like counts,
        // viewer-visible Comment counts, visible collaborators and viewer
        // likes, plus a single EXISTS asking whether this viewer follows
        // anybody at all. Never one per Moment — that is the N+1 this guards.
        //
        // The ninth is what lets the UI tell "you follow nobody" apart from
        // "nobody you follow has posted lately", which an empty page cannot say
        // for itself. It is a constant: see the scale test, where 1, 50 and 500
        // follows all produce this same count.
        _output.WriteLine($"round trips: {capture.Commands.Count}");
        Assert.Equal(9, capture.Commands.Count);

        var selection = capture.Commands[0];

        // The follow graph is joined in SQL. If this ever becomes "load my
        // follows, then fetch Moments for those ids", the round trip grows with
        // the follow list and the filtering moves into memory.
        Assert.Contains("OwnerFollows", selection.CommandText, StringComparison.Ordinal);
        Assert.Contains("PetMemories", selection.CommandText, StringComparison.Ordinal);

        var plan = await ExplainAsync(context, selection);
        _output.WriteLine("feed selection plan");
        _output.WriteLine(Summarise(plan));

        // The follow graph is seeked, not scanned, and the block check rides its
        // own index. Both are the indexes the foundation put there for this.
        Assert.Contains(
            "IX_OwnerFollows_FollowerUserId_FollowedUserId", plan, StringComparison.Ordinal);
        Assert.Contains(
            "IX_OwnerBlocks_BlockerUserId_BlockedUserId", plan, StringComparison.Ordinal);
        Assert.Contains("Index Seek", plan, StringComparison.Ordinal);
        Assert.DoesNotContain("Table Scan", plan, StringComparison.Ordinal);
    }

    [RelationalFact]
    public async Task TheFeedDoesNotGrowAQueryPerMomentAsThePageGrows()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);

        await SeedAsync(scope, withFollows: true, withMoments: true);

        await using var context = scope.NewContext();
        var feed = new SocialFeedService(context, NewProjection(context));

        capture.Reset();
        await feed.GetFeedAsync(ViewerId, null, 1);
        var forOne = capture.Commands.Count;

        capture.Reset();
        await feed.GetFeedAsync(ViewerId, null, 30);
        var forThirty = capture.Commands.Count;

        _output.WriteLine($"round trips: 1 item = {forOne}, 30 items = {forThirty}");
        Assert.Equal(forOne, forThirty);
    }

    /// <summary>
    /// Every Comment read on a Reply-heavy database — a thread, one thread's
    /// Replies, and the batched Comment counts on a page of Moment cards —
    /// seeks the thread index and never scans the Comments table.
    ///
    /// The card count is the one this guards hardest. With the parent rule
    /// written as a correlated EXISTS inside an OR, SQL Server stopped seeking
    /// by the page's Moment ids and scanned every Comment instead: about 447,000
    /// logical reads for a 30-card page against about 4,400 before Replies. The
    /// parent is now a join on its primary key, and a scan here fails the test.
    /// </summary>
    [RelationalFact]
    public async Task ReplyReads_SeekTheThreadIndexAndNeverScanComments()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        await SeedAsync(scope, withMoments: true);
        var seeded = await SeedCommentsAsync(scope);

        await using var context = scope.NewContext();
        var r2 = Options.Create(new CloudflareR2Options());
        var comments = new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
        var discovery = new SocialDiscoveryService(context, r2, NewProjection(context));

        var reads = new (string Label, Func<Task> Read)[]
        {
            ("thread", () => comments.GetAsync(seeded.HotMomentId, ViewerId, null, null)),
            ("replies", () => comments.GetRepliesAsync(seeded.HotMomentId, seeded.BusyParentId, ViewerId, null, null)),
            ("cards", () => discovery.GetLatestMomentsAsync(ViewerId, null, null, 30))
        };

        foreach (var (label, read) in reads)
        {
            capture.Reset();
            await read();
            var commentCommands = capture.Commands
                .Where(command => command.CommandText.Contains("[MomentComments]", StringComparison.Ordinal))
                .ToArray();
            Assert.NotEmpty(commentCommands);
            _output.WriteLine($"{label}: {capture.Commands.Count} round trips");

            var all = new List<string>();
            foreach (var command in commentCommands)
            {
                var accesses = Accesses(await ExplainAsync(context, command), "MomentComments");
                _output.WriteLine($"  {await LogicalReadsAsync(context, command)}");
                _output.WriteLine($"  MomentComments: {string.Join("; ", accesses)}");

                Assert.DoesNotContain(accesses, access => access.Contains("Scan", StringComparison.Ordinal));
                all.AddRange(accesses);
            }

            // The page, the counts and the Reply counts all ride the thread
            // index; a mention lookup only touches Comments by primary key.
            Assert.Contains(
                "Index Seek [MomentComments] [IX_MomentComments_MomentId_ParentCommentId_CreatedAt_Id]",
                all);
        }
    }

    [RelationalFact]
    public async Task ReplyCounts_AreOneBatchedQueryWhateverThePageSize()
    {
        var capture = new CapturingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(capture);
        await SeedAsync(scope, withMoments: true);
        var seeded = await SeedCommentsAsync(scope);

        await using var context = scope.NewContext();
        var r2 = Options.Create(new CloudflareR2Options());
        var comments = new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);

        async Task<(int Trips, int ReplyCountQueries, int Items)> Measure(int pageSize)
        {
            capture.Reset();
            var page = await comments.GetAsync(seeded.HotMomentId, ViewerId, null, pageSize);
            return (
                capture.Commands.Count,
                capture.Commands.Count(command =>
                    command.CommandText.Contains("GROUP BY [m].[ParentCommentId]", StringComparison.Ordinal)),
                page.Items.Count);
        }

        var one = await Measure(1);
        var full = await Measure(20);
        _output.WriteLine($"thread round trips: 1 item = {one.Trips}, {full.Items} items = {full.Trips}");

        Assert.Equal(20, full.Items);
        Assert.Equal(one.Trips, full.Trips);
        Assert.Equal(1, one.ReplyCountQueries);
        Assert.Equal(1, full.ReplyCountQueries);

        capture.Reset();
        await comments.GetRepliesAsync(seeded.HotMomentId, seeded.BusyParentId, ViewerId, null, 1);
        var replyTrips = capture.Commands.Count;
        capture.Reset();
        await comments.GetRepliesAsync(seeded.HotMomentId, seeded.BusyParentId, ViewerId, null, 30);
        Assert.Equal(replyTrips, capture.Commands.Count);
    }

    private const int CommentedMoments = 2_000;

    private sealed record SeededComments(Guid HotMomentId, Guid BusyParentId);

    /// <summary>
    /// Comments on every Moment — ten top-level Comments, each with two
    /// Replies, about 60,000 rows in all — so a page of cards reads a sliver of
    /// the table, as it does in production; and one busy Moment, the newest,
    /// with 150 top-level Comments, 40 of them with threads of up to 30
    /// Replies, some deleted.
    /// </summary>
    private static async Task<SeededComments> SeedCommentsAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        var moments = await context.PetMemories.AsNoTracking()
            .OrderByDescending(moment => moment.PublishedAt)
            .Select(moment => new { moment.Id, moment.AuthorUserId })
            .Take(CommentedMoments)
            .ToListAsync();
        var authors = await context.Users.AsNoTracking()
            .Where(user => user.Id != ViewerId)
            .Select(user => user.Id)
            .Take(300)
            .ToListAsync();
        var start = new DateTimeOffset(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);
        var random = new Random(20260927);
        var rows = new List<MomentComment>();

        MomentComment Add(Guid momentId, Guid? parentId, int minutes, bool deleted = false)
        {
            var authorId = authors[random.Next(authors.Count)];
            var row = new MomentComment
            {
                MomentId = momentId,
                ParentCommentId = parentId,
                AuthorUserId = authorId,
                Body = deleted ? "" : $"Comment {rows.Count}",
                CreatedAt = start.AddMinutes(minutes),
                DeletedAt = deleted ? start.AddMinutes(minutes + 1) : null,
                DeletedByUserId = deleted ? authorId : null
            };
            rows.Add(row);
            return row;
        }

        foreach (var moment in moments.Skip(1))
        {
            for (var index = 0; index < 10; index += 1)
            {
                var parent = Add(moment.Id, null, index * 10);
                Add(moment.Id, parent.Id, index * 10 + 1);
                Add(moment.Id, parent.Id, index * 10 + 2);
            }
        }

        var hot = moments[0].Id;
        Guid busy = Guid.Empty;
        for (var index = 0; index < 150; index += 1)
        {
            var parent = Add(hot, null, index * 100, deleted: index % 25 == 24);
            if (index % 150 < 40)
            {
                var replies = index == 7 ? 30 : 1 + index % 12;
                for (var reply = 0; reply < replies; reply += 1)
                {
                    Add(hot, parent.Id, index * 100 + reply, deleted: reply % 9 == 8);
                }
            }

            if (index == 7)
            {
                busy = parent.Id;
            }
        }

        context.MomentComments.AddRange(rows);
        await context.SaveChangesAsync();
        await context.Database.ExecuteSqlRawAsync("UPDATE STATISTICS [MomentComments]");
        return new SeededComments(hot, busy);
    }

    /// <summary>
    /// Every access the plan makes to one table: the physical operator and the
    /// index it uses.
    /// </summary>
    private static IReadOnlyList<string> Accesses(string planXml, string table)
    {
        var plan = System.Xml.Linq.XDocument.Parse(planXml);
        return plan.Descendants()
            .Where(element => element.Name.LocalName == "RelOp")
            .Select(relOp => new
            {
                Op = (string?)relOp.Attribute("PhysicalOp"),
                Access = relOp.Elements().FirstOrDefault(child =>
                    child.Name.LocalName is "IndexScan" or "TableScan")
            })
            .Where(item => item.Access is not null)
            .Select(item => new
            {
                item.Op,
                Object = item.Access!.Elements().FirstOrDefault(child => child.Name.LocalName == "Object")
            })
            .Where(item => (string?)item.Object?.Attribute("Table") == $"[{table}]")
            .Select(item => $"{item.Op} {(string?)item.Object!.Attribute("Table")} {(string?)item.Object!.Attribute("Index")}")
            .ToArray();
    }

    /// <summary>Logical reads per table for one captured command, from STATISTICS IO.</summary>
    private static async Task<string> LogicalReadsAsync(MyPetLinkDbContext context, CapturedCommand command)
    {
        var batch = new System.Text.StringBuilder("SET STATISTICS IO ON;\n");
        foreach (var parameter in command.Parameters)
        {
            batch.AppendLine(Declare(parameter));
        }

        batch.AppendLine(command.CommandText);
        var messages = new List<string>();
        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        connection.InfoMessage += (_, args) => messages.Add(args.Message);
        await connection.OpenAsync();
        await using var run = connection.CreateCommand();
        run.CommandText = batch.ToString();
        await using (var reader = await run.ExecuteReaderAsync())
        {
            do
            {
                while (await reader.ReadAsync())
                {
                }
            }
            while (await reader.NextResultAsync());
        }

        var reads = Regex.Matches(string.Join("\n", messages), @"Table '([^']+)'\. Scan count (\d+), logical reads (\d+)")
            .Select(match => (Table: match.Groups[1].Value, Reads: int.Parse(match.Groups[3].Value)))
            .ToArray();
        return $"logical reads total={reads.Sum(item => item.Reads)}; "
            + string.Join(", ", reads.Where(item => item.Reads > 0).Select(item => $"{item.Table}={item.Reads}"));
    }

    // ---- plumbing -------------------------------------------------------

    private static SocialMomentProjection NewProjection(MyPetLinkDbContext context)
    {
        return new SocialMomentProjection(
            context,
            Options.Create(new CloudflareR2Options()));
    }

    private static SocialDiscoveryService NewDiscoveryService(MyPetLinkDbContext context)
    {
        return new SocialDiscoveryService(
            context,
            Options.Create(new CloudflareR2Options()),
            NewProjection(context));
    }

    /// <summary>
    /// Re-runs a captured command under SHOWPLAN_XML and returns the plan.
    ///
    /// The parameters are inlined as DECLAREs rather than passed as
    /// SqlParameters. A parameterised command goes through <c>sp_executesql</c>,
    /// and SHOWPLAN_XML does not compile the inner batch — it returns an empty
    /// result and it looks as though there is no plan. Inlining keeps it one
    /// batch, with the real values, so the plan is the one this query gets.
    /// </summary>
    private static async Task<string> ExplainAsync(
        MyPetLinkDbContext context,
        CapturedCommand command)
    {
        var batch = new System.Text.StringBuilder();

        foreach (var parameter in command.Parameters)
        {
            batch.AppendLine(Declare(parameter));
        }

        batch.AppendLine(command.CommandText);

        await using var connection = new SqlConnection(context.Database.GetConnectionString());
        await connection.OpenAsync();

        await using (var toggle = connection.CreateCommand())
        {
            toggle.CommandText = "SET SHOWPLAN_XML ON";
            await toggle.ExecuteNonQueryAsync();
        }

        await using var explained = connection.CreateCommand();
        explained.CommandText = batch.ToString();

        await using var reader = await explained.ExecuteReaderAsync();
        var plan = new System.Text.StringBuilder();

        do
        {
            while (await reader.ReadAsync())
            {
                plan.Append(reader.GetValue(0)?.ToString());
            }
        }
        while (await reader.NextResultAsync());

        if (plan.Length == 0)
        {
            throw new InvalidOperationException(
                "SHOWPLAN_XML returned nothing for: " + batch);
        }

        return plan.ToString();
    }

    /// <summary>Explains a literal statement, with no parameters to inline.</summary>
    private static Task<string> ExplainRawAsync(MyPetLinkDbContext context, string sql)
    {
        return ExplainAsync(
            context,
            new CapturedCommand(sql, Array.Empty<CapturedParameter>()));
    }

    /// <summary>A T-SQL declaration for one captured parameter value.</summary>
    private static string Declare(CapturedParameter parameter)
    {
        var name = parameter.Name.StartsWith('@') ? parameter.Name : $"@{parameter.Name}";

        return parameter.Value switch
        {
            null or DBNull => $"DECLARE {name} nvarchar(4000) = NULL;",
            string text =>
                $"DECLARE {name} nvarchar(4000) = N'{text.Replace("'", "''", StringComparison.Ordinal)}';",
            Guid id => $"DECLARE {name} uniqueidentifier = '{id:D}';",
            bool flag => $"DECLARE {name} bit = {(flag ? 1 : 0)};",
            int number => $"DECLARE {name} int = {number};",
            long number => $"DECLARE {name} bigint = {number};",
            DateTimeOffset moment =>
                $"DECLARE {name} datetimeoffset = '{moment:yyyy-MM-dd HH:mm:ss.fffffff zzz}';",
            DateTime moment => $"DECLARE {name} datetime2 = '{moment:yyyy-MM-dd HH:mm:ss.fffffff}';",
            _ => throw new NotSupportedException(
                $"No declaration for parameter type {parameter.Value.GetType()}.")
        };
    }

    /// <summary>The operators and indexes in a plan, for the test output.</summary>
    private static string Summarise(string planXml)
    {
        var operators = Regex
            .Matches(planXml, @"PhysicalOp=""([^""]+)""")
            .Select(match => match.Groups[1].Value);
        var indexes = Regex
            .Matches(planXml, @"Index=""\[([^\]]+)\]""")
            .Select(match => match.Groups[1].Value)
            .Distinct();

        return $"operators: {string.Join(", ", operators)}\nindexes: {string.Join(", ", indexes)}";
    }

    private static async Task SeedAsync(
        RelationalScope scope,
        bool withFollows = false,
        bool withMoments = false)
    {
        await using var context = scope.NewContext();
        var planId = context.Plans.Single(item => item.Code == "Free").Id;

        AddOwner(context, ViewerId, "viewer", planId);

        for (var index = 0; index < PetCount; index += 1)
        {
            var ownerId = Guid.NewGuid();
            var petId = Guid.NewGuid();

            AddOwner(context, ownerId, $"house{index}", planId);

            context.Pets.Add(new Pet
            {
                Id = petId,
                OwnerUserId = ownerId,
                Slug = $"pet{index}-{index}",
                Name = $"Pet{index}",
                Species = index % 2 == 0 ? "Cat" : "Dog",
                PublicProfile = new PetPublicProfile
                {
                    PetId = petId,
                    PublicCode = $"code{index}",
                    SlugSnapshot = $"pet{index}-{index}",
                    IsPublicProfileEnabled = true,
                    ShowMoments = true
                },
                SocialProfile = new PetSocialProfile
                {
                    PetId = petId,
                    IsSocialEnabled = true,
                    IsDiscoverable = true,
                    ConsentedByUserId = ownerId
                }
            });

            if (withFollows && index % 3 == 0)
            {
                context.OwnerFollows.Add(new OwnerFollow
                {
                    FollowerUserId = ViewerId,
                    FollowedUserId = ownerId
                });
            }

            if (withMoments)
            {
                var moment = new PetMemory
                {
                    Id = Guid.NewGuid(),
                    PetId = petId,
                    AuthorUserId = ownerId,
                    Title = $"Moment {index}",
                    Type = "Memory",
                    Visibility = MemoryVisibility.Public,
                    PublishedAt = DateTimeOffset.UtcNow.AddMinutes(-index)
                };
                context.PetMemories.Add(moment);
                context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = petId });
            }
        }

        await context.SaveChangesAsync();

        // Statistics decide the plan, and a freshly bulk-loaded table has none
        // worth trusting.
        await context.Database.ExecuteSqlRawAsync("UPDATE STATISTICS [Pets]");
        await context.Database.ExecuteSqlRawAsync("UPDATE STATISTICS [OwnerSocialProfiles]");
        await context.Database.ExecuteSqlRawAsync("UPDATE STATISTICS [OwnerFollows]");
        await context.Database.ExecuteSqlRawAsync("UPDATE STATISTICS [PetMemories]");
    }

    private static void AddOwner(
        MyPetLinkDbContext context,
        Guid id,
        string handle,
        Guid planId)
    {
        context.Users.Add(new User
        {
            Id = id,
            Email = $"{handle}@example.com",
            NormalizedEmail = $"{handle}@example.com".ToUpperInvariant(),
            DisplayName = handle,
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile
            {
                UserId = id,
                OwnerDisplayName = handle,
                PlanId = planId
            },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle,
                DisplayName = $"The {handle} Family",
                NormalizedDisplayName = $"the {handle} family",
                IsSocialEnabled = true,
                IsDiscoverable = true,
                AllowFollowers = true
            }
        });
    }

    private sealed record CapturedParameter(string Name, object? Value, DbType DbType);

    private sealed record CapturedCommand(
        string CommandText,
        IReadOnlyList<CapturedParameter> Parameters);

    /// <summary>Records what EF actually sent, parameters and all.</summary>
    private sealed class CapturingCommandInterceptor : DbCommandInterceptor
    {
        public List<CapturedCommand> Commands { get; } = new();

        public void Reset() => Commands.Clear();

        public CapturedCommand Single(Func<string, bool> predicate)
        {
            return Commands.Single(command => predicate(command.CommandText));
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            Record(command);
            return base.ReaderExecuting(command, eventData, result);
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Record(command);
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }

        private void Record(DbCommand command)
        {
            Commands.Add(new CapturedCommand(
                command.CommandText,
                command.Parameters
                    .Cast<DbParameter>()
                    .Select(parameter => new CapturedParameter(
                        parameter.ParameterName,
                        parameter.Value,
                        parameter.DbType))
                    .ToArray()));
        }
    }
}
