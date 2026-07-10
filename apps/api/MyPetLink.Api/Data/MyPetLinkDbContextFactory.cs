using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MyPetLink.Api.Data;

public sealed class MyPetLinkDbContextFactory : IDesignTimeDbContextFactory<MyPetLinkDbContext>
{
    public MyPetLinkDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__MyPetLinkDb");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;";
        }

        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new MyPetLinkDbContext(options);
    }
}
