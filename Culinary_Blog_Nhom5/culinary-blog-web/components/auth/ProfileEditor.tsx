"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, KeyRound, LoaderCircle, Save, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  changeCurrentUserPassword,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  uploadCurrentUserAvatar,
  type CurrentUserProfile,
} from "@/lib/api/authApi";
import { toApiProblemError } from "@/lib/api/problemDetails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Notice = { tone: "success" | "error"; text: string };

function announceProfile(profile: CurrentUserProfile) {
  window.dispatchEvent(new CustomEvent("profile-updated", {
    detail: { name: profile.displayName, image: profile.avatarUrl },
  }));
}

export function ProfileEditor() {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<Notice | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUserProfile(controller.signal)
      .then(setProfile)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setProfileNotice({ tone: "error", text: toApiProblemError(error).message });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const updated = await updateCurrentUserProfile({
        displayName: profile.displayName,
        bio: profile.bio?.trim() ?? "",
      });
      setProfile(updated);
      announceProfile(updated);
      setProfileNotice({ tone: "success", text: "Đã cập nhật hồ sơ của bạn." });
    } catch (error) {
      setProfileNotice({ tone: "error", text: toApiProblemError(error).message });
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    setProfileNotice(null);
    if (file.size > 5 * 1024 * 1024) {
      setProfileNotice({ tone: "error", text: "Ảnh đại diện không được vượt quá 5 MiB." });
      if (avatarInput.current) avatarInput.current.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setProfileNotice({ tone: "error", text: "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc AVIF." });
      if (avatarInput.current) avatarInput.current.value = "";
      return;
    }

    setAvatarSaving(true);
    try {
      const updated = await uploadCurrentUserAvatar(file);
      setProfile(updated);
      announceProfile(updated);
      setProfileNotice({ tone: "success", text: "Đã cập nhật ảnh đại diện." });
    } catch (error) {
      setProfileNotice({ tone: "error", text: toApiProblemError(error).message });
    } finally {
      setAvatarSaving(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordNotice(null);
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: "error", text: "Mật khẩu xác nhận không khớp." });
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword)
      || !/[0-9]/.test(newPassword) || !/[^a-zA-Z0-9]/.test(newPassword)) {
      setPasswordNotice({ tone: "error", text: "Mật khẩu mới cần có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt." });
      return;
    }

    setPasswordSaving(true);
    try {
      await changeCurrentUserPassword({ currentPassword, newPassword });
      setPasswordNotice({ tone: "success", text: "Đã đổi mật khẩu. Đang kết thúc phiên để yêu cầu đăng nhập lại." });
      await signOut({ redirectTo: "/auth/login?passwordChanged=1" });
    } catch (error) {
      setPasswordNotice({ tone: "error", text: toApiProblemError(error).message });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
      <LoaderCircle className="size-4 animate-spin" /> Đang tải hồ sơ...
    </div>;
  }

  if (!profile) {
    return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
      {profileNotice?.text || "Không thể tải hồ sơ. Vui lòng tải lại trang."}
    </p>;
  }

  const initials = profile.displayName.trim().split(/\s+/).slice(0, 2)
    .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase("vi") || "A";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <div className="mb-7 flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserRound className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Thông tin cá nhân</h2>
            <p className="text-sm text-muted-foreground">Cập nhật cách bạn xuất hiện trên Culinary Blog.</p>
          </div>
        </div>

        <div className="mb-7 flex flex-wrap items-center gap-5">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-xl font-semibold text-primary">
            {profile.avatarUrl
              ? <Image src={profile.avatarUrl} alt={`Ảnh đại diện của ${profile.displayName}`} width={80} height={80} unoptimized className="size-full object-cover" />
              : <span aria-hidden="true">{initials}</span>}
          </div>
          <div>
            <input ref={avatarInput} className="sr-only" id="profile-avatar" type="file"
              accept="image/jpeg,image/png,image/webp,image/avif" disabled={avatarSaving}
              onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])} />
            <Button type="button" variant="outline" disabled={avatarSaving}
              onClick={() => avatarInput.current?.click()}>
              {avatarSaving ? <LoaderCircle className="animate-spin" /> : <Camera />}
              {avatarSaving ? "Đang tải ảnh..." : "Thay ảnh đại diện"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG, WebP hoặc AVIF · tối đa 5 MiB</p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={saveProfile}>
          <div className="space-y-2">
            <label htmlFor="profile-display-name" className="text-sm font-medium">Tên hiển thị</label>
            <Input id="profile-display-name" autoComplete="name" minLength={2} maxLength={100} required
              value={profile.displayName}
              onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-email" className="text-sm font-medium">Email</label>
            <Input id="profile-email" type="email" value={profile.email} disabled readOnly />
            <p className="text-xs text-muted-foreground">Email đăng nhập hiện chưa thể thay đổi.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="profile-bio" className="text-sm font-medium">Giới thiệu</label>
            <Textarea id="profile-bio" maxLength={500} rows={4} placeholder="Một chút về bạn và những món ăn yêu thích..."
              value={profile.bio ?? ""}
              onChange={(event) => setProfile({ ...profile, bio: event.target.value })} />
            <p className="text-right text-xs text-muted-foreground">{profile.bio?.length ?? 0}/500</p>
          </div>
          {profileNotice && <p className={profileNotice.tone === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700 dark:text-emerald-400"}
            role={profileNotice.tone === "error" ? "alert" : "status"}>{profileNotice.text}</p>}
          <Button type="submit" disabled={profileSaving || avatarSaving}>
            {profileSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
            {profileSaving ? "Đang lưu..." : "Lưu hồ sơ"}
          </Button>
        </form>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-8">
        <div className="mb-7 flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Đổi mật khẩu</h2>
            <p className="text-sm text-muted-foreground">Các refresh token hiện có sẽ bị thu hồi sau khi đổi.</p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={changePassword}>
          <div className="space-y-2">
            <label htmlFor="current-password" className="text-sm font-medium">Mật khẩu hiện tại</label>
            <Input id="current-password" type="password" autoComplete="current-password" required
              value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium">Mật khẩu mới</label>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required
              value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">Xác nhận mật khẩu mới</label>
            <Input id="confirm-password" type="password" autoComplete="new-password" required
              value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
          {passwordNotice && <p className={passwordNotice.tone === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700 dark:text-emerald-400"}
            role={passwordNotice.tone === "error" ? "alert" : "status"}>{passwordNotice.text}</p>}
          <Button type="submit" disabled={passwordSaving}>
            {passwordSaving && <LoaderCircle className="animate-spin" />}
            {passwordSaving ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
          </Button>
        </form>
      </section>
    </div>
  );
}
