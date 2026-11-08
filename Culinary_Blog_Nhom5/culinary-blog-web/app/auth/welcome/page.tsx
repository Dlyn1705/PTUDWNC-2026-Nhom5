"use client";

import Link from "next/link";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WelcomeBanner } from "@/components/auth/WelcomeBanner";
import { safeCallbackUrl } from "@/lib/auth/callbackUrl";
import { validWelcomeReceipt, WELCOME_KEY } from "@/lib/auth/registrationWelcome";
import { SiteShell } from "@/components/layout/SiteShell";
import { useAuth } from "@/hooks/useAuth";

function subscribe(callback: () => void) {
  const timer = setInterval(callback, 1000);
  window.addEventListener("storage", callback);
  return () => { clearInterval(timer); window.removeEventListener("storage", callback); };
}
function WelcomeContent() {
  const { user, isInitializing } = useAuth();
  const router = useRouter();
  const callback = safeCallbackUrl(useSearchParams().get("callbackUrl"), "/dashboard/recipes/new");
  const eligible = useSyncExternalStore(subscribe, () => {
    try { return validWelcomeReceipt(sessionStorage.getItem(WELCOME_KEY), user?.id ?? ""); }
    catch { return false; }
  }, () => null);
  useEffect(() => {
    if (!isInitializing && eligible === false) router.replace(user ? "/dashboard" : "/auth/login");
  }, [eligible, isInitializing, router, user]);
  if (isInitializing || !eligible) return <p role="status">Đang kiểm tra tài khoản…</p>;
  return <>
    <h1 className="font-display text-3xl font-bold">Chào mừng {user?.displayName}!</h1>
    <div className="mt-6"><WelcomeBanner /></div>
    <Link href={callback === "/auth/welcome" ? "/dashboard/recipes/new" : callback} className="submit-button mt-8 inline-flex w-auto px-8">Bắt đầu</Link>
  </>;
}
export default function WelcomePage() {
  return <SiteShell><main id="main-content" className="page-container section-spacing max-w-3xl">
    <Suspense fallback={<p role="status">Đang tải…</p>}><WelcomeContent /></Suspense>
  </main></SiteShell>;
}
