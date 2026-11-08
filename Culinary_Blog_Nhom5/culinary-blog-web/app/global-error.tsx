"use client";
import LoggedError from "@/components/common/LoggedError";
import "./globals.css";
export default function GlobalError({ error, retry }: { error: Error; retry: () => void }) {
  return <html lang="vi"><body className="bg-background text-foreground">
    <title>Không thể tải trang — Culinary Blog</title>
    <LoggedError error={error} retry={retry} standalone />
    {/* A document navigation also recovers when the root router tree has failed. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <p className="pb-8 text-center"><a href="/" className="text-primary underline focus-visible:outline-2">Về trang chủ</a></p>
  </body></html>;
}
