import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchInput({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={defaultValue} minLength={2} maxLength={100} aria-label="Từ khóa tìm kiếm" className="h-12 rounded-2xl pl-11" placeholder="Ví dụ: phở bò, bánh xèo..." />
      </div>
      <Button type="submit" className="h-12 rounded-2xl"><Search aria-hidden="true" className="size-4" /> Tìm kiếm</Button>
    </div>
  );
}
