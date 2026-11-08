"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { SiteShell } from "@/components/layout/SiteShell";
import { RouteLoading } from "@/components/common/RouteLoading";
import { getCurrentUser, getProfileRecipeStats, updateProfile, uploadProfileAvatar, type UpdateProfile } from "@/lib/api/profileApi";
import { imageErrorMessage } from "@/lib/api/imageErrors";
import { toApiProblemError } from "@/lib/api/problemDetails";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import type { CurrentUser } from "@/types/auth";

function problemMessage(error: unknown) {
  const problem = toApiProblemError(error);
  if (problem.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (problem.status === 404) return "Không tìm thấy tài khoản. Vui lòng tải lại trang hoặc liên hệ quản trị viên.";
  if (problem.status === 409) return "Hồ sơ vừa thay đổi hoặc chưa thể cập nhật. Vui lòng kiểm tra và thử lại.";
  if (problem.status === 422) return "Thông tin chưa hợp lệ. Vui lòng kiểm tra các trường được đánh dấu.";
  return "Không thể cập nhật hồ sơ. Vui lòng thử lại.";
}

function ProfileForm({ profile }: { profile: CurrentUser }) {
  const [values, setValues] = useState<UpdateProfile>({
    displayName: profile.displayName, bio: profile.bio ?? "", avatarUrl: profile.avatarUrl ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const queryClient = useQueryClient();
  const avatarUpload = useMutation({ mutationFn: uploadProfileAvatar, onSuccess: (updated) => {
    queryClient.setQueryData(["profile", updated.id], updated);
    useAuthStore.getState().updateUser(updated);
    setValues(current => ({ ...current, avatarUrl: updated.avatarUrl ?? "" }));
    setError(null); setFieldErrors({});
    toast.success("Đã cập nhật ảnh đại diện.");
  }, onError: cause => {
    setError(imageErrorMessage(cause));
    requestAnimationFrame(() => feedbackRef.current?.focus());
  } });
  const mutation = useMutation({ mutationFn: updateProfile, onSuccess: (updated) => {
    queryClient.setQueryData(["profile", updated.id], updated);
    useAuthStore.getState().updateUser(updated);
    setValues({ displayName: updated.displayName, bio: updated.bio ?? "", avatarUrl: updated.avatarUrl ?? "" });
    setError(null); setSaved(true); setFieldErrors({});
    toast.success("Đã cập nhật hồ sơ.");
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }, onError: (cause) => {
    const problem = toApiProblemError(cause);
    setSaved(false);
    setError(problemMessage(cause));
    if (problem.status === 422) {
      const errors: Record<string, string> = {};
      for (const [key, messages] of Object.entries(problem.errors)) {
        const field = key.toLowerCase();
        if (["displayname", "bio", "avatarurl"].includes(field)) errors[field] = messages[0];
      }
      setFieldErrors(errors);
    }
    toast.error(problemMessage(cause));
    requestAnimationFrame(() => feedbackRef.current?.focus());
  } });

  const setField = (field: keyof UpdateProfile, value: string) => {
    setSaved(false);
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field.toLowerCase()]: "" }));
  };
  const inputClass = "field-input mt-1 w-full";
  return <form className="space-y-4" noValidate onSubmit={(event) => {
    event.preventDefault(); setError(null); setSaved(false);
    const errors: Record<string, string> = {};
    if (values.displayName.trim().length < 2 || values.displayName.length > 100) errors.displayname = "Tên hiển thị cần từ 2 đến 100 ký tự.";
    if (values.bio.length > 1000) errors.bio = "Giới thiệu tối đa 1000 ký tự.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) { requestAnimationFrame(() => feedbackRef.current?.focus()); return; }
    mutation.mutate(values);
  }}>
    <p ref={feedbackRef} tabIndex={-1} role={error ? "alert" : "status"}
      className={`text-sm focus:outline-none ${error || Object.keys(fieldErrors).length ? "text-destructive" : "text-foreground"}`}>
      {error ?? (Object.keys(fieldErrors).length ? "Vui lòng kiểm tra thông tin hồ sơ." : saved ? "Đã cập nhật hồ sơ." : "")}
    </p>
    <div className="flex flex-wrap items-center gap-4">
      {profile.avatarUrl ? <Image src={profile.avatarUrl} alt={`Ảnh đại diện của ${profile.displayName}`}
        width={88} height={88} unoptimized className="h-22 w-22 rounded-full object-cover" />
        : <div role="img" aria-label="Chưa có ảnh đại diện" className="flex h-22 w-22 items-center justify-center rounded-full bg-muted text-2xl font-semibold">{profile.displayName.charAt(0).toLocaleUpperCase("vi")}</div>}
      <div><p className="font-semibold">{profile.displayName}</p>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        <p className="text-sm text-muted-foreground">Vai trò: {profile.roles.filter(role => role === "Author" || role === "Admin").join(", ")}</p>
        <p className="text-sm text-muted-foreground">Ngày tham gia: {new Date(profile.createdAt).toLocaleDateString("vi-VN")}</p></div>
    </div>
    <div><label htmlFor="profile-display-name" className="field-label">Tên hiển thị</label>
      <input id="profile-display-name" className={inputClass} maxLength={100} required value={values.displayName}
        aria-invalid={!!fieldErrors.displayname} aria-describedby={fieldErrors.displayname ? "profile-name-error" : undefined}
        onChange={(event) => setField("displayName", event.target.value)} />
      {fieldErrors.displayname && <p id="profile-name-error" className="text-sm text-destructive">{fieldErrors.displayname}</p>}</div>
    <div><label htmlFor="profile-bio" className="field-label">Giới thiệu</label>
      <textarea id="profile-bio" className={inputClass} rows={4} maxLength={1000} value={values.bio}
        aria-invalid={!!fieldErrors.bio} aria-describedby={fieldErrors.bio ? "profile-bio-error" : undefined}
        onChange={(event) => setField("bio", event.target.value)} />
      {fieldErrors.bio && <p id="profile-bio-error" className="text-sm text-destructive">{fieldErrors.bio}</p>}</div>
    <div><label htmlFor="profile-avatar" className="field-label">Ảnh đại diện</label>
      <input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp,image/avif"
        className={inputClass} disabled={avatarUpload.isPending || mutation.isPending}
        onChange={event => { const file = event.target.files?.[0]; if (file) avatarUpload.mutate(file); event.target.value = ""; }} />
      <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG, WebP hoặc AVIF; tối đa 5 MiB. Ảnh được lưu ngay sau khi chọn.</p>
      {avatarUpload.isPending && <p role="status" className="text-sm">Đang tải ảnh lên…</p>}</div>
    <button type="submit" className="submit-button" disabled={mutation.isPending || avatarUpload.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu hồ sơ"}</button>
  </form>;
}

