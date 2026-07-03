using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MyPetLink.Api.Data;

public sealed class MyPetLinkDbContextFactory : IDesignTimeDbContextFactory<MyPetLinkDbContext>
{
    public MyPetLinkDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
            .UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=MyPetLinkDev;Trusted_Connection=True;TrustServerCertificate=True;")
            .Options;

        return new MyPetLinkDbContext(options);
    }
}
