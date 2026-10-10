using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Data;

// Used only by `dotnet ef`. The connection string comes from env (owner role); never committed.
public class DesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("DBP_OWNER_CONN")
                 ?? "Host=127.0.0.1;Port=5433;Database=dbp;Username=dbp_owner";
        return new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(cs).Options);
    }
}
