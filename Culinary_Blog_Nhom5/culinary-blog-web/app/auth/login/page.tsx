import type { Metadata } from "next";
import { LoginPageContent } from "@/components/auth/LoginPageContent";

export const metadata: Metadata = {
  title: "Đăng nhập | Culinary Blog",
  description: "Đăng nhập vào tài khoản Culinary Blog.",
};

export default function AuthLoginPage() {
  return <LoginPageContent />;
}
