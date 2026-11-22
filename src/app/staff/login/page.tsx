import type { Metadata } from "next";
import { StaffLoginForm } from "@/features/access/components/staff-login-form";
import { getAccessConfig } from "@/features/access/server";

export const metadata: Metadata = {
  title: "Đăng nhập nhân viên",
  robots: { index: false },
};

// Đọc cấu hình truy cập ở mỗi request (không prerender lúc build).
export const dynamic = "force-dynamic";

interface StaffLoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StaffLoginPage({ searchParams }: StaffLoginPageProps) {
  const { expired } = await searchParams;
  const config = getAccessConfig();

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="mb-4 text-2xl font-bold">Đăng nhập nhân viên</h1>
        {config.configured ? (
          <StaffLoginForm expired={expired === "1"} />
        ) : (
          <p className="text-sm text-slate-700">Khu vực nhân viên chưa được cấu hình.</p>
        )}
      </div>
    </div>
  );
}
