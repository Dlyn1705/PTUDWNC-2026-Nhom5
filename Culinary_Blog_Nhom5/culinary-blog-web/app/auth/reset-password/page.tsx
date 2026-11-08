import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Đặt lại mật khẩu | Culinary Blog" };

export default function ResetPasswordPage() {
  return <main className="register-shell"><section className="register-form-panel mx-auto max-w-xl">
    <div className="form-heading"><h1>Đặt lại mật khẩu</h1><p>Liên kết có hiệu lực trong 30 phút và chỉ dùng một lần.</p></div>
    <Suspense fallback={<p>Đang tải…</p>}><ResetPasswordForm /></Suspense>
  </section></main>;
}
