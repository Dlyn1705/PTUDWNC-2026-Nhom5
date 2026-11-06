// Native controls keep sorting available before hydration and avoid loading a portal menu on public search.
export function SortDropdown({ sortBy = "relevance", sortOrder = "desc" }: { sortBy?: string; sortOrder?: string }) {
  const control = "h-10 min-w-0 rounded-xl border border-input bg-background px-3 text-sm";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label htmlFor="search-sort-by" className="grid gap-1.5 text-xs font-medium">
        <span>Sắp xếp</span>
        <select id="search-sort-by" name="sortBy" aria-label="Sắp xếp theo" defaultValue={sortBy} className={control}>
          <option value="relevance">Liên quan</option>
          <option value="createdAt">Ngày đăng</option>
          <option value="cookTime">Thời gian nấu</option>
          <option value="title">Tên món</option>
        </select>
      </label>
      <label htmlFor="search-sort-order" className="grid gap-1.5 text-xs font-medium">
        <span>Thứ tự</span>
        <select id="search-sort-order" name="sortOrder" aria-label="Thứ tự sắp xếp" defaultValue={sortOrder} className={control}>
          <option value="desc">Giảm dần</option>
          <option value="asc">Tăng dần</option>
        </select>
      </label>
    </div>
  );
}
