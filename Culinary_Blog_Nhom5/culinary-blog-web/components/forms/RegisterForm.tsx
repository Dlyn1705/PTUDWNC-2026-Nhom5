"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { register as registerAccount } from "@/lib/api/authApi";
import { getApiErrorMessage, isApiProblemError, toApiProblemError } from "@/lib/api/problemDetails";
import { PasswordField } from "@/components/forms/PasswordField";
import {
  getPasswordStrength,
  registerSchema,
  type RegisterFormData,
} from "@/lib/validations/auth";

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
    control,
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
  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const passwordStrength = getPasswordStrength(passwordValue);

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      await registerAccount(data);
      router.push("/auth/login?registered=true");
    } catch (error: unknown) {
      const problem = toApiProblemError(error);
      if (isApiProblemError(problem) && problem.status === 409 && problem.code === "AUTH_EMAIL_EXISTS") {
        setError("email", {
          type: "server",
          message: getApiErrorMessage(problem, "Email này đã được sử dụng."),
        });
        return;
      }

      if (problem.status === 422) {
        let mapped = false;
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
            mapped = true;
            setError(target, { type: "server", message: messages[0] });
          }
        });
        if (mapped) {
          const unknown = Object.keys(problem.errors).some((field) => !["email", "displayName", "password", "confirmPassword"].includes(field.toLowerCase()));
          if (unknown) setError("root.server", { type: "server", message: getApiErrorMessage(problem) });
          return;
        }
      }

      setServerError(getApiErrorMessage(problem, "Đã có lỗi xảy ra. Vui lòng thử lại sau."));
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
          placeholder="chef@gmail.com"
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
          <PasswordField
            id="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            registration={register("password")}
            className={`field-input ${errors.password ? "field-input-error" : ""}`}
          />
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span id="password-strength-label" className="font-medium text-stone-600">
                Độ mạnh mật khẩu: {passwordStrength.label}
              </span>
              <span className="text-stone-500">Tối thiểu 8 ký tự</span>
            </div>
            <div
              role="meter"
              aria-labelledby="password-strength-label"
              aria-valuemin={0}
              aria-valuemax={6}
              aria-valuenow={passwordStrength.score}
              aria-valuetext={passwordStrength.label}
              className="flex h-1.5 gap-1"
            >
              {passwordStrength.criteria.map((criterion, index) => (
                <span
                  key={criterion.label}
                  className={`h-full flex-1 rounded-full ${
                    index < passwordStrength.score
                      ? passwordStrength.score <= 2
                        ? "bg-red-500"
                        : passwordStrength.score <= 4
                          ? "bg-amber-500"
                          : passwordStrength.score === 5
                            ? "bg-lime-600"
                            : "bg-green-600"
                      : "bg-stone-200"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <ul
              aria-label="Tiêu chí độ mạnh mật khẩu"
              className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-stone-500"
            >
              {passwordStrength.criteria.map((criterion) => (
                <li key={criterion.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={criterion.met ? "text-green-700" : "text-stone-400"}
                  >
                    {criterion.met ? "✓" : "○"}
                  </span>
                  <span className={criterion.met ? "text-stone-700" : ""}>
                    {criterion.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <FieldError message={errors.password?.message} />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="field-label">
            Nhập lại mật khẩu
          </label>
          <PasswordField
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            registration={register("confirmPassword")}
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
          href="/auth/login"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Đăng nhập ngay
        </Link>
      </p>
    </form>
  );
}
