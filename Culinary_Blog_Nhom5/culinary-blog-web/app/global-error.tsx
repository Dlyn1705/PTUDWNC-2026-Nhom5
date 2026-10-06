"use client";

import LoggedError from "@/components/common/LoggedError";

export default function GlobalError({ error, retry }: { error: Error; retry: () => void }) {
  return <html lang="vi"><body><LoggedError error={error} retry={retry} /></body></html>;
}
