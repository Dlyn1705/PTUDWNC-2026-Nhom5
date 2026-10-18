using System.Buffers.Binary;
using System.Security.Cryptography;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CulinaryBlog.Infrastructure.Services.Images;

/// <summary>Session advisory lock, shared by resize, cleanup and hard delete. No long DB transaction.</summary>
public sealed class ImageWorkLock(ApplicationDbContext db)
{
    public Task<IAsyncDisposable?> TryAcquireAsync(Guid imageId, CancellationToken ct) => TryAcquireManyAsync([imageId], ct);

    public async Task<IAsyncDisposable?> TryAcquireManyAsync(IEnumerable<Guid> imageIds, CancellationToken ct)
    {
        var connection = new NpgsqlConnection(db.Database.GetConnectionString());
        try
        {
            await connection.OpenAsync(ct);
            foreach (var imageId in imageIds.Distinct().Order())
            {
                var key = BinaryPrimitives.ReadInt64LittleEndian(SHA256.HashData(imageId.ToByteArray()));
                await using var command = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
                command.Parameters.AddWithValue("key", key);
                if (!(bool)(await command.ExecuteScalarAsync(ct))!) { await new Handle(connection).DisposeAsync(); return null; }
            }
            return new Handle(connection);
        }
        catch { await connection.DisposeAsync(); throw; }
    }

    private sealed class Handle(NpgsqlConnection connection) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                await using var unlock = new NpgsqlCommand("SELECT pg_advisory_unlock_all()", connection);
                await unlock.ExecuteScalarAsync();
            }
            finally { await connection.DisposeAsync(); }
        }
    }
}
