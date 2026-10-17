import { CategoryGrid } from "@/components/categories/CategoryGrid";

export default function CategoriesLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-72 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-5 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <CategoryGrid categories={[]} isLoading />
    </div>
  );
}
