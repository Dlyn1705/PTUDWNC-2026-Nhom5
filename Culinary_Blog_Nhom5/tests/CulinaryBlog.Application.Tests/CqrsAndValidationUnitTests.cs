using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using CulinaryBlog.Application.Common.Models;
using CulinaryBlog.Application.Contracts;
using CulinaryBlog.Application.DTOs;
using CulinaryBlog.Application.Features.Auth.Commands.ChangePassword;
using CulinaryBlog.Application.Features.Auth.Commands.ForgotPassword;
using CulinaryBlog.Application.Features.Auth.Commands.ResetPassword;
using CulinaryBlog.Application.Features.Auth.Commands.UpdateProfile;
using CulinaryBlog.Application.Features.Auth.Queries.GetCurrentUser;
using CulinaryBlog.Application.Features.Recipes.Commands.DeleteRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Commands.SetRecipeImagePrimary;
using CulinaryBlog.Application.Features.Recipes.Commands.UploadRecipeImage;
using CulinaryBlog.Application.Features.Recipes.Queries.GetManagedRecipes;
using CulinaryBlog.Application.Features.Recipes.Queries.GetProfileRecipeStats;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeById;
using CulinaryBlog.Application.Features.Recipes.Queries.GetRecipeImages;
using CulinaryBlog.Application.Features.Recipes.Queries.ResolveRecipeSlug;
using CulinaryBlog.Domain.Entities;
using CulinaryBlog.Domain.Enums;
using CulinaryBlog.Domain.Exceptions;
using CulinaryBlog.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace CulinaryBlog.Application.Tests;

