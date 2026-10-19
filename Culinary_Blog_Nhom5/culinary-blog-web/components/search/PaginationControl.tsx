import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PaginationControl({ page, totalPages, href }: { page: number; totalPages: number; href: (page: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Phân trang">
      <Button asChild={page > 1} variant="outline" disabled={page <= 1}>{page > 1 ? <Link href={href(page - 1)}>Trang trước</Link> : <span>Trang trước</span>}</Button>
      <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
      <Button asChild={page < totalPages} variant="outline" disabled={page >= totalPages}>{page < totalPages ? <Link href={href(page + 1)}>Trang sau</Link> : <span>Trang sau</span>}</Button>
    </nav>
  );
}
