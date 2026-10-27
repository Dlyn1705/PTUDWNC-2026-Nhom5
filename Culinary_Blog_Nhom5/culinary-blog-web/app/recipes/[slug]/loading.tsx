import { Skeleton } from "@/components/common/Skeleton";
import { LoadingState } from "@/components/common/LoadingState";

export default function RecipeDetailLoading() {
  return (
    <LoadingState label="Đang tải chi tiết công thức…" className="page-container space-y-8 py-8">
      <Skeleton className="aspect-[16/7] rounded-3xl" />
      <div className="grid gap-8 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-96 rounded-2xl lg:col-span-7" />
      </div>
    </LoadingState>
  );
}
