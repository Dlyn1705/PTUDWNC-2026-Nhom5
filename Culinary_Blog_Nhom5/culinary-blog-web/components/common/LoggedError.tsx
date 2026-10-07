"use client";

import { useEffect } from "react";
import { errorCorrelationId, reportRuntimeError } from "@/lib/logger";

export function useErrorLog(error: Error): void {
  useEffect(() => { reportRuntimeError(error, window.location.pathname); }, [error]);
}

export default function LoggedError({ error, retry }: { error: Error; retry: () => void }) {
  useErrorLog(error);
  const correlationId = errorCorrelationId(error);
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Không thể tải trang</h1>
      <p className="mt-3">Đã xảy ra lỗi. Bạn có thể thử lại sau ít phút.</p>
      {correlationId && <p className="mt-2 text-sm">Mã hỗ trợ: {correlationId}</p>}
      <button onClick={retry} className="mt-6 rounded-lg border px-4 py-2">Thử lại</button>
    </div>
  );
}
