import type { Metadata } from "next";
import { requireStaffPage } from "@/features/access/require-staff";
import { StaffOrderDetailView } from "@/features/staff/components/staff-order-detail-view";

export const metadata: Metadata = {
  title: "Chi tiết đơn",
  robots: { index: false },
};

// Phụ thuộc phiên nhân viên nên không prerender lúc build.
export const dynamic = "force-dynamic";

export default async function StaffOrderDetailPage({ params }: PageProps<"/staff/orders/[id]">) {
  const { id } = await params;
  await requireStaffPage();

  return <StaffOrderDetailView orderId={id} />;
}
