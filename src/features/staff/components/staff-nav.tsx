"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const LINKS = [{ href: "/staff", label: "Đơn hàng" }];

function isActive(pathname: string, href: string): boolean {
  return pathname === href;
}

export function StaffNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    setSubmitting(true);
    try {
      await fetch("/api/staff/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      // Mọi kết quả đều chuyển tới trang đăng nhập.
    }
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <header
      data-testid="staff-nav"
      className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-6">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold text-slate-900"
            aria-label="ShopLite - Trang chủ"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Store className="size-5" />
            </span>
            <span className="hidden sm:inline">ShopLite</span>
          </Link>
          <span
            data-testid="staff-badge"
            className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white"
          >
            Nhân viên
          </span>
        </div>
        <nav
          aria-label="Điều hướng nhân viên"
          className="flex items-center gap-1 text-sm font-medium"
        >
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg px-2 whitespace-nowrap transition-colors sm:px-3",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="md"
            aria-label="Đăng xuất"
            disabled={submitting}
            onClick={handleLogout}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
