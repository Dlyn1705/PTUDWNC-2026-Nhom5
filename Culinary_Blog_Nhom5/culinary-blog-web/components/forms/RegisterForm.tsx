"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import apiClient from "@/lib/api/axios";
import { registerSchema, type RegisterFormData } from "@/lib/validations/auth";
import type { AuthResponse, ProblemDetails } from "@/types/auth";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-2 text-xs font-medium text-red-700">{message}</p>
  ) : null;
}

export function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      const response = await apiClient.post<AuthResponse>(
        "/api/v1/auth/register",
        data,
      );
      if (response.status === 201) {
        router.push("/login?registered=true");
      }
    } catch (error: unknown) {
      if (!error || typeof error !== "object" || !("response" in error)) {
        setServerError("Không thể kết nối đến máy chủ. Vui lòng thử lại sau.");
        return;
      }

      const response = (
        error as { response?: { status?: number; data?: ProblemDetails } }
      ).response;
      const problem = response?.data;
      if (response?.status === 409 && problem?.code === "AUTH_EMAIL_EXISTS") {
        setError("email", {
          type: "server",
          message: problem.detail ?? "Email này đã được sử dụng.",
        });
        return;
      }

      if (response?.status === 422 && problem?.errors) {
        Object.entries(problem.errors).forEach(([field, messages]) => {
          const fieldMap: Record<string, keyof RegisterFormData> = {
            Email: "email",
            DisplayName: "displayName",
            Password: "password",
            ConfirmPassword: "confirmPassword",
          };
          const target =
            fieldMap[field] ??
            fieldMap[field.charAt(0).toUpperCase() + field.slice(1)];
          if (target && messages[0]) {
            setError(target, { type: "server", message: messages[0] });
          }
        });
        return;
      }

      setServerError(
        problem?.detail ?? "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="displayName" className="field-label">
          Họ và tên
        </label>
        <input
          id="displayName"
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          {...register("displayName")}
          className={`field-input ${errors.displayName ? "field-input-error" : ""}`}
        />
        <FieldError message={errors.displayName?.message} />
      </div>

      <div>
        <label htmlFor="email" className="field-label">
          Địa chỉ email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="chef@culinaryblog.vn"
          {...register("email")}
          className={`field-input ${errors.email ? "field-input-error" : ""}`}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="field-label">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            {...register("password")}
            className={`field-input ${errors.password ? "field-input-error" : ""}`}
          />
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="field-label">
            Nhập lại mật khẩu
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            {...register("confirmPassword")}
            className={`field-input ${errors.confirmPassword ? "field-input-error" : ""}`}
          />
          <FieldError message={errors.confirmPassword?.message} />
        </div>
      </div>

      <button type="submit" disabled={isSubmitting} className="submit-button">
        {isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
      </button>

      <p className="text-center text-sm text-stone-600">
        Đã có tài khoản?{" "}
        <Link
          href="/login"
          className="font-semibold text-orange-700 underline-offset-4 hover:underline"
        >
          Đăng nhập ngay
        </Link>
      </p>
    </form>
  );
}
