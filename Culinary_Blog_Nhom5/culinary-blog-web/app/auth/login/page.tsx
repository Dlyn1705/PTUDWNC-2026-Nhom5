import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/LoginForm";
import { LoadingState } from "@/components/common/LoadingState";
import { Skeleton } from "@/components/common/Skeleton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Đăng nhập | Culinary Blog",
  description: "Đăng nhập vào tài khoản Culinary Blog.",
};

export default function LoginPage() {
  return (
    <main id="main-content" tabIndex={-1} className="register-shell">
      <section className="register-brand-panel" aria-label="Culinary Blog">
        <div className="brand-mark">CB</div>
        <p className="eyebrow">Culinary Blog</p>
        <h1>Chào mừng bạn trở lại bếp.</h1>
        <p className="brand-copy">
          Đăng nhập để lưu công thức yêu thích và tiếp tục chia sẻ những món ăn
          đáng nhớ.
        </p>
        <div className="recipe-stamp" aria-hidden="true">
          <span>EST.</span>
          <strong>2026</strong>
          <span>COOK · SHARE · TASTE</span>
        </div>
      </section>

      <section className="register-form-panel">
        <div className="form-heading">
          <p className="eyebrow text-primary">Mừng trở lại</p>
          <h2>Đăng nhập tài khoản</h2>
          <p>Nhập thông tin để tiếp tục hành trình cùng Culinary Blog.</p>
        </div>
        <Suspense fallback={
          <LoadingState label="Đang chuẩn bị biểu mẫu đăng nhập…" className="space-y-5">
            <Skeleton className="mx-auto h-28 w-40" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </LoadingState>
        }>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
