import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="mt-3 font-display text-4xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-3 text-muted-foreground">
        Nội dung có thể đã được di chuyển hoặc không còn tồn tại.
      </p>
      <Button asChild className="mt-7 rounded-full">
        <Link href="/">Về trang chủ</Link>
      </Button>
    </main>
  );
}