function ProfileContent() {
  const { user } = useAuth();
  const profile = useQuery({ queryKey: ["profile", user?.id], queryFn: getCurrentUser,
    enabled: !!user?.id, retry: false, staleTime: 30_000 });
  const stats = useQuery({ queryKey: ["profile-recipe-stats", user?.id], queryFn: getProfileRecipeStats,
    enabled: !!user?.id, retry: false, staleTime: 30_000 });
  if (profile.isPending) return <RouteLoading variant="form" label="Đang tải hồ sơ…" />;
  if (profile.isError) return <div className="page-container py-10" role="alert">
    <h1 className="text-2xl font-semibold">Không thể tải hồ sơ</h1>
    <p className="mt-2">{problemMessage(profile.error)}</p>
    <button className="submit-button mt-4" onClick={() => profile.refetch()} disabled={profile.isFetching}>Thử lại</button>
  </div>;
  return <div className="page-container max-w-5xl py-8">
    <Link href="/" className="text-sm text-primary hover:underline">← Trang chủ</Link>
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section aria-labelledby="profile-title" className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-10">
        <h1 id="profile-title" className="mb-6 font-display text-2xl font-bold">Hồ sơ của tôi</h1>
        <ProfileForm key={profile.data.id} profile={profile.data} />
        <dl className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          <div className="rounded-xl bg-surface p-4"><dt className="text-sm text-muted-foreground">Công thức đã tạo</dt>
            <dd className="mt-1 text-2xl font-bold">{stats.data?.created ?? (stats.isError ? "Chưa xác định" : "…")}</dd></div>
          <div className="rounded-xl bg-surface p-4"><dt className="text-sm text-muted-foreground">Công thức đã xuất bản</dt>
            <dd className="mt-1 text-2xl font-bold">{stats.data?.published ?? (stats.isError ? "Chưa xác định" : "…")}</dd></div>
        </dl>
        {stats.isError && <button type="button" className="mt-3 text-sm text-primary underline" onClick={() => stats.refetch()}>Tải lại thống kê</button>}
      </section>
      <aside aria-labelledby="password-title" className="h-fit rounded-3xl border border-border bg-surface p-6">
        <h2 id="password-title" className="font-display text-lg font-semibold">Đổi mật khẩu</h2>
        <ChangePasswordForm />
      </aside>
    </div>
  </div>;
}

export default function ProfilePage() {
  return <SiteShell><AuthGuard roles={["Author", "Admin"]}><ProfileContent /></AuthGuard></SiteShell>;
}
