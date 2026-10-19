import type { CategoryDto } from "@/types/category.types";

export function FilterSidebar({ categories, categoryId = "", difficulty = "" }: { categories: CategoryDto[]; categoryId?: string; difficulty?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs font-medium">Danh mục<select name="categoryId" defaultValue={categoryId} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Tất cả</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-medium">Độ khó<select name="difficulty" defaultValue={difficulty} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="">Tất cả</option><option value="1">Dễ</option><option value="2">Trung bình</option><option value="3">Khó</option><option value="4">Chuyên gia</option></select></label>
    </div>
  );
}
