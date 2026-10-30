"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SiteShell } from "@/components/layout/SiteShell";
import { useAuth } from "@/hooks/useAuth";

export default function WelcomePage() {
  const { user } = useAuth();
  return <SiteShell><AuthGuard roles={["Author", "Admin"]}>
    <main id="main-content" className="page-container section-spacing max-w-3xl text-center">
      <h1 className="font-display text-3xl font-bold">Chào mừng {user?.displayName} đến với Culinary Blog!</h1>
      <p className="mt-4 text-muted-foreground">Tài khoản của bạn đã sẵn sàng. Hãy khám phá và chia sẻ công thức đầu tiên.</p>
      <Link href="/dashboard/recipes/new" className="submit-button mt-8 inline-flex w-auto px-8">Tạo công thức</Link>
    </main>
  </AuthGuard></SiteShell>;
}
