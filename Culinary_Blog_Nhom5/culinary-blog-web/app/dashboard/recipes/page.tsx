import { DashboardRecipesContent } from "@/components/dashboard/DashboardRecipesContent";

export default async function DashboardRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const params = await searchParams;
  return <DashboardRecipesContent deleted={params.deleted === "1"} />;
}
