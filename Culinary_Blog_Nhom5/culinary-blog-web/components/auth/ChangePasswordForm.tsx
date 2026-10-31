"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { changePassword } from "@/lib/api/authApi";
import { toApiProblemError } from "@/lib/api/problemDetails";
import { changePasswordSchema, type ChangePasswordFormData } from "@/lib/validations/auth";
import { useAuthStore } from "@/store/authStore";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  return <form noValidate className="mt-5 space-y-3" onSubmit={handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) { setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); return; }
    try {
      await changePassword(currentPassword, newPassword, accessToken);
      useAuthStore.getState().clearSession();
      toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      window.location.replace("/auth/login?passwordChanged=true");
    } catch (cause) {
      const problem = toApiProblemError(cause);
      if (problem.status === 422) {
        for (const [key, messages] of Object.entries(problem.errors)) {
          const field = key.toLowerCase();
          if (field === "currentpassword") setFieldError("currentPassword", { message: messages[0] });
          if (field === "newpassword") setFieldError("newPassword", { message: messages[0] });
        }
        setError("Vui lòng kiểm tra mật khẩu đã nhập.");
      } else if (problem.status === 401) setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      else if (problem.status === 404) setError("Không tìm thấy tài khoản.");
      else if (problem.status === 409) setError("Không thể đổi mật khẩu do xung đột. Vui lòng thử lại.");
      else setError("Không thể đổi mật khẩu. Vui lòng thử lại.");
    }
  })}>
    <label htmlFor="current-password" className="field-label">Mật khẩu hiện tại</label>
    <input id="current-password" type="password" autoComplete="current-password" className="field-input" {...register("currentPassword")} />
    {errors.currentPassword && <p role="alert" className="text-sm text-destructive">{errors.currentPassword.message}</p>}
    <label htmlFor="new-password" className="field-label">Mật khẩu mới</label>
    <input id="new-password" type="password" autoComplete="new-password" className="field-input" {...register("newPassword")} />
    {errors.newPassword && <p role="alert" className="text-sm text-destructive">{errors.newPassword.message}</p>}
    <label htmlFor="confirm-new-password" className="field-label">Xác nhận mật khẩu</label>
    <input id="confirm-new-password" type="password" autoComplete="new-password" className="field-input" {...register("confirmPassword")} />
    {errors.confirmPassword && <p role="alert" className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error} {error.includes("đăng nhập") && <Link className="underline" href="/auth/login">Đăng nhập</Link>}</p>}
    <button type="submit" disabled={isSubmitting} className="submit-button">{isSubmitting ? "Đang đổi…" : "Đổi mật khẩu"}</button>
  </form>;
}
