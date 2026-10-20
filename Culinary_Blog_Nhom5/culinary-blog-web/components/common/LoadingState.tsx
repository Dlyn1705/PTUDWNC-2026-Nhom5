import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";

export interface LoadingStateProps {
  label?: string;
  children?: React.ReactNode;
  className?: string;
}

export function LoadingState({
  label = "Đang tải dữ liệu…",
  children,
  className,
}: LoadingStateProps) {
  return (
    <div
      aria-busy="true"
      className={cn("w-full space-y-4", className)}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
      {children ? (
        children
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-48 rounded-lg" />
          <Skeleton className="h-3 w-32 rounded-lg" />
        </div>
      )}
    </div>
  );
}

export default LoadingState;