public sealed class CqrsAndValidationUnitTests
{
    [Fact]
    public async Task ForgotPassword_validates_and_dispatches()
    {
        var auth = Substitute.For<IAuthService>();
        var handler = new ForgotPasswordCommandHandler(auth);
        var validator = new ForgotPasswordCommandValidator();

        Assert.True(validator.Validate(new ForgotPasswordCommand("chef@example.com")).IsValid);
        Assert.False(validator.Validate(new ForgotPasswordCommand("")).IsValid);
        Assert.False(validator.Validate(new ForgotPasswordCommand("invalid-email")).IsValid);
        Assert.False(validator.Validate(new ForgotPasswordCommand(new string('a', 250) + "@test.com")).IsValid);

        await handler.Handle(new ForgotPasswordCommand("chef@example.com"), CancellationToken.None);
        await auth.Received(1).RequestPasswordResetAsync("chef@example.com", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ResetPassword_validates_and_dispatches()
    {
        var auth = Substitute.For<IAuthService>();
        var handler = new ResetPasswordCommandHandler(auth);
        var validator = new ResetPasswordCommandValidator();

        var valid = new ResetPasswordCommand("chef@example.com", "token123", "NewPassword1!");
        Assert.True(validator.Validate(valid).IsValid);
        Assert.False(validator.Validate(valid with { Email = "" }).IsValid);
        Assert.False(validator.Validate(valid with { Token = "" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "" }).IsValid);

        await handler.Handle(valid, CancellationToken.None);
        await auth.Received(1).ResetPasswordAsync("chef@example.com", "token123", "NewPassword1!", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ChangePassword_validates_and_dispatches()
    {
        var auth = Substitute.For<IAuthService>();
        var handler = new ChangePasswordCommandHandler(auth);
        var validator = new ChangePasswordCommandValidator();

        var valid = new ChangePasswordCommand("user-1", "OldPass1!", "NewPass1!");
        Assert.True(validator.Validate(valid).IsValid);
        Assert.False(validator.Validate(valid with { UserId = "" }).IsValid);
        Assert.False(validator.Validate(valid with { CurrentPassword = "" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "short" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "nouppercase1!" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "NOLOWERCASE1!" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "NoDigits!!!" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "NoSpecial123" }).IsValid);
        Assert.False(validator.Validate(valid with { NewPassword = "OldPass1!" }).IsValid);

        await handler.Handle(valid, CancellationToken.None);
        await auth.Received(1).ChangePasswordAsync("user-1", "OldPass1!", "NewPass1!", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task UpdateCurrentUserProfile_validates_and_dispatches()
    {
        var auth = Substitute.For<IAuthService>();
        var handler = new UpdateCurrentUserProfileCommandHandler(auth);
        var validator = new UpdateCurrentUserProfileCommandValidator();

        var valid = new UpdateCurrentUserProfileCommand("user-1", "New Name", "New Bio", "https://example.com/avatar.jpg");
        Assert.True(validator.Validate(valid).IsValid);
        Assert.False(validator.Validate(new UpdateCurrentUserProfileCommand("user-1", null, null, null)).IsValid);
        Assert.False(validator.Validate(valid with { UserId = "" }).IsValid);
        Assert.False(validator.Validate(valid with { DisplayName = "a" }).IsValid);
        Assert.False(validator.Validate(valid with { DisplayName = new string('x', 101) }).IsValid);
        Assert.False(validator.Validate(valid with { Bio = new string('x', 1001) }).IsValid);
        Assert.False(validator.Validate(valid with { AvatarUrl = "javascript:alert(1)" }).IsValid);

        auth.UpdateCurrentUserAsync("user-1", Arg.Any<UpdateProfileDto>(), Arg.Any<CancellationToken>())
            .Returns(new CurrentUserDto("user-1", "chef@example.com", "New Name", "https://example.com/avatar.jpg", "New Bio", ["Author"], true, DateTime.UtcNow));

        var result = await handler.Handle(valid, CancellationToken.None);
        Assert.Equal("New Name", result.DisplayName);
    }

    [Fact]
    public async Task GetCurrentUser_dispatches_to_authService()
    {
        var auth = Substitute.For<IAuthService>();
        var handler = new GetCurrentUserQueryHandler(auth);
        auth.GetCurrentUserAsync("user-1", Arg.Any<CancellationToken>())
            .Returns(new CurrentUserDto("user-1", "chef@example.com", "Chef", null, null, ["Author"], true, DateTime.UtcNow));

        var result = await handler.Handle(new GetCurrentUserQuery("user-1"), CancellationToken.None);
        Assert.Equal("user-1", result.Id);
    }

    [Fact]
    public async Task ProfileRecipeStats_handles_auth_and_unauth()
    {
        var recipes = Substitute.For<IRecipeRepository>();
        var user = Substitute.For<ICurrentUserService>();
        var handler = new GetProfileRecipeStatsQueryHandler(recipes, user);

        user.IsAuthenticated.Returns(false);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => handler.Handle(new GetProfileRecipeStatsQuery(), default));

        user.IsAuthenticated.Returns(true);
        user.UserId.Returns("user-1");
        recipes.GetPagedAsync(1, 1, authorId: "user-1", includeDrafts: true, ct: Arg.Any<CancellationToken>())
            .Returns((Array.Empty<Recipe>(), 5));
        recipes.GetPagedAsync(1, 1, authorId: "user-1", includeDrafts: true, status: RecipeStatus.Published, ct: Arg.Any<CancellationToken>())
            .Returns((Array.Empty<Recipe>(), 3));

        var stats = await handler.Handle(new GetProfileRecipeStatsQuery(), default);
        Assert.Equal(5, stats.Created);
        Assert.Equal(3, stats.Published);
    }

    [Fact]
    public async Task Recipe_queries_resolve_and_return()
    {
        var repo = Substitute.For<IRecipeRepository>();
        var user = Substitute.For<ICurrentUserService>();
        user.IsAuthenticated.Returns(true);
        user.IsAdmin.Returns(true);
        user.UserId.Returns("user-1");

        var recipeId = Guid.NewGuid();
        var recipe = Recipe.Create("Pho Bo", "pho-bo", "Desc", "Inst", 10, 20, 2, RecipeDifficulty.Easy, Guid.NewGuid(), "author-1");
        recipe.Category = Category.Create("Mon Chinh", "mon-chinh", null);
        recipe.Author = new ApplicationUser { Id = "author-1", UserName = "chef@example.com", DisplayName = "Chef" };
        recipe.Nutrition = new RecipeNutrition(300, 20, 40, 10, 5, 2);

        repo.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns(recipe);
        repo.GetBySlugAsync("pho-bo", Arg.Any<CancellationToken>()).Returns(recipe);
        repo.GetPublishedBySlugHistoryAsync("pho-bo", Arg.Any<CancellationToken>()).Returns(recipe);
        repo.GetPagedAsync(1, 12, sortBy: null, authorId: null, includeDrafts: true, status: null, ct: Arg.Any<CancellationToken>())
            .Returns((new[] { recipe }, 1));

        var byId = await new GetRecipeByIdQueryHandler(repo, user).Handle(new GetRecipeByIdQuery(recipeId), default);
        Assert.NotNull(byId);
        Assert.Equal("Pho Bo", byId.Title);

        var slugRes = await new ResolveRecipeSlugQueryHandler(repo).Handle(new ResolveRecipeSlugQuery("pho-bo"), default);
        Assert.NotNull(slugRes);
        Assert.Equal("pho-bo", slugRes.CurrentSlug);

        var managed = await new GetManagedRecipesQueryHandler(repo, user).Handle(new GetManagedRecipesQuery(1, 12), default);
        Assert.Single(managed.Items);
        Assert.Equal(1, managed.TotalCount);
    }

    [Fact]
    public async Task UploadRecipeImage_validates_boundaries()
    {
        var uow = Substitute.For<IUnitOfWork>();
        var user = Substitute.For<ICurrentUserService>();
        var storage = Substitute.For<IFileStorageService>();
        var mutations = Substitute.For<IRecipeImageMutations>();
        var queue = Substitute.For<IRecipeImageProcessingQueue>();
        var logger = Substitute.For<ILogger<UploadRecipeImageCommandHandler>>();
        var intents = Substitute.For<IRecipeImageUploadIntents>();

        var handler = new UploadRecipeImageCommandHandler(uow, user, storage, mutations, queue, logger, intents);

        using var emptyStream = new MemoryStream();
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new UploadRecipeImageCommand(Guid.NewGuid(), emptyStream, "test.jpg", "image/jpeg", 0, null), default));

        using var validStream = new MemoryStream([0xFF, 0xD8, 0xFF, 0x00]);
        await Assert.ThrowsAsync<ValidationException>(() =>
            handler.Handle(new UploadRecipeImageCommand(Guid.NewGuid(), validStream, "test.jpg", "image/jpeg", 4, new string('x', 201)), default));

        var recipeId = Guid.NewGuid();
        uow.Recipes.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns((Recipe?)null);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new UploadRecipeImageCommand(recipeId, validStream, "test.jpg", "image/jpeg", 4, "alt"), default));

        var recipe = Recipe.Create("Bun Cha", "bun-cha", "Desc", "Inst", 10, 20, 2, RecipeDifficulty.Easy, Guid.NewGuid(), "author-1");
        uow.Recipes.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns(recipe);
        user.IsAdmin.Returns(false);
        user.UserId.Returns("other-user");
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.Handle(new UploadRecipeImageCommand(recipeId, validStream, "test.jpg", "image/jpeg", 4, "alt"), default));

        recipe.Archive();
        user.UserId.Returns("author-1");
        await Assert.ThrowsAsync<ConflictException>(() =>
            handler.Handle(new UploadRecipeImageCommand(recipeId, validStream, "test.jpg", "image/jpeg", 4, "alt"), default));

        var draftRecipe = Recipe.Create("Bun Cha 2", "bun-cha-2", "Desc", "Inst", 10, 20, 2, RecipeDifficulty.Easy, Guid.NewGuid(), "author-1");
        uow.Recipes.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns(draftRecipe);

        storage.UploadAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns("https://storage/recipes/test.jpg");

        var result = await handler.Handle(new UploadRecipeImageCommand(recipeId, validStream, "test.jpg", "image/jpeg", 4, "Alt text"), default);
        Assert.NotNull(result);
        Assert.Equal("https://storage/recipes/test.jpg", result.OriginalUrl);
    }

