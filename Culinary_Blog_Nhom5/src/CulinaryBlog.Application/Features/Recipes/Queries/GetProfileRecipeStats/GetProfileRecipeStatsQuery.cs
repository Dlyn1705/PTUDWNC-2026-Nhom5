using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Interfaces;
using MediatR;

namespace CulinaryBlog.Application.Features.Recipes.Queries.GetProfileRecipeStats;

public sealed record ProfileRecipeStats(int Created, int Published);
public sealed record GetProfileRecipeStatsQuery : IRequest<ProfileRecipeStats>;

public sealed class GetProfileRecipeStatsQueryHandler(
    IRecipeRepository recipes,
    ICurrentUserService currentUser) : IRequestHandler<GetProfileRecipeStatsQuery, ProfileRecipeStats>
{
    public async Task<ProfileRecipeStats> Handle(
        GetProfileRecipeStatsQuery request,
        CancellationToken cancellationToken)
    {
        if (!currentUser.IsAuthenticated || string.IsNullOrWhiteSpace(currentUser.UserId))
            throw new UnauthorizedAccessException("Authentication required.");

        var (_, created) = await recipes.GetPagedAsync(
            1, 1, authorId: currentUser.UserId, includeDrafts: true, ct: cancellationToken);
        var (_, published) = await recipes.GetPagedAsync(
            1, 1, authorId: currentUser.UserId, includeDrafts: true,
            status: RecipeStatus.Published, ct: cancellationToken);
        return new ProfileRecipeStats(created, published);
    }
}
