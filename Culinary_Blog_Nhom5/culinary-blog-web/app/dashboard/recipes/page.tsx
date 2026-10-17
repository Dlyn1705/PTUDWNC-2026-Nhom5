"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ApiProblemError, toApiProblemError } from "@/lib/api/problemDetails";
import { recipeApi } from "@/lib/api/recipeApi";
import {
  RecipeStatus,
  type RecipeStatusValue,
} from "@/types/recipe.types";

type StatusFilter = RecipeStatusValue | "all";
type SortValue = "" | "title" | "-title" | "cooktime" | "-cooktime";

const PAGE_SIZE = 12;

function getError(error: unknown): Error {
  return toApiProblemError(error);
}

export default function DashboardRecipesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortValue>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteInFlight = useRef(false);

  const recipesQuery = useQuery({
    queryKey: ["managed-recipes", { page, pageSize: PAGE_SIZE, status, sortBy }],
    queryFn: async () => {
      try {
        return await recipeApi.getMine({
          page,
          pageSize: PAGE_SIZE,
          status: status === "all" ? undefined : status,
          sortBy: sortBy || undefined,
        });
      } catch (error) {
        throw getError(error);
      }
    },
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (recipeId: string) => recipeApi.delete(recipeId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["managed-recipes"] }),
  });

  const result = recipesQuery.data;
  const recipes = result?.data ?? [];
  const queryError = recipesQuery.error;
  const isUnauthorized = queryError instanceof ApiProblemError && queryError.status === 401;
  const isForbidden = queryError instanceof ApiProblemError && queryError.status === 403;
  const deleteError = deleteMutation.error
    ? toApiProblemError(deleteMutation.error)
    : null;
  const errorMessage = queryError
    ? getError(queryError).message
    : deleteError
      ? deleteError.message
      : null;

  const changeFilter = (change: () => void) => {
    setPage(1);
    change();
  };

  const handleDelete = async (recipeId: string) => {
    if (deleteInFlight.current) return;
    if (!window.confirm("Xóa công thức này? Công thức sẽ được ẩn ngay. Ảnh được giữ tối thiểu 30 ngày trước khi hệ thống dọn dữ liệu.")) return;
    deleteInFlight.current = true;

    const shouldGoToPreviousPage = recipes.length === 1 && page > 1;
    deleteMutation.reset();
    setDeletingId(recipeId);
    try {
      await deleteMutation.mutateAsync(recipeId);
      if (shouldGoToPreviousPage) setPage((current) => current - 1);
    } catch {
      // The normalized mutation error is rendered below without an unhandled rejection.
    } finally {
      deleteInFlight.current = false;
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Công thức của tôi</h1>
          <p className="mt-1 text-gray-600">Quản lý công thức bạn đã tạo.</p>
        </div>
        <Link
          className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white"
          href="/dashboard/recipes/new"
        >
          Tạo công thức
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Trạng thái</span>
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={status}
            onChange={(event) =>
              changeFilter(() =>
                setStatus(
                  event.target.value === "all"
                    ? "all"
                    : Number(event.target.value) as RecipeStatusValue,
                ),
              )
            }
          >
            <option value="all">Tất cả</option>
            <option value={RecipeStatus.Draft}>Bản nháp</option>
            <option value={RecipeStatus.Published}>Đã xuất bản</option>
            <option value={RecipeStatus.Archived}>Đã lưu trữ</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Sắp xếp</span>
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={sortBy}
            onChange={(event) =>
              changeFilter(() => setSortBy(event.target.value as SortValue))
            }
          >
            <option value="">Cập nhật mới nhất</option>
            <option value="title">Tên A-Z</option>
            <option value="-title">Tên Z-A</option>
            <option value="cooktime">Thời gian nấu tăng dần</option>
            <option value="-cooktime">Thời gian nấu giảm dần</option>
          </select>
        </label>
      </div>

      {recipesQuery.isPending && <p aria-live="polite">Đang tải…</p>}

      {queryError && (
        <div role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-700">
          <p>
            {isUnauthorized
              ? "Phiên đăng nhập đã hết hạn."
              : isForbidden
                ? "Bạn không có quyền Author/Admin để quản lý công thức."
                : errorMessage}
          </p>
          {isUnauthorized && (
            <Link
              className="mt-2 inline-block underline"
              href="/login?callbackUrl=/dashboard/recipes"
            >
              Đăng nhập lại
            </Link>
          )}
          {isForbidden && (
            <Link className="mt-2 inline-block underline" href="/forbidden">
              Xem thông tin quyền truy cập
            </Link>
          )}
        </div>
      )}

      {deleteMutation.error && !queryError && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-700">
          {deleteError instanceof ApiProblemError && deleteError.status === 401
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            : deleteError instanceof ApiProblemError && deleteError.status === 403
              ? "Bạn không có quyền xóa công thức này."
              : errorMessage}
        </p>
      )}

      {!recipesQuery.isPending && !queryError && recipes.length === 0 && (
        <p>Bạn chưa có công thức nào.</p>
      )}

      {recipes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <article key={recipe.id} className="rounded-xl border p-4">
              <h2 className="text-lg font-semibold">{recipe.title}</h2>
              <p className="text-sm text-gray-600">
                {recipe.category?.name ?? "Chưa phân loại"} · {recipe.status === RecipeStatus.Published
                  ? "Đã xuất bản"
                  : recipe.status === RecipeStatus.Archived
                    ? "Đã lưu trữ"
                    : "Bản nháp"}
              </p>
              <p className="my-3 line-clamp-2 text-sm">{recipe.description}</p>
              <div className="flex gap-3 text-sm">
                <Link
                  className="text-blue-700 underline"
                  href={`/dashboard/recipes/${recipe.id}/edit`}
                >
                  Chỉnh sửa
                </Link>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-red-700"
                  disabled={deletingId !== null}
                  onClick={() => void handleDelete(recipe.id)}
                >
                  {deletingId === recipe.id ? "Đang xóa…" : "Xóa"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {result && result.meta.totalPages > 0 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Phân trang công thức">
          <Button
            type="button"
            variant="outline"
            disabled={!result.meta.hasPreviousPage || recipesQuery.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Trang trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {result.meta.page} / {result.meta.totalPages} · {result.meta.totalCount} công thức
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={!result.meta.hasNextPage || recipesQuery.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            Trang sau
          </Button>
        </nav>
      )}
    </main>
  );
}
