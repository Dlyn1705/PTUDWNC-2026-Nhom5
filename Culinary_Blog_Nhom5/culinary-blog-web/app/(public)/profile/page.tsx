import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileEditor } from "@/components/auth/ProfileEditor";

export const metadata = { title: "Hồ sơ — Culinary Blog" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user || session.error) redirect("/auth/login?callbackUrl=/profile");

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-primary hover:underline">← Trang chủ</Link>
      <header className="mb-6 mt-6">
        <h1 className="font-display text-3xl font-bold">Hồ sơ của tôi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Quản lý thông tin cá nhân và bảo mật tài khoản.</p>
      </header>
      <ProfileEditor />
    </main>
  );
}
