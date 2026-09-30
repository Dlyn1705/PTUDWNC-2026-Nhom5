"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import apiClient from "@/lib/api/axios";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";
import type { AuthResponse, ProblemDetails } from "@/types/auth";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-2 text-xs font-medium text-red-700">{message}</p>
  ) : null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const registered = searchParams.get("registered") === "true";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    try {
      const response = await apiClient.post<AuthResponse>(
        "/api/v1/auth/login",
        data,
      );
      if (response.status === 200) {
        window.localStorage.setItem(
          "culinary_access_token",
          response.data.accessToken,
        );
        window.localStorage.setItem(
          "culinary_refresh_token",
          response.data.refreshToken,
        );
        router.push("/");
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
      if (response?.status === 422 && problem?.errors) {
        Object.entries(problem.errors).forEach(([field, messages]) => {
          const target = field.toLowerCase() as keyof LoginFormData;
          if ((target === "email" || target === "password") && messages[0]) {
            setError(target, { type: "server", message: messages[0] });
          }
        });
        return;
      }
      if (response?.status === 401) {
        setError("password", {
          type: "server",
          message: "Email hoặc mật khẩu không chính xác.",
        });
        return;
      }
      if (response?.status === 423) {
        setServerError(
          problem?.detail ??
            "Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.",
        );
        return;
      }
      if (response?.status === 429) {
        setServerError(
          "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ một phút rồi thử lại.",
        );
        return;
      }
      setServerError(
        problem?.detail ?? "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {registered && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Tài khoản đã được tạo. Hãy đăng nhập để tiếp tục.
        </div>
      )}
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="login-email" className="field-label">
          Địa chỉ email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="chef@culinaryblog.vn"
          {...register("email")}
          className={`field-input ${errors.email ? "field-input-error" : ""}`}
        />
        <FieldError message={errors.email?.message} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="login-password" className="field-label">
            Mật khẩu
          </label>
          <button
            type="button"
            className="mb-2 text-xs font-semibold text-orange-700 hover:underline"
          >
            Quên mật khẩu?
          </button>
        </div>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          {...register("password")}
          className={`field-input ${errors.password ? "field-input-error" : ""}`}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <button type="submit" disabled={isSubmitting} className="submit-button">
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>

      <p className="text-center text-sm text-stone-600">
        Chưa có tài khoản?{" "}
        <Link
          href="/register"
          className="font-semibold text-orange-700 underline-offset-4 hover:underline"
        >
          Tạo tài khoản
        </Link>
      </p>
    </form>
  );
}
