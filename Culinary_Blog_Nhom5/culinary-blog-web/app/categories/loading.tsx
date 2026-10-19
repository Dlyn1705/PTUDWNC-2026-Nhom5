import { CategoryGrid } from "@/components/categories/CategoryGrid";
import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";

export default function CategoriesLoading() {
  return (
    <LoadingState label="Đang tải trang danh mục…" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <CategoryGrid categories={[]} isLoading />
    </LoadingState>
  );
}
