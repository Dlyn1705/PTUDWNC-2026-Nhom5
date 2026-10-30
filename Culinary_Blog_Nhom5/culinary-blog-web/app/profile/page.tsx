"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SiteShell } from "@/components/layout/SiteShell";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { user, isAdmin, isAuthor } = useAuth();

  return (
    <SiteShell>
      <AuthGuard>
        <div className="page-container section-spacing max-w-5xl">
          <Link href="/" className="text-sm text-primary hover:underline">← Trang chủ</Link>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section aria-labelledby="profile-title" className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-10">
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                  <UserRound className="size-8" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Account</p>
                  <h1 id="profile-title" className="font-display text-2xl font-bold sm:text-3xl">Hồ sơ của tôi</h1>
                  <p className="text-sm text-muted-foreground">Thông tin tài khoản đang đăng nhập</p>
                </div>
              </div>
              <dl className="grid gap-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Tên hiển thị</dt>
                  <dd className="mt-1 break-words text-base font-medium">{user?.displayName || "Chưa cập nhật"}</dd>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Email</dt>
                  <dd className="mt-1 break-words text-base font-medium">{user?.email || "Chưa cập nhật"}</dd>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4 sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Vai trò</dt>
                  <dd className="mt-1 inline-flex rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
                    {isAdmin ? "Admin" : isAuthor ? "Author" : "Người dùng"}
                  </dd>
                </div>
              </dl>
            </section>
            <aside aria-labelledby="profile-actions-title" className="h-fit rounded-3xl border border-border bg-surface p-6">
              <h2 id="profile-actions-title" className="font-display text-lg font-semibold">Tài khoản</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Các biểu mẫu cập nhật hồ sơ và đổi mật khẩu sẽ dùng cùng visual system này khi API profile được bàn giao.</p>
              <Link href="/dashboard" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Mở bảng điều khiển →</Link>
            </aside>
          </div>
        </div>
      </AuthGuard>
    </SiteShell>
  );
}