    [Fact]
    public async Task DeleteRecipeImage_handles_auth_and_deletion()
    {
        var uow = Substitute.For<IUnitOfWork>();
        var user = Substitute.For<ICurrentUserService>();
        var deletionQueue = Substitute.For<IRecipeImageDeletionQueue>();
        var mutations = Substitute.For<IRecipeImageMutations>();
        var logger = Substitute.For<ILogger<DeleteRecipeImageCommandHandler>>();

        var handler = new DeleteRecipeImageCommandHandler(uow, user, deletionQueue, mutations, logger);
        var recipeId = Guid.NewGuid();
        var imageId = Guid.NewGuid();

        uow.Recipes.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns((Recipe?)null);
        await Assert.ThrowsAsync<NotFoundException>(() =>
            handler.Handle(new DeleteRecipeImageCommand(recipeId, imageId), default));

        var recipe = Recipe.Create("Bun Bo", "bun-bo", "Desc", "Inst", 10, 20, 2, RecipeDifficulty.Easy, Guid.NewGuid(), "author-1");
        uow.Recipes.GetDetailsByIdAsync(recipeId, Arg.Any<CancellationToken>()).Returns(recipe);

        user.IsAdmin.Returns(false);
        user.UserId.Returns("other-user");
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            handler.Handle(new DeleteRecipeImageCommand(recipeId, imageId), default));

        user.UserId.Returns("author-1");
        await handler.Handle(new DeleteRecipeImageCommand(recipeId, imageId), default);
        await mutations.Received(1).DeleteAsync(recipeId, imageId, Arg.Any<CancellationToken>());
    }

    [Fact]
    public void Models_and_pagination_instantiate()
    {
        var paged = new PagedResult<string>(["a", "b"], 2, 1, 10);
        Assert.Equal(2, paged.TotalCount);
        Assert.Equal(1, paged.Page);
        Assert.Equal(10, paged.PageSize);
        Assert.Equal(1, paged.TotalPages);
        Assert.False(paged.HasNextPage);
        Assert.False(paged.HasPreviousPage);
        Assert.NotNull(paged.Meta);

        var command = new SetRecipeImagePrimaryCommand(Guid.NewGuid(), Guid.NewGuid());
        Assert.NotEqual(Guid.Empty, command.RecipeId);

        var query = new GetRecipeImagesQuery(Guid.NewGuid());
        Assert.NotEqual(Guid.Empty, query.RecipeId);
    }
}
