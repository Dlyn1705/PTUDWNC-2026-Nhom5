using Npgsql;

namespace CulinaryBlog.Testing;

public sealed class PostgresTestDatabase : IAsyncDisposable
{
    private readonly string adminConnectionString;
    private int disposed;

    private PostgresTestDatabase(string adminConnectionString, string name)
    {
        this.adminConnectionString = adminConnectionString;
        Name = name;
        ConnectionString = new NpgsqlConnectionStringBuilder(adminConnectionString) { Database = name }.ConnectionString;
    }

    public string Name { get; }

    public string ConnectionString { get; }

    public static async Task<PostgresTestDatabase> CreateAsync(string configuredConnectionString, string prefix)
    {
        var admin = new NpgsqlConnectionStringBuilder(configuredConnectionString) { Database = "postgres" };
        var name = prefix + Guid.NewGuid().ToString("N");
        var database = new PostgresTestDatabase(admin.ConnectionString, name);

        await using var connection = new NpgsqlConnection(database.adminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE {QuoteIdentifier(name)}", connection);
        await command.ExecuteNonQueryAsync();
        return database;
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;

        await using var connection = new NpgsqlConnection(adminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(
            $"DROP DATABASE IF EXISTS {QuoteIdentifier(Name)} WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }

    private static string QuoteIdentifier(string value) => $"\"{value.Replace("\"", "\"\"")}\"";
}
