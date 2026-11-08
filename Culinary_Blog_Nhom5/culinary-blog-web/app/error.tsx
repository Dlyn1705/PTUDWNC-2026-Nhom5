"use client";
import LoggedError, { type LoggedErrorProps } from "@/components/common/LoggedError";
export default function RootError(props: LoggedErrorProps) {
  return <LoggedError {...props} standalone />;
}
