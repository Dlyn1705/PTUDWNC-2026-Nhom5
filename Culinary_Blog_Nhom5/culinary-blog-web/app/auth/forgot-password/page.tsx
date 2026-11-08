import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Quên mật khẩu | Culinary Blog" };

export default function ForgotPasswordPage() {
  return <main className="register-shell"><section className="register-form-panel mx-auto max-w-xl">
    <div className="form-heading"><h1>Quên mật khẩu</h1><p>Nhập email để nhận liên kết đặt lại mật khẩu.</p></div>
    <ForgotPasswordForm />
  </section></main>;
}
