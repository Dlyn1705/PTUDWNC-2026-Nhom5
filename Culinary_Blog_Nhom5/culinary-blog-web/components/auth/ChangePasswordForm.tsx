"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
    if (!accessToken) return;
    try {
      await changePassword(currentPassword, newPassword, accessToken);
      window.location.replace("/auth/login?passwordChanged=true");
      useAuthStore.getState().clearSession();
    } catch (cause) {
      const problem = toApiProblemError(cause);
      if (problem.status === 422 && problem.errors.CurrentPassword) {
        setFieldError("currentPassword", { message: problem.errors.CurrentPassword[0] });
      } else setError("Không thể đổi mật khẩu. Vui lòng thử lại.");
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
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button type="submit" disabled={isSubmitting} className="submit-button">Đổi mật khẩu</button>
  </form>;
}
