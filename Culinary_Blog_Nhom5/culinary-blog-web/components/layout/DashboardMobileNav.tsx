"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DashboardMobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const links = [
    { href: "/dashboard/recipes", label: "Công thức" },
    { href: "/dashboard/recipes/images", label: "Ảnh công thức" },
    ...(isAdmin ? [{ href: "/dashboard/categories", label: "Danh mục" }] : []),
    { href: "/", label: "Về trang chủ" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Mở menu dashboard">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogTitle>Menu dashboard</DialogTitle>
        <DialogDescription>Chọn trang quản lý bạn muốn mở.</DialogDescription>
        <nav aria-label="Điều hướng dashboard trên điện thoại" className="grid gap-2">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
              onNavigate={() => setOpen(false)}
              className="rounded-lg px-4 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-accent">
              {label}
            </Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
