namespace CulinaryBlog.Infrastructure.Services;

public sealed class PublicCacheOptions
{
    public int CategoryMinutes { get; set; } = 45;
    public int DetailMinutes { get; set; } = 60;
    public int ListMinutes { get; set; } = 3;
    public int SearchMinutes { get; set; } = 3;
}
