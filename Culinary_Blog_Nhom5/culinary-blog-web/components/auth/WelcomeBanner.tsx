import Link from "next/link";

export function WelcomeBanner() {
  return (
    <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <p className="font-semibold">Chào mừng bạn đến với Culinary Blog!</p>
      <p className="mt-1">
        Tài khoản đã được tạo và bạn đã đăng nhập. Bạn có thể chia sẻ công thức ngay.
        Email chào mừng có thể đến sau; bạn không cần chờ thư để sử dụng tài khoản.
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
