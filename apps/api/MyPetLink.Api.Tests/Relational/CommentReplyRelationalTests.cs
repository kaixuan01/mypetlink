using System.Data.Common;
using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// The Reply read model on real SQL Server: what the schema itself refuses,
/// how malformed rows the schema cannot refuse are kept out of every read,
/// uniqueidentifier ordering across tied timestamps, removal through the
/// retrying execution strategy, and a Reply-heavy Moment at scale. Nothing can
/// write a Reply yet, so every Reply here is written straight into the table.
/// </summary>
public sealed class CommentReplyRelationalTests
{
    private readonly ITestOutputHelper _output;

    public CommentReplyRelationalTests(ITestOutputHelper output)
    {
        _output = output;
    }

    private static readonly Guid Alice = Guid.Parse("e1111111-1111-1111-1111-111111111111"); // Moment author
    private static readonly Guid Bob = Guid.Parse("e2222222-2222-2222-2222-222222222222");   // parent author
    private static readonly Guid Carol = Guid.Parse("e3333333-3333-3333-3333-333333333333"); // replies
    private static readonly Guid Erin = Guid.Parse("e4444444-4444-4444-4444-444444444444");  // replies
    private static readonly Guid Gina = Guid.Parse("e5555555-5555-5555-5555-555555555555");  // a reader
    private static readonly Guid MochiId = Guid.Parse("e6111111-1111-1111-1111-111111111111");

    private static readonly DateTimeOffset Start = new(2026, 9, 1, 8, 0, 0, TimeSpan.Zero);

    // ---- schema -----------------------------------------------------------------

    [RelationalFact]
    public async Task TheSchemaRefusesADanglingParentAndACommentThatIsItsOwnParent()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var momentId = await SeedWorldAsync(scope);

        await using (var context = scope.NewContext())
        {
            context.MomentComments.Add(Comment(momentId, Guid.NewGuid(), Carol, "Nobody's reply", 1));
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Contains("FK_MomentComments_MomentComments_ParentCommentId", error.InnerException!.Message);
        }

        await using (var context = scope.NewContext())
        {
            // The row exists when the foreign key is checked, so only the CHECK
            // can refuse it.
            var id = Guid.NewGuid();
            var self = Comment(momentId, id, Carol, "My own parent", 1);
            self.Id = id;
            context.MomentComments.Add(self);
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Contains("CK_MomentComments_NotOwnParent", error.InnerException!.Message);
        }

