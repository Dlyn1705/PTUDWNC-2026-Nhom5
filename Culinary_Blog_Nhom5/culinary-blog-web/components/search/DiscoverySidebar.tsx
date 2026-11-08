import Link from "next/link";
import type { CategoryDto } from "@/types/category.types";
import { SearchInput } from "./SearchInput";

export function DiscoverySidebar({ categories }: { categories: CategoryDto[] }) {
  return <aside aria-label="Khám phá công thức" className="space-y-6 rounded-2xl border border-border bg-card p-4 self-start">
    <form action="/search" method="get" className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Tìm món ăn</h2>
      <SearchInput />
    </form>
    <nav aria-label="Danh mục món ăn" className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Danh mục</h2>
      {categories.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có danh mục.</p> :
        <ul className="space-y-2">{categories.map(category => <li key={category.id}>
          <Link className="block rounded-lg px-2 py-2 text-sm hover:bg-muted focus-visible:outline-2" href={`/categories/${encodeURIComponent(category.slug)}`}>{category.name}</Link>
        </li>)}</ul>}
      <Link href="/categories" className="inline-block text-sm font-semibold text-primary underline">Xem tất cả danh mục</Link>
    </nav>
  </aside>;
}
