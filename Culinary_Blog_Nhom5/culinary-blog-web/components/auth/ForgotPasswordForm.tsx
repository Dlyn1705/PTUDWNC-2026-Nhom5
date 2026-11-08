"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { forgotPassword } from "@/lib/api/authApi";
import { forgotPasswordSchema, type ForgotPasswordFormData } from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" },
  });
  return <form noValidate className="space-y-5" onSubmit={handleSubmit(async ({ email }) => {
    setError(false);
    try { await forgotPassword(email); setSent(true); }
    catch { setError(true); }
  })}>
    {sent ? <p role="status">Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi.</p> : <>
      <label htmlFor="forgot-email" className="field-label">Địa chỉ email</label>
      <input id="forgot-email" type="email" autoComplete="email" className="field-input" {...register("email")} />
      {errors.email && <p role="alert" className="text-sm text-destructive">{errors.email.message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">Không thể gửi yêu cầu. Vui lòng thử lại sau.</p>}
      <button type="submit" disabled={isSubmitting} className="submit-button">Gửi hướng dẫn</button>
    </>}
    <Link href="/auth/login" className="block text-center text-sm text-primary hover:underline">Trở về đăng nhập</Link>
  </form>;
}
