"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { resetPassword } from "@/lib/api/authApi";
import { resetPasswordSchema, type ResetPasswordFormData } from "@/lib/validations/auth";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  if (!email || !token) return <p role="alert">Liên kết không hợp lệ. <Link href="/auth/forgot-password">Yêu cầu liên kết mới</Link>.</p>;
  return <form noValidate className="space-y-5" onSubmit={handleSubmit(async ({ newPassword }) => {
    setError(null);
    try {
      await resetPassword(email, token, newPassword);
      router.replace("/auth/login?passwordReset=true");
    } catch {
      setError("Liên kết đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu liên kết mới.");
    }
  })}>
    <label htmlFor="reset-password" className="field-label">Mật khẩu mới</label>
    <input id="reset-password" type="password" autoComplete="new-password" className="field-input" {...register("newPassword")} />
    {errors.newPassword && <p role="alert" className="text-sm text-destructive">{errors.newPassword.message}</p>}
    <label htmlFor="reset-confirm" className="field-label">Xác nhận mật khẩu</label>
    <input id="reset-confirm" type="password" autoComplete="new-password" className="field-input" {...register("confirmPassword")} />
    {errors.confirmPassword && <p role="alert" className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="submit" disabled={isSubmitting} className="submit-button">Đặt lại mật khẩu</button>
  </form>;
}
