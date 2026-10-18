import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/LoginForm";

export const metadata: Metadata = {
  title: "Đăng nhập | Culinary Blog",
  description: "Đăng nhập vào tài khoản Culinary Blog.",
};

export default function LoginPage() {
  return (
    <main className="register-shell">
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
          <p className="eyebrow text-orange-700">Mừng trở lại</p>
          <h2>Đăng nhập tài khoản</h2>
          <p>Nhập thông tin để tiếp tục hành trình cùng Culinary Blog.</p>
        </div>
        <Suspense fallback={<div className="h-64" aria-hidden="true" />}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
