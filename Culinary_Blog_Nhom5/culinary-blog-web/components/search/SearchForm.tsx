"use client";

import { useEffect, useRef, useTransition, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/** One form owns navigation so Enter cancels pending debounce and preserves every filter. */
export function SearchForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const lastUrl = useRef("");
  const composing = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function navigate(form: HTMLFormElement) {
    cancel();
    if (!form.reportValidity()) return;
    const query = new URLSearchParams();
    new FormData(form).forEach((value, name) => { if (typeof value === "string" && value.trim()) query.set(name, value.trim()); });
    query.set("page", "1");
    if (query.get("sortBy") === "relevance") query.set("sortOrder", "desc");
    const url = `/search?${query}`;
    if (url === lastUrl.current) return;
    lastUrl.current = url;
    startTransition(() => router.push(url, { scroll: false }));
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate(event.currentTarget); }
  return <form action="/search" method="get" className={className} onSubmit={submit} aria-busy={pending}
    onChange={(event) => {
      cancel();
      const input = event.target;
      if (composing.current) return;
      if (!(input instanceof HTMLInputElement) || input.name !== "q") return;
      if (input.value.trim().length === 1 || input.value.length > 100) return;
      const form = event.currentTarget;
      timer.current = setTimeout(() => navigate(form), 400);
    }}
    onCompositionStart={() => { composing.current = true; cancel(); }}
    onCompositionEnd={(event) => { composing.current = false; const form = event.currentTarget; cancel(); timer.current = setTimeout(() => navigate(form), 400); }}>
    {children}
    <span role="status" className="sr-only">{pending ? "Đang tìm kiếm công thức" : ""}</span>
  </form>;
}
