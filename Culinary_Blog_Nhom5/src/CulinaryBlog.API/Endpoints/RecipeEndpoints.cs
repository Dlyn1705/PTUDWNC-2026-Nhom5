using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Authorization;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using CulinaryBlog.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace CulinaryBlog.API.Endpoints;

public static class RecipeEndpoints
{
    public static IEndpointRouteBuilder MapRecipeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/recipes")
            .WithTags("Recipes");

        // FR-RCP-001: Xem Danh sách Công thức (Paginated + Filtered)
        group.MapGet("/", async (
            int? page,
            int? pageSize,
            Guid? categoryId,
            string? sortBy,
            IRecipeRepository recipeRepo,
            CancellationToken ct) =>
        {
            var p = Math.Max(1, page.GetValueOrDefault(1));
            var ps = Math.Clamp(pageSize.GetValueOrDefault(12), 1, 50);
            var (items, totalCount) = await recipeRepo.GetPagedAsync(
                p,
                ps,
                categoryId: categoryId,
                sortBy: sortBy,
                ct: ct);

            return Results.Ok(new { items, totalCount, page = p, pageSize = ps });
        })
        .WithName("GetRecipes")
        .WithSummary("Lấy danh sách công thức đã xuất bản kèm phân trang và lọc")
        .Produces(StatusCodes.Status200OK);