        await using (var context = scope.NewContext())
        {
            // Nothing cascades: a parent with Replies cannot be hard-deleted
            // out from under them. Comments are tombstoned, never deleted.
            var parent = Comment(momentId, null, Bob, "Parent", 0);
            context.MomentComments.Add(parent);
            context.MomentComments.Add(Comment(momentId, parent.Id, Carol, "Reply", 1));
            await context.SaveChangesAsync();

            var deleted = await Assert.ThrowsAsync<Microsoft.Data.SqlClient.SqlException>(() =>
                context.Database.ExecuteSqlInterpolatedAsync(
                    $"DELETE FROM [MomentComments] WHERE [Id] = {parent.Id}"));
            Assert.Contains("FK_MomentComments_MomentComments_ParentCommentId", deleted.Message);
        }
    }

    [RelationalFact]
    public async Task TheThreadIndexIsFilteredToLiveRowsAndKeyedForEveryThreadRead()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var context = scope.NewContext();

        var columns = await context.Database.SqlQueryRaw<string>(
            """
            SELECT c.[name] AS [Value]
            FROM sys.indexes i
            JOIN sys.index_columns ic ON ic.[object_id] = i.[object_id] AND ic.[index_id] = i.[index_id]
            JOIN sys.columns c ON c.[object_id] = ic.[object_id] AND c.[column_id] = ic.[column_id]
            WHERE i.[name] = N'IX_MomentComments_MomentId_ParentCommentId_CreatedAt_Id'
            ORDER BY ic.[key_ordinal]
            """).ToListAsync();
        Assert.Equal(["MomentId", "ParentCommentId", "CreatedAt", "Id"], columns);

        var filter = await context.Database.SqlQueryRaw<string>(
            "SELECT [filter_definition] AS [Value] FROM sys.indexes WHERE [name] = N'IX_MomentComments_MomentId_ParentCommentId_CreatedAt_Id'")
            .SingleAsync();
        Assert.Equal("([DeletedAt] IS NULL)", filter);

        var replaced = await context.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS [Value] FROM sys.indexes WHERE [name] = N'IX_MomentComments_MomentId_CreatedAt_Id'")
            .SingleAsync();
        Assert.Equal(0, replaced);

        var action = await context.Database.SqlQueryRaw<string>(
            "SELECT [delete_referential_action_desc] AS [Value] FROM sys.foreign_keys WHERE [name] = N'FK_MomentComments_MomentComments_ParentCommentId'")
            .SingleAsync();
        Assert.Equal("NO_ACTION", action);
    }

    // ---- malformed rows ----------------------------------------------------------

    [RelationalFact]
    public async Task MalformedRowsTheSchemaAllowsAreNeverShownCountedOrReportable()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedWorldAsync(scope);
        var otherMomentId = await SeedMomentAsync(scope, 20);

        Guid parent, carolReply, blockedReply;
        Guid[] malformed;
        await using (var seed = scope.NewContext())
        {
            var p = Comment(momentId, null, Bob, "Parent", 0);
            var carol = Comment(momentId, p.Id, Carol, "Carol's reply", 1);
            var blocked = Comment(momentId, p.Id, Erin, "Erin's reply", 2);
            var elsewhere = Comment(otherMomentId, null, Bob, "Elsewhere", 3);
            var gone = Comment(momentId, null, Erin, "", 4);
            gone.DeletedAt = Start;
            gone.DeletedByUserId = Erin;
            var nested = Comment(momentId, carol.Id, Gina, "Reply to a Reply", 5);
            var crossMoment = Comment(momentId, elsewhere.Id, Gina, "Parent on another Moment", 6);
            var orphan = Comment(momentId, gone.Id, Gina, "Parent deleted", 7);
            seed.MomentComments.AddRange(p, carol, blocked, elsewhere, gone, nested, crossMoment, orphan);

            // R3: Bob and Erin, the parent's author and a Reply's author.
            seed.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Erin, BlockedUserId = Bob });
            await seed.SaveChangesAsync();

            (parent, carolReply, blockedReply) = (p.Id, carol.Id, blocked.Id);
            malformed = [nested.Id, crossMoment.Id, orphan.Id];
        }

        await using var context = scope.NewContext();
        var comments = NewCommentService(context);

        foreach (var viewer in new Guid?[] { null, Gina, Alice })
        {
            var page = await comments.GetAsync(momentId, viewer, null, null);
            Assert.Equal([parent], page.Items.Select(item => item.Id));
            Assert.Equal(1, page.Items.Single().ReplyCount);
            Assert.Equal(2, page.CommentCount);

            var replies = await comments.GetRepliesAsync(momentId, parent, viewer, null, null);
            Assert.Equal([carolReply], replies.Items.Select(item => item.Id));
            Assert.Equal(1, replies.ReplyCount);

            foreach (var anchor in malformed.Append(blockedReply))
            {
                var anchored = await comments.GetAsync(momentId, viewer, null, null, default, anchor);
                Assert.Null(anchored.AnchorParentCommentId);
                Assert.Equal(page.Items.Select(item => item.Id), anchored.Items.Select(item => item.Id));
            }
        }

        var other = await comments.GetAsync(otherMomentId, null, null, null);
        Assert.Equal(0, Assert.Single(other.Items).ReplyCount);
        Assert.Equal(1, other.CommentCount);
        await Assert.ThrowsAsync<ApiException>(() => comments.GetRepliesAsync(momentId, carolReply, null, null, null));

        var reports = new CommunityReportService(context);
        foreach (var id in malformed.Append(blockedReply))
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => reports.SubmitAsync(
                Gina, new CreateCommunityReportRequest("comment", id.ToString(), "SpamOrScam", null)));
            Assert.Equal("report_target_unavailable", error.Code);
        }

        await reports.SubmitAsync(Gina, new CreateCommunityReportRequest("comment", carolReply.ToString(), "SpamOrScam", null));
        var report = await context.CommunityReports.AsNoTracking().SingleAsync();
        Assert.Equal((Carol, "Carol's reply"), (report.ReportedUserId, report.SnapshotText));
    }

    // ---- ordering ---------------------------------------------------------------

    [RelationalFact]
    public async Task RepliesPageAndAnchorInSqlServerOrderAcrossTiedTimestamps()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedWorldAsync(scope);
        Guid parentId;

        await using (var seed = scope.NewContext())
        {
            var parent = Comment(momentId, null, Bob, "Parent", 0);
            seed.MomentComments.Add(parent);
            for (var index = 0; index < 30; index += 1)
            {
                // Twelve Replies share one instant, so uniqueidentifier
                // ordering — not .NET Guid ordering — decides between them.
                var reply = Comment(momentId, parent.Id, index % 2 == 0 ? Carol : Erin, $"Reply {index}", 1);
                reply.CreatedAt = index is >= 8 and < 20 ? Start.AddMinutes(10) : Start.AddMinutes(index);
                seed.MomentComments.Add(reply);
            }

            await seed.SaveChangesAsync();
            parentId = parent.Id;
        }

        var order = new List<Guid>();
        string? cursor = null;
        do
        {
            await using var context = scope.NewContext();
            var page = await NewCommentService(context).GetRepliesAsync(momentId, parentId, Gina, cursor, 7);
            order.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        await using (var context = scope.NewContext())
        {
            // SQL Server's own answer is the oracle.
            var expected = await context.MomentComments.AsNoTracking()
                .Where(item => item.ParentCommentId == parentId)
                .OrderBy(item => item.CreatedAt)
                .ThenBy(item => item.Id)
                .Select(item => item.Id)
                .ToListAsync();
            Assert.Equal(expected, order);
        }

        // Every anchor inside the tie, all deeper than the first page.
        for (var depth = 11; depth < 20; depth += 1)
        {
            await using var context = scope.NewContext();
            var service = NewCommentService(context);
            var anchored = await service.GetRepliesAsync(momentId, parentId, Gina, null, null, default, order[depth]);
            Assert.Equal(order.Take(depth + 1), anchored.Items.Select(item => item.Id));
            var rest = await service.GetRepliesAsync(momentId, parentId, Gina, anchored.NextCursor, 30);
            Assert.Equal(order.Skip(depth + 1), rest.Items.Select(item => item.Id));

            // The same link from the thread names the parent.
            Assert.Equal(parentId, (await service.GetAsync(momentId, Gina, null, null, default, order[depth])).AnchorParentCommentId);
        }
    }

    // ---- removal ------------------------------------------------------------------

    [RelationalFact]
    public async Task RemovalTombstonesOneRowAndAParentsRemovalHidesItsThreadWithoutTouchingIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedWorldAsync(scope);
        Guid parentId, carolReply, erinReply;

        await using (var seed = scope.NewContext())
        {
            var parent = Comment(momentId, null, Bob, "Parent", 0);
            var carol = Comment(momentId, parent.Id, Carol, "Carol's reply", 1);
            var erin = Comment(momentId, parent.Id, Erin, "Erin's reply", 2);
            seed.MomentComments.AddRange(parent, carol, erin);
            await seed.SaveChangesAsync();
            (parentId, carolReply, erinReply) = (parent.Id, carol.Id, erin.Id);
        }

        await using (var context = scope.NewContext())
        {
            var deleted = await NewCommentService(context).DeleteAsync(Carol, momentId, carolReply);
            Assert.Equal(2, deleted.CommentCount);
        }

        await using (var context = scope.NewContext())
        {
            var rows = await context.MomentComments.AsNoTracking().ToDictionaryAsync(item => item.Id);
            Assert.Equal(("", Carol), (rows[carolReply].Body, rows[carolReply].DeletedByUserId));
            Assert.Null(rows[parentId].DeletedAt);
            Assert.Null(rows[erinReply].DeletedAt);

            // Alice removes the parent through the same path.
            await NewCommentService(context).DeleteAsync(Alice, momentId, parentId);
        }

        await using (var context = scope.NewContext())
        {
            var comments = NewCommentService(context);
            var page = await comments.GetAsync(momentId, null, null, null);
            Assert.Empty(page.Items);
            Assert.Equal(0, page.CommentCount);
            await Assert.ThrowsAsync<ApiException>(() => comments.GetRepliesAsync(momentId, parentId, null, null, null));

            var erin = await context.MomentComments.AsNoTracking().SingleAsync(item => item.Id == erinReply);
            Assert.Equal("Erin's reply", erin.Body);
            Assert.Null(erin.DeletedAt);
            Assert.Equal(parentId, erin.ParentCommentId);
        }
    }

    // ---- scale -----------------------------------------------------------------------

    /// <summary>
    /// A Moment with 160 top-level Comments and 60 threads of up to 25 Replies,
    /// with every kind of hidden row mixed in: deleted Replies, a deleted
    /// parent with a thread, a Reply author who left Community, a Reply hidden
    /// by R3, and a household the reader blocks. The reader pages through all
    /// of it; every page must be in order, every count must match what the
    /// reader can open, and the round trips per page must not grow.
    /// </summary>
    [RelationalFact]
    public async Task AReplyHeavyMomentPagesCountsAndStaysBounded()
    {
        var capture = new CountingCommands();
        await using var scope = await RelationalDatabase.CreateAsync(capture, enableRetryOnFailure: true);
        var momentId = await SeedWorldAsync(scope);

        var households = Enumerable.Range(0, 20).Select(index => Guid.Parse($"e7{index:D6}-0000-4000-8000-000000000000")).ToArray();
        var leftCommunity = households[3];
        var blockedByParentAuthor = households[4];
        var blockedByReader = households[5];
        var expectedReplies = new Dictionary<Guid, List<Guid>>();
        var expectedTopLevel = new List<Guid>();

        await using (var seed = scope.NewContext())
        {
            var planId = seed.Plans.Single(item => item.Code == "Free").Id;
            foreach (var (id, index) in households.Select((id, index) => (id, index)))
            {
                AddHousehold(seed, id, $"house{index}", planId, social: id != leftCommunity);
            }

            seed.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = households[0], BlockedUserId = blockedByParentAuthor });
            seed.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Gina, BlockedUserId = blockedByReader });

            for (var index = 0; index < 160; index += 1)
            {
                var parentAuthor = households[index % 3];
                var parentDeleted = index == 11;
                var parent = Comment(momentId, null, parentAuthor, parentDeleted ? "" : $"Comment {index}", index * 60);
                if (parentDeleted)
                {
                    parent.DeletedAt = Start;
                    parent.DeletedByUserId = parentAuthor;
                }

                seed.MomentComments.Add(parent);
                if (!parentDeleted)
                {
                    expectedTopLevel.Add(parent.Id);
                }

                if (index % 8 != 3 && index != 11)
                {
                    continue;
                }

                var visible = new List<Guid>();
                var count = 1 + index % 25;
                for (var reply = 0; reply < count; reply += 1)
                {
                    var author = households[3 + reply % 17];
                    var deleted = reply % 7 == 6;
                    var row = Comment(momentId, parent.Id, author, deleted ? "" : $"Reply {index}.{reply}", index * 60 + reply / 2);
                    if (deleted)
                    {
                        row.DeletedAt = Start;
                        row.DeletedByUserId = author;
                    }

                    seed.MomentComments.Add(row);

                    var hidden = deleted
                        || parentDeleted
                        || author == leftCommunity
                        || author == blockedByReader
                        || (author == blockedByParentAuthor && parentAuthor == households[0]);
                    if (!hidden)
                    {
                        visible.Add(row.Id);
                    }
                }

                expectedReplies[parent.Id] = visible;
            }

            await seed.SaveChangesAsync();
        }

        // The expected orders, as SQL Server orders them.
        await using (var oracle = scope.NewContext())
        {
            var topLevel = expectedTopLevel.ToHashSet();
            expectedTopLevel = (await oracle.MomentComments.AsNoTracking()
                    .Where(item => item.MomentId == momentId && item.ParentCommentId == null)
                    .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
                    .Select(item => item.Id)
                    .ToListAsync())
                .Where(topLevel.Contains)
                .ToList();

            foreach (var parentId in expectedReplies.Keys.ToArray())
            {
                var visible = expectedReplies[parentId].ToHashSet();
                expectedReplies[parentId] = (await oracle.MomentComments.AsNoTracking()
                        .Where(item => item.ParentCommentId == parentId)
                        .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id)
                        .Select(item => item.Id)
                        .ToListAsync())
                    .Where(visible.Contains)
                    .ToList();
            }
        }

        var expectedTotal = expectedTopLevel.Count
            + expectedReplies.Where(pair => expectedTopLevel.Contains(pair.Key)).Sum(pair => pair.Value.Count);

        await using var context = scope.NewContext();
        var comments = NewCommentService(context);
        await comments.GetAsync(momentId, Gina, null, null); // compile and warm

        var seen = new List<MomentCommentResponse>();
        var tripsPerPage = new List<int>();
        var timer = Stopwatch.StartNew();
        string? cursor = null;
        do
        {
            capture.Reset();
            var page = await comments.GetAsync(momentId, Gina, cursor, null);
            tripsPerPage.Add(capture.Count);
            Assert.Equal(expectedTotal, page.CommentCount);
            seen.AddRange(page.Items);
            cursor = page.NextCursor;
        }
        while (cursor is not null);
        var threadMs = timer.ElapsedMilliseconds;

        Assert.Equal(expectedTopLevel, seen.Select(item => item.Id));
        Assert.Single(tripsPerPage.Distinct());

        var replyTrips = new List<int>();
        timer.Restart();
        foreach (var parent in seen)
        {
            var expected = expectedReplies.GetValueOrDefault(parent.Id) ?? [];
            Assert.Equal(expected.Count, parent.ReplyCount);
            if (parent.ReplyCount == 0)
            {
                continue;
            }

            var replies = new List<Guid>();
            string? replyCursor = null;
            do
            {
                capture.Reset();
                var page = await comments.GetRepliesAsync(momentId, parent.Id, Gina, replyCursor, null);
                replyTrips.Add(capture.Count);
                Assert.Equal(expected.Count, page.ReplyCount);
                replies.AddRange(page.Items.Select(item => item.Id));
                replyCursor = page.NextCursor;
            }
            while (replyCursor is not null);

            Assert.Equal(expected, replies);
        }

        _output.WriteLine(
            $"thread: {tripsPerPage.Count} pages in {threadMs} ms, {tripsPerPage[0]} round trips each; "
            + $"replies: {replyTrips.Count} pages in {timer.ElapsedMilliseconds} ms, {replyTrips.Distinct().Single()} round trips each; "
            + $"{expectedTotal} readable Comments and Replies in {expectedTopLevel.Count} readable threads");
    }

    // ---- world --------------------------------------------------------------------

    private static MomentComment Comment(Guid momentId, Guid? parentId, Guid authorId, string body, int minutes) => new()
    {
        MomentId = momentId,
        ParentCommentId = parentId,
        AuthorUserId = authorId,
        Body = body,
        CreatedAt = Start.AddMinutes(minutes)
    };

    private static MomentCommentService NewCommentService(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }

    /// <summary>The households above, Alice's pet, and one public Moment of it.</summary>
    private static async Task<Guid> SeedWorldAsync(RelationalScope scope)
    {
        await using (var seed = scope.NewContext())
        {
            var planId = seed.Plans.Single(item => item.Code == "Free").Id;
            AddHousehold(seed, Alice, "alicefamily", planId);
            AddHousehold(seed, Bob, "bobfamily", planId);
            AddHousehold(seed, Carol, "carolfamily", planId);
            AddHousehold(seed, Erin, "erinfamily", planId);
            AddHousehold(seed, Gina, "ginafamily", planId);
            seed.Pets.Add(new Pet
            {
                Id = MochiId,
                OwnerUserId = Alice,
                Slug = "mochi-e6111111",
                Name = "Mochi",
                Species = "Cat"
            });
            await seed.SaveChangesAsync();
        }

        return await SeedMomentAsync(scope, 10);
    }

    private static async Task<Guid> SeedMomentAsync(RelationalScope scope, int minutes)
    {
        await using var seed = scope.NewContext();
        var moment = new PetMemory
        {
            PetId = MochiId,
            AuthorUserId = Alice,
            Title = "Beach day",
            Type = "Memory",
            Visibility = MemoryVisibility.Public,
            PublishedAt = Start.AddMinutes(minutes)
        };
        seed.PetMemories.Add(moment);
        await seed.SaveChangesAsync();
        return moment.Id;
    }

    private static void AddHousehold(MyPetLinkDbContext context, Guid id, string handle, Guid planId, bool social = true)
    {
        context.Users.Add(new User
        {
            Id = id,
            Email = $"{handle}@example.com",
            NormalizedEmail = $"{handle}@example.com".ToUpperInvariant(),
            DisplayName = handle,
            Status = UserStatus.Active,
            OwnerProfile = new OwnerProfile { UserId = id, OwnerDisplayName = handle, PlanId = planId },
            SocialProfile = new OwnerSocialProfile
            {
                UserId = id,
                Handle = handle,
                NormalizedHandle = handle,
                DisplayName = $"The {handle}",
                NormalizedDisplayName = $"the {handle}",
                IsSocialEnabled = social,
                AllowFollowers = true
            }
        });
    }

    /// <summary>Counts the queries EF sends.</summary>
    private sealed class CountingCommands : DbCommandInterceptor
    {
        private int _count;

        public int Count => _count;

        public void Reset() => Interlocked.Exchange(ref _count, 0);

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _count);
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }
}
