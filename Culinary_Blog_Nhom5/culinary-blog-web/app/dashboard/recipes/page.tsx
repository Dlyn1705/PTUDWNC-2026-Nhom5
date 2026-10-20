import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecipeStatusTable } from "@/components/dashboard/RecipeStatusTable";
import { auth } from "@/lib/auth";

export default async function DashboardRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const isAdmin = session?.user.role === "Admin";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Dashboard / Recipes</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Quản lý công thức</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? "Theo dõi và quản lý công thức của tất cả tác giả."
              : "Theo dõi bản nháp, xuất bản và lưu trữ công thức của bạn."}
          </p>
        </div>
        <Button asChild><Link href="/dashboard/recipes/new"><Plus className="size-4" /> Tạo công thức</Link></Button>
      </div>
      {params.deleted === "1" && (
        <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          Đã xóa công thức.
        </p>
      )}
      <RecipeStatusTable />
    </div>
  );
}
