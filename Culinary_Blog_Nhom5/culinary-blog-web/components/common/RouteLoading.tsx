import { LoadingState } from "./LoadingState";
import { Skeleton } from "./Skeleton";

/** Route skeletons have no data, providers or interactive feature components. */
export function RouteLoading({ label = "Đang tải nội dung…", variant = "cards" }: {
  label?: string;
  variant?: "cards" | "table" | "form" | "images";
}) {
  return <LoadingState label={label} className="page-container space-y-6 py-8">
    <div className="space-y-3"><Skeleton className="h-8 w-72 max-w-full" /><Skeleton className="h-4 w-96 max-w-full" /></div>
    {variant === "table" ? <div className="space-y-3 rounded-2xl border p-4">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div> : variant === "form" ? <div className="max-w-3xl space-y-5">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className={i === 2 ? "h-32 w-full" : "h-11 w-full"} /></div>)}
    </div> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="space-y-3 rounded-2xl border p-4">
        <Skeleton className="aspect-video w-full" />
        {variant !== "images" && <><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /></>}
      </div>)}
    </div>}
  </LoadingState>;
}
