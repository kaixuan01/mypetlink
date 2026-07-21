namespace MyPetLink.Api.Tests.Relational;

// A [Fact] that only runs when a SQL Server (LocalDB or MYPETLINK_TEST_SQLSERVER)
// is reachable. Everywhere else it is reported as skipped, never failed, so the
// InMemory suite stays green on machines and CI without SQL Server.
public sealed class RelationalFactAttribute : FactAttribute
{
    public RelationalFactAttribute()
    {
        if (!RelationalDatabase.IsAvailable)
        {
            Skip = "SQL Server (LocalDB or MYPETLINK_TEST_SQLSERVER) is not available; relational concurrency tests skipped.";
        }
    }
}
