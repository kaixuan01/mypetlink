using System.Data.Common;
using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using Xunit.Abstractions;

namespace MyPetLink.Api.Tests.Relational;

public sealed class AdminSmartTagQueryPerformanceRelationalTests(
    ITestOutputHelper output)
{
    [RelationalFact]
    public async Task Listing_PagesBeforeReturningSourceSummaries_UsingTwoQueries()
    {
        var interceptor = new CountingCommandInterceptor();
        await using var scope = await RelationalDatabase.CreateAsync(interceptor);

        await using (var arrange = scope.NewContext())
        {
            var tags = Enumerable.Range(1, 100)
                .Select(index => new SmartTag
                {
                    TagCode = $"MPL-PERF-{index:0000}",
                    Status = SmartTagStatus.Active,
                    HasNfc = index % 2 == 0,
                    Variant = "Standard",
                    CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-index),
                    UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-index)
                })
                .ToArray();
            arrange.SmartTags.AddRange(tags);
            arrange.TagScans.AddRange(tags.SelectMany(tag =>
                Enumerable.Range(0, 10).Select(scan => new TagScan
                {
                    SmartTag = tag,
                    SmartTagId = tag.Id,
                    TagCode = tag.TagCode,
                    Source = scan % 2 == 0
                        ? TagScanSource.Qr
                        : TagScanSource.Nfc,
                    ResolvedState = TagScanResolvedState.Active,
                    ScanTime = DateTimeOffset.UtcNow.AddSeconds(-scan)
                })));
            await arrange.SaveChangesAsync();
        }

        interceptor.Reset();
        await using var verify = scope.NewContext();
        var service = new AdminSmartTagService(
            verify,
            new AuditLogService(verify, new HttpContextAccessor()));
        var timer = Stopwatch.StartNew();

        var (items, total) = await service.ListAsync(
            new AdminSmartTagQuery
            {
                Page = 2,
                PageSize = 25,
                SortBy = "updatedAt",
                SortDir = "desc"
            });

        timer.Stop();
        output.WriteLine(
            "Admin Smart Tag list: {0} SQL reader queries, {1} ms locally.",
            interceptor.ReaderCommandCount,
            timer.ElapsedMilliseconds);

        Assert.Equal(100, total);
        Assert.Equal(25, items.Count);
        Assert.Equal(2, interceptor.ReaderCommandCount);
        var listSql = interceptor.CommandTexts
            .Single(command => command.Contains("OFFSET", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("FETCH NEXT", listSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("TagScans", listSql, StringComparison.OrdinalIgnoreCase);

        var indexCount = await verify.Database.SqlQueryRaw<int>(
                """
                SELECT COUNT(*) AS [Value]
                FROM sys.indexes
                WHERE [name] = N'IX_TagScans_SmartTagId_Source_ScanTime'
                  AND [object_id] = OBJECT_ID(N'[TagScans]')
                """)
            .SingleAsync();
        Assert.Equal(1, indexCount);
    }

    private sealed class CountingCommandInterceptor : DbCommandInterceptor
    {
        public int ReaderCommandCount { get; private set; }
        public List<string> CommandTexts { get; } = [];

        public void Reset()
        {
            ReaderCommandCount = 0;
            CommandTexts.Clear();
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            Record(command);
            return result;
        }

        public override ValueTask<InterceptionResult<DbDataReader>>
            ReaderExecutingAsync(
                DbCommand command,
                CommandEventData eventData,
                InterceptionResult<DbDataReader> result,
                CancellationToken cancellationToken = default)
        {
            Record(command);
            return ValueTask.FromResult(result);
        }

        private void Record(DbCommand command)
        {
            ReaderCommandCount += 1;
            CommandTexts.Add(command.CommandText);
        }
    }
}
