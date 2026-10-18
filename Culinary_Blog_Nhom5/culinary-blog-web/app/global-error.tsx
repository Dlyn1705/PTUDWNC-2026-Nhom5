"use client";

import LoggedError from "@/components/common/LoggedError";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return <html lang="vi"><body><LoggedError error={error} retry={reset} /></body></html>;
}
