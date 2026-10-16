import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CreateRecipeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/dashboard/recipes/new");
  const roles = session.user.roles ?? [];
  if (!roles.includes("Author") && !roles.includes("Admin")) {
    return <main className="p-8" role="alert">Chỉ tác giả hoặc quản trị viên được tạo công thức.</main>;
  }
  return children;
}
