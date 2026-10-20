"use client";
import LoggedError, { type LoggedErrorProps } from "@/components/common/LoggedError";
export default function Error(props: LoggedErrorProps) {
  return <LoggedError {...props} title="Không thể tải danh mục" />;
}
