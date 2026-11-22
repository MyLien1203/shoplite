import type { Metadata } from "next";
import { requireStaffPage } from "@/features/access/require-staff";
import { StaffOrdersView } from "@/features/staff/components/staff-orders-view";

export const metadata: Metadata = {
  title: "Đơn cần xử lý",
  robots: { index: false },
};

// Phụ thuộc phiên nhân viên nên không prerender lúc build.
export const dynamic = "force-dynamic";

export default async function StaffOrdersPage() {
  await requireStaffPage();

  return (
    <div>
      <h1 className="text-2xl font-bold">Đơn cần xử lý</h1>
      <StaffOrdersView />
    </div>
  );
}
