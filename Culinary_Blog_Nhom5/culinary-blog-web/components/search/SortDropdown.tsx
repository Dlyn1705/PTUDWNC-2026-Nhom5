import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SortDropdown({ sortBy = "relevance", sortOrder = "desc" }: { sortBy?: string; sortOrder?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label htmlFor="search-sort-by" className="grid gap-1.5 text-xs font-medium">
        <span>Sắp xếp</span>
        <Select name="sortBy" defaultValue={sortBy}>
          <SelectTrigger id="search-sort-by" aria-label="Sắp xếp theo" className="h-10 rounded-xl text-sm">
            <SelectValue placeholder="Chọn tiêu chí" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Liên quan</SelectItem>
            <SelectItem value="createdAt">Ngày đăng</SelectItem>
            <SelectItem value="cookTime">Thời gian nấu</SelectItem>
            <SelectItem value="title">Tên món</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label htmlFor="search-sort-order" className="grid gap-1.5 text-xs font-medium">
        <span>Thứ tự</span>
        <Select name="sortOrder" defaultValue={sortOrder}>
          <SelectTrigger id="search-sort-order" aria-label="Thứ tự sắp xếp" className="h-10 rounded-xl text-sm">
            <SelectValue placeholder="Chọn thứ tự" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Giảm dần</SelectItem>
            <SelectItem value="asc">Tăng dần</SelectItem>
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}
