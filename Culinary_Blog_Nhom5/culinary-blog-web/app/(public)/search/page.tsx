import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search, SlidersHorizontal, Clock3, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recipeApi } from "@/lib/api/recipeApi";
import { categoryApi } from "@/lib/api/categoryApi";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";
import type { CategoryDto } from "@/types/category.types";

export const metadata: Metadata = {
  title: "Tìm công thức — Culinary Blog",
  description: "Tìm kiếm công thức nấu ăn tiếng Việt có dấu hoặc không dấu.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim();
  const page = Math.max(1, Number.parseInt(first(params.page) || "1", 10) || 1);
  const categoryId = first(params.categoryId);
  const difficulty = first(params.difficulty);
  const sort = first(params.sort) || "relevance";

  let recipes: SearchRecipeSummaryDto[] = [];
  let totalCount = 0;
  let totalPages = 0;
  let searchError = "";
  let categories: CategoryDto[] = [];

  try {
    categories = await categoryApi.getAll();
  } catch {
    // Category filtering remains optional when the category service is unavailable.
  }

  if (q.length >= 2) {
    try {
      const response = await recipeApi.search({
        q,
        page,
        pageSize: 12,
        categoryId: categoryId || undefined,
        difficulty: difficulty ? Number(difficulty) : undefined,
        sort,
      });
      if (!response.success || !response.data) {
        searchError = response.message || "Không thể tìm công thức lúc này.";
      } else {
        recipes = response.data.items;
        totalCount = response.data.totalCount;
        totalPages = response.data.totalPages ?? Math.ceil(totalCount / response.data.pageSize);
      }
    } catch {
      searchError = "Không kết nối được máy chủ tìm kiếm. Vui lòng thử lại.";
    }
  }

  const pageUrl = (targetPage: number) => {
    const query = new URLSearchParams({ q, page: String(targetPage), sort });
    if (categoryId) query.set("categoryId", categoryId);
    if (difficulty) query.set("difficulty", difficulty);
    return `/search?${query.toString()}`;
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Khám phá món ngon
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Tìm công thức yêu thích</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Gõ tên món ăn hoặc nguyên liệu. Tìm kiếm hỗ trợ tiếng Việt có dấu và không dấu.
          </p>
        </div>

        <form action="/search" method="get" className="space-y-4 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} minLength={2} maxLength={100} required placeholder="Ví dụ: phở bò, banh xeo..." className="h-12 rounded-2xl pl-11" aria-label="Từ khóa tìm kiếm" />
            </div>
            <Button type="submit" className="h-12 rounded-2xl px-6"><Search className="mr-2 size-4" />Tìm kiếm</Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-44 flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
              Danh mục
              <select name="categoryId" defaultValue={categoryId} className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground">
                <option value="">Tất cả danh mục</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid min-w-36 flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
              Độ khó
              <select name="difficulty" defaultValue={difficulty} className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground">
                <option value="">Mọi độ khó</option><option value="1">Dễ</option><option value="2">Trung bình</option><option value="3">Khó</option><option value="4">Chuyên gia</option>
              </select>
            </label>
            <label className="grid min-w-44 flex-1 gap-1.5 text-xs font-medium text-muted-foreground">
              Sắp xếp
              <select name="sort" defaultValue={sort} className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground">
                <option value="relevance">Liên quan nhất</option><option value="-createdAt">Mới nhất</option><option value="createdAt">Cũ nhất</option><option value="cookTime">Nấu nhanh nhất</option><option value="-cookTime">Nấu lâu nhất</option><option value="title">Tên món A–Z</option>
              </select>
            </label>
            <Button type="submit" variant="outline" className="h-10 rounded-xl"><SlidersHorizontal className="mr-2 size-4" />Lọc</Button>
          </div>
        </form>

        {q.length < 2 ? (
          <section className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
            <Search className="mx-auto size-8 text-primary" />
            <h2 className="mt-4 font-display text-2xl font-semibold">Bắt đầu với một món ăn</h2>
            <p className="mt-2 text-sm text-muted-foreground">Nhập ít nhất 2 ký tự để xem các công thức phù hợp.</p>
          </section>
        ) : searchError ? (
          <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{searchError}</div>
        ) : (
          <section className="space-y-5" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Kết quả tìm kiếm</p><h2 className="mt-1 font-display text-2xl font-bold">{totalCount} công thức cho “{q}”</h2></div>
              {totalPages > 0 && <p className="text-xs text-muted-foreground">Trang {page} / {totalPages}</p>}
            </div>

            {recipes.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card px-6 py-14 text-center shadow-soft">
                <Search className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-4 font-display text-xl font-semibold">Chưa tìm thấy công thức phù hợp</h3>
                <p className="mt-2 text-sm text-muted-foreground">Thử cách viết khác hoặc bỏ bớt bộ lọc.</p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recipes.map((recipe) => (
                  <article key={recipe.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                    <Link href={`/recipes/${recipe.slug}`} className="block">
                      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                        {recipe.primaryImageUrl ? <Image src={recipe.primaryImageUrl} alt={recipe.title} fill unoptimized className="object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-3xl">🍲</div>}
                        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold text-primary">{recipe.category.name}</span>
                      </div>
                      <div className="space-y-3 p-5">
                        <div className="flex justify-between text-xs text-muted-foreground"><span>{recipe.difficulty}</span><span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{recipe.prepTime + recipe.cookTime} phút</span></div>
                        <h3 className="line-clamp-2 font-display text-xl font-bold group-hover:text-primary">{recipe.title}</h3>
                        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{recipe.description}</p>
                        <div className="flex justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>{recipe.author.displayName}</span><span className="font-semibold text-primary">Độ phù hợp {recipe.relevanceScore.toFixed(2)}</span></div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            )}

            {totalPages > 1 && <nav className="flex items-center justify-between pt-2" aria-label="Phân trang kết quả">
              {page > 1 ? <Button asChild variant="outline" className="rounded-xl"><Link href={pageUrl(page - 1)}><ChevronLeft className="mr-1 size-4" />Trang trước</Link></Button> : <span />}
              <span className="text-xs tabular-nums text-muted-foreground">{page} / {totalPages}</span>
              {page < totalPages ? <Button asChild variant="outline" className="rounded-xl"><Link href={pageUrl(page + 1)}>Trang sau<ChevronRight className="ml-1 size-4" /></Link></Button> : <span />}
            </nav>}
          </section>
        )}
    </main>
  );
}
