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
    if (composing.current) return;
    const keyword = form.elements.namedItem("q") as HTMLInputElement | null;
    const trimmed = keyword?.value.trim() ?? "";
    keyword?.setCustomValidity(trimmed.length === 1 ? "Nhập ít nhất 2 ký tự để tìm kiếm." : "");
    for (const [minName, maxName, message] of [
      ["minCookTime", "maxCookTime", "Thời gian tối đa phải lớn hơn hoặc bằng tối thiểu."],
      ["minServings", "maxServings", "Khẩu phần tối đa phải lớn hơn hoặc bằng tối thiểu."],
    ]) {
      const min = form.elements.namedItem(minName) as HTMLInputElement | null;
      const max = form.elements.namedItem(maxName) as HTMLInputElement | null;
      max?.setCustomValidity(min?.value && max.value && Number(min.value) > Number(max.value) ? message : "");
    }
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
      // Clear a previous cross-field error before native submit validation runs.
      for (const name of ["q", "maxCookTime", "maxServings"]) {
        (event.currentTarget.elements.namedItem(name) as HTMLInputElement | null)?.setCustomValidity("");
      }
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
