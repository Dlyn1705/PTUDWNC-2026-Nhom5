import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-semibold uppercase tracking-widest text-primary">
        403
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-foreground">
        Truy cập bị từ chối
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Tài khoản của bạn không có quyền mở khu vực này.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
