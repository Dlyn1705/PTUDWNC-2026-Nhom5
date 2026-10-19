export function SortDropdown({ sortBy = "relevance", sortOrder = "desc" }: { sortBy?: string; sortOrder?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs font-medium">Sắp xếp<select name="sortBy" defaultValue={sortBy} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="relevance">Liên quan</option><option value="createdAt">Ngày đăng</option><option value="cookTime">Thời gian nấu</option><option value="title">Tên món</option></select></label>
      <label className="grid gap-1.5 text-xs font-medium">Thứ tự<select name="sortOrder" defaultValue={sortOrder} className="h-10 rounded-xl border border-input bg-background px-3 text-sm"><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select></label>
    </div>
  );
}
