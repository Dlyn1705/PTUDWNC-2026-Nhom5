import { LoadingState } from "@/components/common/LoadingState";
import { Skeleton } from "@/components/common/Skeleton";

export default function RecipesLoading() {
  return (
    <LoadingState
      label="Đang tải công thức"
      className="page-container space-y-8 py-8"
    >
      <div className="space-y-3 border-b border-border pb-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="overflow-hidden rounded-2xl border border-border bg-card">
            <Skeleton className="aspect-[16/9] rounded-none" />
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
