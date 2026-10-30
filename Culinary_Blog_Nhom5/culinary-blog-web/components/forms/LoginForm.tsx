"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { WelcomeBanner } from "@/components/auth/WelcomeBanner";
import { LoginMascot, type MascotMood } from "@/components/forms/LoginMascot";
import { PasswordField } from "@/components/forms/PasswordField";
import { loginSchema, type LoginFormData } from "@/lib/validations/auth";
import { getApiErrorMessage, toApiProblemError } from "@/lib/api/problemDetails";
import { useAuth } from "@/hooks/useAuth";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-2 text-xs font-medium text-destructive">{message}</p>
  ) : null;
}

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [mascotMood, setMascotMood] = useState<MascotMood>("idle");
  const [emailProgress, setEmailProgress] = useState(0);
  const registered = searchParams.get("registered") === "true";
  const sessionExpired =
    searchParams.get("reason") === "session-expired" ||
    searchParams.get("sessionExpired") === "true";
  const requestedCallback = searchParams.get("callbackUrl");
  const callbackUrl =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/";

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const emailRegistration = register("email");

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setMascotMood("password");

    try {
      await login({ email: data.email, password: data.password });
      setMascotMood("success");
      router.replace(callbackUrl);
    } catch (error) {
      setMascotMood("error");
      const problem = toApiProblemError(error);
      if (problem.status === 401) {
        setError("password", { type: "server", message: "Email hoặc mật khẩu không chính xác." });
      } else {
        setServerError(getApiErrorMessage(problem, "Không thể đăng nhập. Vui lòng thử lại sau."));
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <LoginMascot mood={mascotMood} emailProgress={emailProgress} />
      {registered && <WelcomeBanner />}
      {sessionExpired && (
        <div
          role="status"
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.
        </div>
      )}
      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
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
          placeholder="chef@gmail.com"
          {...emailRegistration}
          onFocus={() => setMascotMood("email")}
          onBlur={(event) => {
            setMascotMood("idle");
            emailRegistration.onBlur(event);
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setEmailProgress(Math.min(event.target.value.length / 32, 1));
            emailRegistration.onChange(event);
          }}
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
            className="mb-2 text-xs font-semibold text-primary hover:underline"
          >
            Quên mật khẩu?
          </button>
        </div>
        <PasswordField
          id="login-password"
          autoComplete="current-password"
          placeholder="Nhập mật khẩu"
          registration={register("password")}
          onFocus={() => setMascotMood("password")}
          onBlur={() => setMascotMood("idle")}
          onVisibilityChange={(visible) => setMascotMood(visible ? "peek" : "password")}
          className={`field-input ${errors.password ? "field-input-error" : ""}`}
        />
        <FieldError message={errors.password?.message} />
      </div>

      <button type="submit" disabled={isSubmitting} className="submit-button">
        {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>

      <div className="flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>Hoặc tiếp tục với</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleLoginButton callbackUrl={callbackUrl} />

      <p className="text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}
        <Link
          href="/auth/register"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Tạo tài khoản
        </Link>
      </p>
    </form>
  );
}
