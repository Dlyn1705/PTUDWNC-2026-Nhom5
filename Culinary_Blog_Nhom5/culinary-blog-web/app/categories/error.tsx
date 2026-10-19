"use client";

import { useErrorLog } from "@/components/common/LoggedError";
import { ErrorState } from "@/components/common/ErrorState";
import { errorCorrelationId } from "@/lib/logger";

interface CategoriesErrorProps {
  error: Error & { digest?: string; correlationId?: string };
  retry?: () => void;
  reset?: () => void;
}

export default function CategoriesError({ error, retry, reset }: CategoriesErrorProps) {
  useErrorLog(error);
  const correlationId = errorCorrelationId(error) || error.correlationId;
  const handleRetry = retry ?? reset;
  const description = error.name === "ServerApiError" && error.message
    ? error.message
    : "Giao diện chưa kết nối được với máy chủ dữ liệu. Hãy kiểm tra backend và thử lại.";

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-3xl items-center px-4 py-16 sm:px-6">
      <ErrorState
        title="Không thể tải danh mục"
        description={description}
        correlationId={correlationId}
        onRetry={handleRetry}
        headingLevel="h1"
      />
    </div>
  );
}
