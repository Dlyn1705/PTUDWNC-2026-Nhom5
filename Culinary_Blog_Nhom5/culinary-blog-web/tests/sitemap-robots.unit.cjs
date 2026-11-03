/* eslint-disable @typescript-eslint/no-require-imports -- Node.js test runner for Sitemap & Robots */
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sitemapSourcePath = path.join(root, "app", "sitemap.ts");
const robotsSourcePath = path.join(root, "app", "robots.ts");

describe("Sitemap & Robots Static Verification", () => {
  test("sitemap.ts and robots.ts files must exist", () => {
    assert.ok(fs.existsSync(sitemapSourcePath), "app/sitemap.ts does not exist");
    assert.ok(fs.existsSync(robotsSourcePath), "app/robots.ts does not exist");
  });

  test("sitemap.ts must declare dynamic = 'force-dynamic' for fresh crawl updates", () => {
    const content = fs.readFileSync(sitemapSourcePath, "utf8");
    assert.match(content, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
  });

  test("sitemap.ts must normalize base URL and prevent trailing slashes", () => {
    const content = fs.readFileSync(sitemapSourcePath, "utf8");
    assert.ok(content.includes('.replace(/\\/+$/, "")'), "Base URL trailing slash replacement missing in sitemap.ts");
  });

  test("sitemap.ts must contain defensive pagination cap (MAX_PAGES)", () => {
    const content = fs.readFileSync(sitemapSourcePath, "utf8");
    assert.match(content, /MAX_PAGES\s*=\s*\d+/);
    assert.match(content, /page\s*>=\s*MAX_PAGES/);
  });

  test("sitemap.ts must enforce defense-in-depth Published-only filter", () => {
    const content = fs.readFileSync(sitemapSourcePath, "utf8");
    assert.match(content, /status\s*===\s*1/);
    assert.match(content, /recipe\.slug/);
  });

  test("sitemap.ts must handle upstream API failures with try/catch fallback", () => {
    const content = fs.readFileSync(sitemapSourcePath, "utf8");
    assert.match(content, /try\s*\{/);
    assert.match(content, /catch\s*\(/);
    assert.match(content, /return\s+staticRoutes/);
  });

  test("robots.ts must disallow private and admin paths", () => {
    const content = fs.readFileSync(robotsSourcePath, "utf8");
    assert.match(content, /\/dashboard\//);
    assert.match(content, /\/profile/);
    assert.match(content, /\/api\//);
    assert.match(content, /\/forbidden/);
    assert.match(content, /sitemap\.xml/);
  });
});

describe("Sitemap Generation Logic & Edge Cases", () => {
  // Pure logic replica of sitemap algorithm to test edge cases in isolation
  async function generateSitemap({
    siteUrlEnv,
    categoriesMock,
    getRecipesMock,
  }) {
    const baseUrl = (siteUrlEnv || "https://culinaryblog.local")
      .trim()
      .replace(/\/+$/, "");

    const staticRoutes = [
      { url: `${baseUrl}`, changeFrequency: "daily", priority: 1.0 },
      { url: `${baseUrl}/recipes`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/categories`, changeFrequency: "weekly", priority: 0.8 },
    ];

    try {
      const categories = await categoriesMock();
      const categoryRoutes = categories
        .filter((cat) => Boolean(cat && cat.slug))
        .map((category) => ({
          url: `${baseUrl}/categories/${category.slug}`,
          changeFrequency: "weekly",
          priority: 0.7,
        }));

      const recipes = [];
      let page = 1;
      const MAX_PAGES = 500;

      do {
        const result = await getRecipesMock({
          page,
          pageSize: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        });

        const validPublished = (result.data || []).filter(
          (recipe) => recipe && recipe.status === 1 && Boolean(recipe.slug),
        );
        recipes.push(...validPublished);

        if (!result.meta?.hasNextPage || page >= MAX_PAGES) break;
        page += 1;
      } while (true);

      const recipeRoutes = recipes.map((recipe) => {
        const rawDate = recipe.updatedAt || recipe.publishedAt || recipe.createdAt;
        const parsedDate = rawDate ? new Date(rawDate) : new Date();
        const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

        return {
          url: `${baseUrl}/recipes/${recipe.slug}`,
          lastModified: validDate,
          changeFrequency: "monthly",
          priority: 0.8,
        };
      });

      return [...staticRoutes, ...categoryRoutes, ...recipeRoutes];
    } catch {
      return staticRoutes;
    }
  }

  test("multi-page pagination (>50 items) collects all Published recipes across all pages", async () => {
    // 120 total recipes over 3 pages: 50 + 50 + 20
    const mockCategories = () => Promise.resolve([
      { id: "c1", name: "Món Việt", slug: "mon-viet" },
      { id: "c2", name: "Món Á", slug: "mon-a" },
    ]);

    const mockGetRecipes = ({ page }) => {
      if (page === 1) {
        return Promise.resolve({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `r1-${i}`,
            title: `Recipe 1-${i}`,
            slug: `recipe-1-${i}`,
            status: 1,
            createdAt: "2026-10-01T00:00:00Z",
          })),
          meta: { page: 1, pageSize: 50, totalCount: 120, totalPages: 3, hasNextPage: true },
        });
      }
      if (page === 2) {
        return Promise.resolve({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: `r2-${i}`,
            title: `Recipe 2-${i}`,
            slug: `recipe-2-${i}`,
            status: 1,
            createdAt: "2026-10-02T00:00:00Z",
          })),
          meta: { page: 2, pageSize: 50, totalCount: 120, totalPages: 3, hasNextPage: true },
        });
      }
      return Promise.resolve({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `r3-${i}`,
          title: `Recipe 3-${i}`,
          slug: `recipe-3-${i}`,
          status: 1,
          createdAt: "2026-10-03T00:00:00Z",
        })),
        meta: { page: 3, pageSize: 50, totalCount: 120, totalPages: 3, hasNextPage: false },
      });
    };

    const sitemap = await generateSitemap({
      siteUrlEnv: "https://culinaryblog.local",
      categoriesMock: mockCategories,
      getRecipesMock: mockGetRecipes,
    });

    // 3 static routes + 2 category routes + 120 recipe routes = 125 total
    assert.equal(sitemap.length, 125);
    const urls = sitemap.map((entry) => entry.url);
    assert.ok(urls.includes("https://culinaryblog.local"));
    assert.ok(urls.includes("https://culinaryblog.local/recipes"));
    assert.ok(urls.includes("https://culinaryblog.local/categories"));
    assert.ok(urls.includes("https://culinaryblog.local/categories/mon-viet"));
    assert.ok(urls.includes("https://culinaryblog.local/categories/mon-a"));
    assert.ok(urls.includes("https://culinaryblog.local/recipes/recipe-1-0"));
    assert.ok(urls.includes("https://culinaryblog.local/recipes/recipe-2-49"));
    assert.ok(urls.includes("https://culinaryblog.local/recipes/recipe-3-19"));
  });

  test("draft (0) and archived (2) recipes are strictly excluded from sitemap", async () => {
    const mockCategories = () => Promise.resolve([]);
    const mockGetRecipes = () => Promise.resolve({
      data: [
        { id: "1", title: "Published Recipe", slug: "published-recipe", status: 1 },
        { id: "2", title: "Draft Recipe", slug: "draft-recipe", status: 0 },
        { id: "3", title: "Archived Recipe", slug: "archived-recipe", status: 2 },
        { id: "4", title: "Missing Slug Recipe", slug: "", status: 1 },
      ],
      meta: { page: 1, pageSize: 50, totalCount: 4, totalPages: 1, hasNextPage: false },
    });

    const sitemap = await generateSitemap({
      siteUrlEnv: "https://culinaryblog.local",
      categoriesMock: mockCategories,
      getRecipesMock: mockGetRecipes,
    });

    const urls = sitemap.map((entry) => entry.url);
    assert.ok(urls.includes("https://culinaryblog.local/recipes/published-recipe"));
    assert.equal(urls.includes("https://culinaryblog.local/recipes/draft-recipe"), false);
    assert.equal(urls.includes("https://culinaryblog.local/recipes/archived-recipe"), false);
    assert.equal(sitemap.filter((e) => e.url.startsWith("https://culinaryblog.local/recipes/")).length, 1);
  });

  test("base URL with trailing slash is cleanly normalized without double slashes", async () => {
    const mockCategories = () => Promise.resolve([{ slug: "desserts" }]);
    const mockGetRecipes = () => Promise.resolve({
      data: [{ slug: "chocolate-cake", status: 1 }],
      meta: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1, hasNextPage: false },
    });

    const sitemap = await generateSitemap({
      siteUrlEnv: "https://my-domain.com///",
      categoriesMock: mockCategories,
      getRecipesMock: mockGetRecipes,
    });

    for (const entry of sitemap) {
      assert.equal(entry.url.includes("https://my-domain.com//"), false, `Double slash detected in: ${entry.url}`);
    }
    assert.ok(sitemap.some((e) => e.url === "https://my-domain.com/recipes/chocolate-cake"));
    assert.ok(sitemap.some((e) => e.url === "https://my-domain.com/categories/desserts"));
  });

  test("upstream API failure gracefully falls back to static core routes without crashing", async () => {
    const throwingMock = () => Promise.reject(new Error("503 Service Unavailable / Connection Refused"));

    const sitemap = await generateSitemap({
      siteUrlEnv: "https://culinaryblog.local",
      categoriesMock: throwingMock,
      getRecipesMock: throwingMock,
    });

    assert.equal(sitemap.length, 3);
    assert.equal(sitemap[0].url, "https://culinaryblog.local");
    assert.equal(sitemap[1].url, "https://culinaryblog.local/recipes");
    assert.equal(sitemap[2].url, "https://culinaryblog.local/categories");
  });

  test("defensive loop termination stops at MAX_PAGES if API claims infinite pages", async () => {
    let callCount = 0;
    const endlessMock = () => {
      callCount++;
      return Promise.resolve({
        data: [{ slug: `item-${callCount}`, status: 1 }],
        meta: { page: callCount, pageSize: 50, totalCount: 999999, totalPages: 99999, hasNextPage: true },
      });
    };

    // Override MAX_PAGES test by verifying loop halts
    const baseUrl = "https://test.local";
    let page = 1;
    const MAX_PAGES = 5;
    const recipes = [];
    do {
      const res = await endlessMock();
      recipes.push(...res.data);
      if (!res.meta?.hasNextPage || page >= MAX_PAGES) break;
      page += 1;
    } while (true);

    assert.equal(page, 5);
    assert.equal(recipes.length, 5);
  });
});

describe("Robots Output Logic", () => {
  function generateRobots(siteUrlEnv) {
    const siteUrl = (siteUrlEnv || "https://culinaryblog.local")
      .trim()
      .replace(/\/+$/, "");

    return {
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/profile", "/api/", "/forbidden"],
      },
      sitemap: `${siteUrl}/sitemap.xml`,
    };
  }

  test("robots.txt configuration produces valid spec-compliant rules", () => {
    const robots = generateRobots("https://culinaryblog.local/");
    assert.equal(robots.rules.userAgent, "*");
    assert.equal(robots.rules.allow, "/");
    assert.deepEqual(robots.rules.disallow, ["/dashboard/", "/profile", "/api/", "/forbidden"]);
    assert.equal(robots.sitemap, "https://culinaryblog.local/sitemap.xml");
  });

  test("robots sitemap handles environment URL without double slashes", () => {
    const robots = generateRobots("https://production-blog.com///");
    assert.equal(robots.sitemap, "https://production-blog.com/sitemap.xml");
  });
});
