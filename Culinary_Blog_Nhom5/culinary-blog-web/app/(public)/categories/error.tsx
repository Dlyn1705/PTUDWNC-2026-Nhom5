"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CategoriesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CategoriesError({ reset }: CategoriesErrorProps) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-3xl items-center px-4 py-16 sm:px-6">
      <div className="w-full rounded-3xl border border-destructive/20 bg-card p-8 text-center shadow-soft sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-7" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-foreground">
          Không thể tải danh mục
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Giao diện chưa kết nối được với máy chủ dữ liệu. Hãy kiểm tra backend và thử lại.
        </p>
        <Button onClick={reset} className="mt-6 gap-2 rounded-full">
          <RefreshCw className="size-4" />
          Thử lại
        </Button>
      </div>
    </div>
  );
}
