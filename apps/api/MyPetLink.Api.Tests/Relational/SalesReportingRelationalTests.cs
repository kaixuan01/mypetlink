using Microsoft.AspNetCore.Http;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests.Relational;

public sealed class SalesReportingRelationalTests
{
    [RelationalFact]
    public async Task ReportingQueries_TranslateAgainstSqlServer()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var seller = new Salesperson
        {
            SalespersonCode = "SQL-REPORT", Name = "SQL report seller",
            DefaultCommissionPercentage = 0m, IsActive = true
        };
        var adminUser = new User
        {
            Email = "sql-report-admin@example.test", NormalizedEmail = "SQL-REPORT-ADMIN@EXAMPLE.TEST",
            DisplayName = "SQL report admin", Status = UserStatus.Active
        };
        db.AddRange(seller, adminUser);
        db.AdminUsers.Add(new AdminUser { UserId = adminUser.Id, User = adminUser, Role = AdminRole.SuperAdmin, IsActive = true });
        await db.SaveChangesAsync();

        var service = new SalesReportingService(
            db, new AuditLogService(db, new HttpContextAccessor()), TimeProvider.System);
        var query = new SalesReportQuery
        {
            From = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
            ToExclusive = new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero)
        };

        var performance = await service.GetPerformanceAsync(query, default);
        var financial = await service.GetFinancialAsync(query, default);
        var sellerPerformance = await service.GetSalespersonPerformanceAsync(seller.Id, query, default);
        var sellerFinancial = await service.GetSalespersonFinancialAsync(seller.Id, query, default);
        var (portfolio, total) = await service.ListPortfolioAsync(seller.Id, new(), default);
        var (portfolioFinancial, financialTotal) = await service.ListPortfolioFinancialAsync(seller.Id, new(), default);
        var export = await service.ExportCommissionLedgerAsync(adminUser.Id, new CommissionLedgerQuery
        {
            From = query.From, ToExclusive = query.ToExclusive, Page = 1, PageSize = 50
        }, default);

        Assert.Equal(0, performance.Retail.AttributedPaidOrders);
        Assert.Equal(0m, financial.Accounting.GrossGenerated);
        Assert.Equal(0m, sellerPerformance.LifetimeWholesaleRevenue);
        Assert.Equal(0m, sellerFinancial.Accounting.CurrentValid);
        Assert.Empty(portfolio);
        Assert.Equal(0, total);
        Assert.Empty(portfolioFinancial);
        Assert.Equal(0, financialTotal);
        Assert.NotEmpty(export.Content);
    }
}
