"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole, LogIn, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UnauthorizedStateMode = "unauthenticated" | "forbidden";

export interface UnauthorizedStateProps {
  mode: UnauthorizedStateMode;
  title?: string;
  description?: string;
  loginHref?: string;
  returnHref?: string;
  action?: ReactNode;
  className?: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4";
  focusOnMount?: boolean;
}

export function UnauthorizedState({
  mode,
  title = mode === "unauthenticated" ? "Bạn cần đăng nhập" : "Bạn không có quyền truy cập",
  description = mode === "unauthenticated"
    ? "Vui lòng đăng nhập để tiếp tục tới nội dung này."
    : "Tài khoản hiện tại không được cấp quyền mở khu vực này.",
  loginHref = "/auth/login",
  returnHref = "/",
  action,
  className,
  headingLevel = "h1",
  focusOnMount = false,
}: UnauthorizedStateProps) {
  const Heading = headingLevel;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-border bg-card p-6 text-center shadow-soft sm:p-8",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LockKeyhole className="size-6" aria-hidden="true" />
      </div>
      <Heading
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-display text-xl font-bold text-foreground sm:text-2xl"
      >
        {title}
      </Heading>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {mode === "unauthenticated" ? (
          <Button asChild className="gap-2 rounded-xl">
            <Link href={loginHref}>
              <LogIn className="size-4" aria-hidden="true" />
              Đăng nhập
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="gap-2 rounded-xl">
            <Link href={returnHref}>
              <Undo2 className="size-4" aria-hidden="true" />
              Quay lại trang chủ
            </Link>
          </Button>
        )}
        {action}
      </div>
    </section>
  );
}

export default UnauthorizedState;
