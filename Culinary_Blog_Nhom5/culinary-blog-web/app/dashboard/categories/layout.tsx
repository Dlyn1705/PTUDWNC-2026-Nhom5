import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminCategoriesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session) {
    redirect("/login?callbackUrl=/dashboard/categories");
  }

  if (session.user.role !== "Admin") {
    redirect("/dashboard/recipes");
  }

  return children;
}
