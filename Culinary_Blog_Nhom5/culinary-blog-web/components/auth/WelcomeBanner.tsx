import Link from "next/link";

export function WelcomeBanner() {
  return (
    <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <p className="font-semibold">Chào mừng bạn đến với Culinary Blog!</p>
      <p className="mt-1">
        Tài khoản đã được tạo. Hãy đăng nhập để chia sẻ công thức đầu tiên.
        Email chào mừng có thể đến sau; bạn có thể đăng nhập ngay mà không cần chờ thư.
      </p>
      <p className="mt-1 text-muted-foreground">
        Email này chỉ để chào mừng, không phải bước xác minh hay kích hoạt tài khoản.
      </p>
      <Link href="/recipes" className="mt-2 inline-block font-semibold underline underline-offset-4">
        Khám phá công thức
      </Link>
    </div>
  );
}
