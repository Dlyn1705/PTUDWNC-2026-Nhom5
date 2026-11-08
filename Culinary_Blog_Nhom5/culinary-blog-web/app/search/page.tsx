import type { Metadata } from "next";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchInput } from "@/components/search/SearchInput";
import { SearchResults } from "@/components/search/SearchResults";
import { FilterSidebar } from "@/components/search/FilterSidebar";
import { SortDropdown } from "@/components/search/SortDropdown";
import Link from "next/link";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicApi } from "@/lib/api/serverClient";
import { parseSearchParams } from "@/lib/searchParams";
import type { SearchRecipeSummaryDto } from "@/types/recipe.types";
import type { CategoryDto } from "@/types/category.types";
import { PaginationControl, EmptyState } from "@/components/common";
import { errorPresentation } from "@/lib/errorPresentation";
import { RouteRequestError } from "@/components/common/RouteRequestError";
import { UnauthorizedState } from "@/components/common/UnauthorizedState";
import { unstable_rethrow } from "next/navigation";
import { getPaginationItems, buildPaginationLinks } from "@/lib/pagination";
import { buildListingMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildListingMetadata(
  "/search",
  "Tìm công thức",
  "Tìm kiếm công thức nấu ăn tiếng Việt có dấu hoặc không dấu.",
  true,
);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { q, page: requestedPage, pageSize, categoryId, difficulty, minCookTime, maxCookTime,
    minServings, maxServings, sortBy, sortOrder, errors: validationErrors } = parseSearchParams(params);

  let recipes: SearchRecipeSummaryDto[] = [];
  let totalCount = 0;
  let totalPages = 0;
  let searchError = "";
  let searchCorrelationId: string | undefined;
  let searchStatus: number | undefined;
  let canRetry = true;
  let categories: CategoryDto[] = [];
  let categoryError = false;
  let page = requestedPage;

  try {
    categories = await publicApi.getCategories();
  } catch (error) {
    unstable_rethrow(error);
    categoryError = true;
  }

  if (q.length >= 2 && validationErrors.length === 0) {
    try {
      const response = await publicApi.searchRecipes({
        q,
        page: requestedPage,
        pageSize,
        categoryId: categoryId || undefined,
        difficulty: difficulty ? Number(difficulty) : undefined,
        minCookTime,
        maxCookTime,
        minServings,
        maxServings,
        sortBy,
        sortOrder,
      });
      recipes = response.data;
      totalCount = response.meta.totalCount;
      totalPages = response.meta.totalPages;
      page = response.meta.page;
    } catch (error) {
      unstable_rethrow(error);
      const presentation = errorPresentation(error);
      searchError = presentation.description;
      searchCorrelationId = presentation.correlationId;
      searchStatus = presentation.status;
      canRetry = presentation.canRetry;
    }
  }

  const pageUrl = (targetPage: number) => {
    const query = new URLSearchParams({ q, page: String(targetPage), pageSize: String(pageSize), sortBy, sortOrder });
    if (categoryId) query.set("categoryId", categoryId);
    if (difficulty) query.set("difficulty", difficulty);
    if (minCookTime !== undefined) query.set("minCookTime", String(minCookTime));
    if (maxCookTime !== undefined) query.set("maxCookTime", String(maxCookTime));
    if (minServings !== undefined) query.set("minServings", String(minServings));
    if (maxServings !== undefined) query.set("maxServings", String(maxServings));
    return `/search?${query.toString()}`;
  };
  const resetUrl = new URLSearchParams({ q, page: "1", pageSize: String(pageSize), sortBy, sortOrder });
  const resetHref = `/search?${resetUrl.toString()}`;

  const paginationItems = getPaginationItems(page, totalPages);
  const paginationLinks = buildPaginationLinks(paginationItems, page, totalPages, pageUrl);

  return (
    <div className="page-container space-y-8 py-8">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" /> Khám phá món ngon
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Tìm công thức yêu thích</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Gõ tên món ăn hoặc nguyên liệu. Tìm kiếm hỗ trợ tiếng Việt có dấu và không dấu.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside aria-label="Bộ lọc tìm kiếm">
      <SearchForm key={JSON.stringify(params)} className="space-y-4 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="pageSize" value={pageSize} />
        <SearchInput defaultValue={q} />
        {categoryError && <p role="alert" className="text-sm text-destructive">Không tải được danh mục. <Link href={pageUrl(page)} className="underline">Thử lại</Link></p>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <FilterSidebar categories={categories} categoryId={categoryId} difficulty={difficulty} />
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Thời gian nấu tối thiểu (phút)
            <Input type="number" name="minCookTime" min="0" defaultValue={minCookTime} className="h-10 rounded-xl" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Thời gian nấu tối đa (phút)
            <Input type="number" name="maxCookTime" min="0" defaultValue={maxCookTime} className="h-10 rounded-xl" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Khẩu phần tối thiểu
            <Input type="number" name="minServings" min="1" defaultValue={minServings} className="h-10 rounded-xl" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Khẩu phần tối đa
            <Input type="number" name="maxServings" min="1" defaultValue={maxServings} className="h-10 rounded-xl" />
          </label>
          <SortDropdown sortBy={sortBy} sortOrder={sortOrder} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" className="h-10 rounded-xl"><SlidersHorizontal className="mr-2 size-4" />Áp dụng tìm kiếm và bộ lọc</Button>
          <Link href={resetHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Đặt lại bộ lọc</Link>
        </div>
      </SearchForm>

      </aside>
      <div>
      {validationErrors.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-destructive p-5">
          <h2 className="font-semibold">Thông tin tìm kiếm không hợp lệ</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{validationErrors.map(error => <li key={error}>{error}</li>)}</ul>
          <Link href="/search" className="mt-3 inline-block text-sm font-medium underline">Bắt đầu tìm kiếm mới</Link>
        </div>
      ) : q.length < 2 ? (
        <EmptyState headingLevel="h2" title="Bắt đầu với một món ăn"
          description="Nhập ít nhất 2 ký tự để xem các công thức phù hợp." icon={<Search className="size-7" />} />
      ) : searchError && (searchStatus === 401 || searchStatus === 403) ? (
        <UnauthorizedState
          mode={searchStatus === 401 ? "unauthenticated" : "forbidden"}
          description={searchError}
          loginHref={`/auth/login?callbackUrl=${encodeURIComponent(pageUrl(page))}`}
          headingLevel="h2"
          focusOnMount
        />
      ) : searchError ? (
        <RouteRequestError
          title="Không thể tìm kiếm công thức"
          description={searchError}
          correlationId={searchCorrelationId}
          canRetry={canRetry}
        />
      ) : (
        <section id="search-results" className="space-y-5" aria-live="polite" aria-label="Kết quả tìm kiếm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Kết quả tìm kiếm</p><h2 className="mt-1 font-display text-2xl font-bold">{totalCount} công thức cho “{q}”</h2></div>
            {totalPages > 0 && <p className="text-xs text-muted-foreground" aria-live="polite">Trang {page} / {totalPages}</p>}
          </div>

          {requestedPage > totalPages && totalPages > 0 && (
            <div role="status" className="rounded-2xl border border-border bg-card p-5 text-sm">
              Trang yêu cầu không còn tồn tại. <Link href={pageUrl(totalPages)} className="font-semibold text-primary underline">Mở trang cuối ({totalPages})</Link>
            </div>
          )}

          {recipes.length === 0 ? (
            <EmptyState
              title="Chưa tìm thấy công thức phù hợp"
              description="Thử cách viết khác hoặc bỏ bớt bộ lọc."
              icon={<Search className="size-7" />}
              action={
                <Link
                  href={resetHref}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-primary hover:bg-muted"
                >
                  Đặt lại bộ lọc
                </Link>
              }
            />
          ) : (
            <SearchResults recipes={recipes} />
          )}

          <PaginationControl
            mode="link"
            page={page}
            totalPages={totalPages}
            links={paginationLinks}
            ariaLabel="Phân trang kết quả"
          />
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
