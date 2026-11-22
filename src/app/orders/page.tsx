import type { Metadata } from "next";
import { OrderLookupEntry } from "@/features/orders/components/order-lookup-entry";

export const metadata: Metadata = { title: "Tra cứu đơn hàng" };

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Tra cứu đơn hàng</h1>
      <p className="mb-6 text-slate-600">
        Nhập Mã đơn và số điện thoại đã dùng khi đặt hàng để xem đơn của bạn.
      </p>
      <div className="max-w-md">
        <OrderLookupEntry />
      </div>
    </div>
  );
}
