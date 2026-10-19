export default function RecipeDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="aspect-[16/7] rounded-3xl bg-muted" />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="h-80 rounded-2xl bg-muted lg:col-span-5" />
        <div className="h-96 rounded-2xl bg-muted lg:col-span-7" />
      </div>
    </div>
  );
}
