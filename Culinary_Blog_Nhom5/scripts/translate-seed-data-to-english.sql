BEGIN;

CREATE TEMP TABLE seed_recipe_ids ON COMMIT DROP AS
SELECT "Id"
FROM "Recipes"
WHERE "Slug" ~ '^cong-thuc-mon-an-[0-9]+$';

WITH category_translations("OldName", "NewName", "NewSlug") AS (
    VALUES
        ('Mon khai vi', 'Appetizers', 'appetizers'),
        ('Mon chinh', 'Main Courses', 'main-courses'),
        ('Mon trang mieng', 'Desserts', 'desserts'),
        ('Mon an sang', 'Breakfast', 'breakfast'),
        ('Mon chay', 'Vegetarian', 'vegetarian'),
        ('Mon Viet Nam', 'Vietnamese Cuisine', 'vietnamese-cuisine'),
        ('Mon Han Quoc', 'Korean Cuisine', 'korean-cuisine'),
        ('Mon Nhat Ban', 'Japanese Cuisine', 'japanese-cuisine'),
        ('Mon Trung Quoc', 'Chinese Cuisine', 'chinese-cuisine'),
        ('Mon Thai Lan', 'Thai Cuisine', 'thai-cuisine'),
        ('Mon Italia', 'Italian Cuisine', 'italian-cuisine'),
        ('Mon Phap', 'French Cuisine', 'french-cuisine'),
        ('Mon Mexico', 'Mexican Cuisine', 'mexican-cuisine'),
        ('Mon An', 'Indian Cuisine', 'indian-cuisine'),
        ('Mon My', 'American Cuisine', 'american-cuisine'),
        ('Mon bien', 'Seafood', 'seafood'),
        ('Mon nuong', 'Grilled Dishes', 'grilled-dishes'),
        ('Mon chien', 'Fried Dishes', 'fried-dishes'),
        ('Mon hap', 'Steamed Dishes', 'steamed-dishes'),
        ('Do uong', 'Beverages', 'beverages')
)
UPDATE "Categories" AS category
SET
    "Name" = translation."NewName",
    "Slug" = translation."NewSlug",
    "Description" = 'Recipes in the ' || translation."NewName" || ' category.',
    "UpdatedAt" = NOW()
FROM category_translations AS translation
WHERE category."Name" = translation."OldName";

UPDATE "Recipes" AS recipe
SET
    "Title" = 'Recipe ' || substring(recipe."Slug" FROM '([0-9]+)$'),
    "Slug" = 'recipe-' || substring(recipe."Slug" FROM '([0-9]+)$'),
    "Description" = 'A delicious, easy-to-follow guide for preparing Recipe '
        || substring(recipe."Slug" FROM '([0-9]+)$') || '.',
    "Instructions" = 'Prepare the ingredients, follow each cooking step, and plate the finished dish.',
    "UpdatedAt" = NOW()
WHERE recipe."Id" IN (SELECT "Id" FROM seed_recipe_ids);

WITH ingredient_translations("OldName", "NewName") AS (
    VALUES
        ('Thit ga', 'Chicken'),
        ('Thit bo', 'Beef'),
        ('Ca', 'Fish'),
        ('Tom', 'Shrimp'),
        ('Trung ga', 'Eggs'),
        ('Ca rot', 'Carrots'),
        ('Khoai tay', 'Potatoes'),
        ('Hanh tay', 'Onion'),
        ('Toi', 'Garlic'),
        ('Nuoc mam', 'Fish sauce'),
        ('Duong', 'Sugar'),
        ('Muoi', 'Salt'),
        ('Tieu', 'Black pepper'),
        ('Dau an', 'Cooking oil'),
        ('Ot', 'Chili')
)
UPDATE "RecipeIngredients" AS ingredient
SET
    "Name" = translation."NewName",
    "Unit" = CASE ingredient."Unit"
        WHEN 'qua' THEN 'pieces'
        WHEN 'cu' THEN 'pieces'
        WHEN 'tep' THEN 'cloves'
        WHEN 'muong canh' THEN 'tablespoons'
        WHEN 'muong ca phe' THEN 'teaspoons'
        ELSE ingredient."Unit"
    END,
    "UpdatedAt" = NOW()
FROM ingredient_translations AS translation
WHERE ingredient."Name" = translation."OldName"
  AND ingredient."RecipeId" IN (SELECT "Id" FROM seed_recipe_ids);

UPDATE "RecipeSteps" AS step
SET
    "Title" = CASE step."StepNumber"
        WHEN 1 THEN 'Prepare the ingredients'
        WHEN 2 THEN 'Cut and season'
        WHEN 3 THEN 'Cook the dish'
        WHEN 4 THEN 'Adjust the seasoning'
        WHEN 5 THEN 'Finish and serve'
        ELSE step."Title"
    END,
    "Description" = CASE step."StepNumber"
        WHEN 1 THEN 'Clean and prepare all ingredients.'
        WHEN 2 THEN 'Cut and season the required ingredients.'
        WHEN 3 THEN 'Add the ingredients to the cookware and begin cooking.'
        WHEN 4 THEN 'Add seasonings and adjust the flavor to taste.'
        WHEN 5 THEN 'Check the dish, turn off the heat, and plate it for serving.'
        ELSE step."Description"
    END,
    "UpdatedAt" = NOW()
WHERE step."RecipeId" IN (SELECT "Id" FROM seed_recipe_ids);

COMMIT;

SELECT "Name", "Slug", "Description"
FROM "Categories"
ORDER BY "OrderIndex";

SELECT "Title", "Slug", "Description"
FROM "Recipes"
ORDER BY "CreatedAt"
LIMIT 10;
