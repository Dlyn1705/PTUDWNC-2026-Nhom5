import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { auth } from "@/lib/auth";

export const metadata = { title: "Hồ sơ — Culinary Blog" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user || session.error) redirect("/auth/login?callbackUrl=/profile");

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-primary hover:underline">← Trang chủ</Link>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-10">
        <div className="mb-8 flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-7" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold">Hồ sơ của tôi</h1>
            <p className="text-sm text-muted-foreground">Thông tin tài khoản đang đăng nhập</p>
          </div>
        </div>
        <dl className="space-y-5">
          <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Tên hiển thị</dt><dd className="mt-1 text-base">{session.user.name || "Chưa cập nhật"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Email</dt><dd className="mt-1 text-base">{session.user.email || "Chưa cập nhật"}</dd></div>
          <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Vai trò</dt><dd className="mt-1 text-base">{session.user.role || "Người dùng"}</dd></div>
        </dl>
      </section>
    </main>
  );
}
