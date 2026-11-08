"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "./ErrorState";

/** Expected server request failures use serializable props, not an Error instance. */
export function RouteRequestError({ title, description, correlationId, canRetry = true }: {
  title: string; description: string; correlationId?: string; canRetry?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return <ErrorState title={title} description={description} correlationId={correlationId}
    onRetry={canRetry ? () => startTransition(() => router.refresh()) : undefined} isRetrying={isPending} />;
}
