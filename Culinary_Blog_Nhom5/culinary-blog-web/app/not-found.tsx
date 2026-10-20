import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-12">
    <EmptyState headingLevel="h1" title="404 — Không tìm thấy trang"
      description="Nội dung có thể đã được di chuyển hoặc không còn tồn tại."
      action={<Button asChild><Link href="/">Về trang chủ</Link></Button>} />
  </main>;
}