        group.MapGet("/mine", async (
            int? page,
            int? pageSize,
            string? sortBy,
            IRecipeRepository recipeRepo,
            ICurrentUserService currentUser,
            CancellationToken ct) =>
        {
            int p = Math.Max(1, page.GetValueOrDefault(1));
            int ps = Math.Clamp(pageSize.GetValueOrDefault(12), 1, 50);
            var (items, totalCount) = await recipeRepo.GetPagedAsync(
                p,
                ps,
                sortBy: sortBy,
                authorId: currentUser.IsAdmin ? null : currentUser.UserId,
                includeDrafts: true,
                ct: ct);

            return Results.Ok(new { items, totalCount, page = p, pageSize = ps });
        })
        .WithName("GetManagedRecipes")
        .WithSummary("Lấy danh sách công thức của tác giả hoặc toàn bộ công thức cho Admin")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden);

        // FR-RCP-006: Lưu trữ công thức
        group.MapPost("/{id:guid}/archive", async (
            Guid id,
            IRecipeRepository recipeRepo,
            HttpContext context,
            IAuthorizationService authorizationService,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            await AuthorizeRecipeMutationAsync(
                authorizationService, context.User, recipe, RecipeOperations.Update,
                "Bạn chỉ được lưu trữ công thức do chính mình tạo.");

            recipe.Archive();
            await unitOfWork.SaveChangesAsync(ct);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt, recipe.UpdatedAt });
        })
        .WithName("ArchiveRecipe")
        .WithSummary("Lưu trữ công thức, giữ nguyên dữ liệu và ẩn khỏi danh sách công khai")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // FR-RCP-005: Xuất bản công thức
        group.MapPost("/{id:guid}/publish", async (
            Guid id,
            IRecipeRepository recipeRepo,
            HttpContext context,
            IAuthorizationService authorizationService,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            await AuthorizeRecipeMutationAsync(
                authorizationService, context.User, recipe, RecipeOperations.Update,
                "Bạn chỉ được xuất bản công thức do chính mình tạo.");

            if (recipe.Status == RecipeStatus.Published)
                return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });

            if (recipe.Status == RecipeStatus.Archived)
                throw new ConflictException("Không thể xuất bản công thức đang lưu trữ. Hãy khôi phục về bản nháp trước.");

            try
            {
                recipe.Publish();
            }
            catch (DomainException ex)
            {
                throw new ValidationException("Steps", ex.Message);
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("PublishRecipe")
        .WithSummary("Xuất bản công thức (yêu cầu ít nhất một bước thực hiện)")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict)
        .Produces<ProblemDetails>(StatusCodes.Status422UnprocessableEntity);

        group.MapPost("/{id:guid}/unpublish", async (
            Guid id,
            IRecipeRepository recipeRepo,
            HttpContext context,
            IAuthorizationService authorizationService,
            ApplicationDbContext db,
            CancellationToken ct) =>
        {
            var recipe = await recipeRepo.GetDetailsByIdAsync(id, ct);
            if (recipe is null || recipe.IsDeleted)
                throw new NotFoundException("Recipe", id);

            await AuthorizeRecipeMutationAsync(
                authorizationService, context.User, recipe, RecipeOperations.Update,
                "Bạn chỉ được hủy xuất bản công thức do chính mình tạo.");

            if (recipe.Status == RecipeStatus.Draft)
                return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });

            if (recipe.Status == RecipeStatus.Archived)
                throw new ConflictException("Không thể hủy xuất bản công thức đang lưu trữ.");

            recipe.Unpublish();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { recipe.Id, recipe.Status, recipe.PublishedAt });
        })
        .WithName("UnpublishRecipe")
        .WithSummary("Hủy xuất bản công thức và chuyển về bản nháp")
        .RequireAuthorization("AuthorPolicy")
        .Produces(StatusCodes.Status200OK)
        .Produces<ProblemDetails>(StatusCodes.Status401Unauthorized)
        .Produces<ProblemDetails>(StatusCodes.Status403Forbidden)
        .Produces<ProblemDetails>(StatusCodes.Status404NotFound)
        .Produces<ProblemDetails>(StatusCodes.Status409Conflict);

        // ============================================================
        // POST - FR-RCP-003: Tạo công thức mới (từ Bảo Trâm)
        // ============================================================
        group.MapPost("/", async (
            CreateRecipeRequest request,
            HttpContext httpContext,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var authorId = httpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);

            if (string.IsNullOrWhiteSpace(authorId))
            {
                throw new UnauthorizedAccessException("Không xác định được người dùng đăng nhập.");
            }

            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException("Title", "Tên công thức không được để trống.");
            }

            if (request.Title.Trim().Length < 3)
            {
                throw new ValidationException("Title", "Tên công thức phải có ít nhất 3 ký tự.");
            }

            if (request.Servings <= 0)
            {
                throw new ValidationException("Servings", "Số khẩu phần phải lớn hơn 0.");
            }

            if (request.PrepTime < 0)
            {
                throw new ValidationException("PrepTime", "Thời gian chuẩn bị không được âm.");
            }

            if (request.CookTime < 0)
            {
                throw new ValidationException("CookTime", "Thời gian nấu không được âm.");
            }

            var category = await unitOfWork.Categories.GetByIdAsync(request.CategoryId, ct);
            if (category is null)
            {
                throw new NotFoundException("Category", request.CategoryId);
            }

            var slug = GenerateSlug(request.Title);
            if (await unitOfWork.Recipes.ExistsBySlugAsync(slug, ct))
            {
                slug = $"{slug}-{DateTime.UtcNow:yyyyMMddHHmmss}";
            }

            var recipe = Recipe.Create(
                request.Title.Trim(),
                slug,
                request.Description?.Trim() ?? string.Empty,
                request.Instructions?.Trim() ?? string.Empty,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId,
                authorId);

            await unitOfWork.Recipes.AddAsync(recipe, ct);
            await unitOfWork.SaveChangesAsync(ct);

            return Results.Created(
                $"/api/v1/recipes/{recipe.Slug}",
                new
                {
                    message = "Tạo công thức thành công.",
                    id = recipe.Id,
                    slug = recipe.Slug
                });
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("CreateRecipe")
        .WithSummary("Tạo công thức mới - Author/Admin")
        .Produces(StatusCodes.Status201Created)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden);

        // ============================================================
        // PUT - FR-RCP-004: Cập nhật công thức (từ Bảo Trâm)
        // ============================================================
        group.MapPut("/{id:guid}", async (
            Guid id,
            UpdateRecipeRequest request,
            HttpContext httpContext,
            IAuthorizationService authorizationService,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(id, ct);
            if (recipe is null)
            {
                throw new NotFoundException("Recipe", id);
            }

            await AuthorizeRecipeMutationAsync(
                authorizationService, httpContext.User, recipe, RecipeOperations.Update,
                "Bạn chỉ được cập nhật công thức do chính mình tạo.");

            if (string.IsNullOrWhiteSpace(request.Title))
            {
                throw new ValidationException("Title", "Tên công thức không được để trống.");
            }

            if (request.Title.Trim().Length < 3)
            {
                throw new ValidationException("Title", "Tên công thức phải có ít nhất 3 ký tự.");
            }

            if (request.Servings <= 0)
            {
                throw new ValidationException("Servings", "Số khẩu phần phải lớn hơn 0.");
            }

            if (request.PrepTime < 0)
            {
                throw new ValidationException("PrepTime", "Thời gian chuẩn bị không được âm.");
            }

            if (request.CookTime < 0)
            {
                throw new ValidationException("CookTime", "Thời gian nấu không được âm.");
            }

            var category = await unitOfWork.Categories.GetByIdAsync(request.CategoryId, ct);
            if (category is null)
            {
                throw new NotFoundException("Category", request.CategoryId);
            }

            recipe.Update(
                request.Title.Trim(),
                request.Description?.Trim() ?? string.Empty,
                request.Instructions?.Trim() ?? string.Empty,
                request.PrepTime,
                request.CookTime,
                request.Servings,
                request.Difficulty,
                request.CategoryId);

            unitOfWork.Recipes.Update(recipe);
            await unitOfWork.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                message = "Cập nhật công thức thành công.",
                id = recipe.Id,
                slug = recipe.Slug
            });
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("UpdateRecipe")
        .WithSummary("Cập nhật công thức - Author/Admin")
        .Produces(StatusCodes.Status200OK)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/{id:guid}", async (
            Guid id,
            HttpContext httpContext,
            IAuthorizationService authorizationService,
            IUnitOfWork unitOfWork,
            CancellationToken ct) =>
        {
            var recipe = await unitOfWork.Recipes.GetDetailsByIdAsync(id, ct);
            if (recipe is null)
            {
                throw new NotFoundException("Recipe", id);
            }

            await AuthorizeRecipeMutationAsync(
                authorizationService, httpContext.User, recipe, RecipeOperations.Delete,
                "Bạn chỉ được xóa công thức do chính mình tạo.");

            unitOfWork.Recipes.Delete(recipe);
            await unitOfWork.SaveChangesAsync(ct);
            return Results.NoContent();
        })
        .RequireAuthorization("AuthorPolicy")
        .WithName("DeleteRecipe")
        .WithSummary("Xóa mềm công thức do tác giả sở hữu")
        .Produces(StatusCodes.Status204NoContent)
        .ProducesProblem(StatusCodes.Status401Unauthorized)
        .ProducesProblem(StatusCodes.Status403Forbidden)
        .ProducesProblem(StatusCodes.Status404NotFound);

        return app;
    }

    private static async Task AuthorizeRecipeMutationAsync(
        IAuthorizationService authorizationService,
        ClaimsPrincipal user,
        Recipe recipe,
        OperationAuthorizationRequirement operation,
        string errorMessage)
    {
        var result = await authorizationService.AuthorizeAsync(user, recipe, operation);
        if (!result.Succeeded)
        {
            throw new ForbiddenException(errorMessage);
        }
    }

    private static string GenerateSlug(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return $"recipe-{Guid.NewGuid():N}";

        var normalized = text.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var result = new System.Text.StringBuilder();

        foreach (var c in normalized)
        {
            var category = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (category == System.Globalization.UnicodeCategory.NonSpacingMark)
                continue;

            if (char.IsLetterOrDigit(c))
                result.Append(c);
            else
                result.Append('-');
        }

        var slug = result.ToString();
        while (slug.Contains("--"))
        {
            slug = slug.Replace("--", "-");
        }

        return slug.Trim('-');
    }
}

public sealed record CreateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId);

public sealed record UpdateRecipeRequest(
    string Title,
    string? Description,
    string? Instructions,
    int PrepTime,
    int CookTime,
    int Servings,
    RecipeDifficulty Difficulty,
    Guid CategoryId);
