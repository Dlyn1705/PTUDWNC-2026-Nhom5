"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorCorrelationId, reportRuntimeError } from "@/lib/logger";
import { ErrorState } from "./ErrorState";

export interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRuntimeError(error, typeof window === "undefined" ? undefined : window.location.pathname);
    this.props.onError?.(error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-4 py-12">
        <ErrorState
          title={this.props.title ?? "Không thể hiển thị nội dung"}
          description={this.props.description ?? "Đã xảy ra lỗi khi hiển thị khu vực này. Bạn có thể thử lại mà không cần tải lại toàn bộ trang."}
          correlationId={errorCorrelationId(this.state.error)}
          onRetry={this.reset}
          headingLevel="h2"
          focusOnMount
        />
      </div>
    );
  }
}

export default ErrorBoundary;
