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
        <p className="eyebrow">Welcome back</p>
        <h1>Vào bếp thôi, câu chuyện đang chờ.</h1>
        <p className="brand-copy">
          Mở lại những công thức bạn yêu thích và tiếp tục chia sẻ hương vị của
          riêng mình.
        </p>
        <div className="recipe-stamp" aria-hidden="true">
          <span>EST.</span>
          <strong>2026</strong>
          <span>COOK · SHARE · TASTE</span>
        </div>
      </section>
      <section className="register-form-panel">
        <div className="form-heading">
          <p className="eyebrow text-orange-700">Chào mừng trở lại</p>
          <h2>Đăng nhập</h2>
          <p>Nhập thông tin để tiếp tục hành trình cùng Culinary Blog.</p>
        </div>
        <Suspense fallback={<div className="h-72" />}>
          <LoginForm />
        </Suspense>
        <p className="form-footnote">
          Tài khoản của bạn được bảo vệ bằng xác thực mật khẩu và giới hạn đăng
          nhập.
        </p>
      </section>
    </main>
  );
}
