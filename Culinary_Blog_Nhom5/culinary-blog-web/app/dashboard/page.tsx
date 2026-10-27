import Link from "next/link";
import { BookOpen, FolderTree, Plus, UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "Admin";
  const displayName = session?.user.name ?? session?.user.email ?? "thành viên";

  return (
    <div className="page-container max-w-6xl space-y-8 py-10">
      <header className="rounded-3xl border border-border bg-card p-7 shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-primary">
          <UserRound className="size-4" />
          <span>{isAdmin ? "Quản trị viên" : "Tác giả"}</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
          Xin chào, {displayName}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {isAdmin
            ? "Bạn đang dùng dashboard chung với quyền xem và quản lý công thức của tất cả tác giả."
            : "Quản lý công thức của bạn, tiếp tục bản nháp hoặc bắt đầu một món ăn mới."}
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2" aria-label="Tác vụ dashboard">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <BookOpen className="size-6 text-primary" />
          <h2 className="mt-4 font-display text-xl font-semibold">Quản lý công thức</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdmin ? "Xem công thức của mọi tác giả và điều phối trạng thái bài viết." : "Xem và điều phối trạng thái các công thức do bạn tạo."}
          </p>
          <Button asChild className="mt-5">
            <Link href="/dashboard/recipes">Mở danh sách công thức</Link>
          </Button>
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <Plus className="size-6 text-primary" />
          <h2 className="mt-4 font-display text-xl font-semibold">Tạo công thức mới</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dùng trình biên soạn chung để nhập nội dung, nguyên liệu, các bước và hình ảnh.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/dashboard/recipes/new">Bắt đầu biên soạn</Link>
          </Button>
        </article>

        {isAdmin && (
          <article className="rounded-2xl border border-primary/20 bg-primary/5 p-6 md:col-span-2">
            <FolderTree className="size-6 text-primary" />
            <h2 className="mt-4 font-display text-xl font-semibold">Quản trị danh mục</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Đây là khu vực riêng của Admin để tạo, sửa và xóa danh mục.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/dashboard/categories">Quản lý danh mục</Link>
            </Button>
          </article>
        )}
      </section>
    </div>
  );
}
