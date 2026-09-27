import { redirect } from "next/navigation";

export default function DashboardRecipesPage() {
  redirect("/dashboard/recipes/new");
}
