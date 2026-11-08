import { LoadingState } from "@/components/common/LoadingState";
import { Skeleton } from "@/components/common/Skeleton";

export default function SearchLoading() {
  return (
    <LoadingState
      label="Đang tải trang tìm kiếm…"
      className="page-container space-y-8 py-8"
    >
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
