import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/permissions";

export default async function AdminCategoriesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session || session.error) {
    redirect("/login?callbackUrl=/dashboard/categories");
  }

  if (!hasRole(session.user, "Admin")) {
    redirect("/dashboard/recipes");
  }

  return children;
}
