import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function EditRecipeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login?callbackUrl=/dashboard/recipes");
  if (!session.user.roles?.some(role => role === "Author" || role === "Admin"))
    return <div role="alert" className="p-8">Chỉ tác giả hoặc quản trị viên được cập nhật công thức.</div>;
  return children;
}
