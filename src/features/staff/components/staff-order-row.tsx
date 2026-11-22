import type { ReactNode } from "react";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { formatOrderAge } from "@/features/orders/format-order-age";
import type { Order } from "@/features/orders/types";
import { formatCurrency } from "@/lib/format";

interface StaffOrderRowProps {
  order: Order;
  /** Thời điểm (ms) chụp một lần khi tải xong, dùng tính Tuổi đơn. */
  now: number;
  /** Chỗ cắm nút hành động (Story 2.11-2.13). */
  actions?: ReactNode;
  /** Chỗ cắm panel mở rộng dưới dòng (Story 2.12-2.13). */
  panel?: ReactNode;
}

const SOURCE_LABELS = { web: "Web", manual: "Tạo tay" } as const;

const TAG_CLASSES = "rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700";

export function StaffOrderRow({ order, now, actions, panel }: StaffOrderRowProps) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const showTracking = order.status === "shipping" && Boolean(order.trackingCode);

  return (
    <li
      data-testid="staff-order-row"
      data-order-id={order.id}
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 tabIndex={-1} className="min-w-0 font-semibold break-words text-slate-900">
              {order.id}
            </h2>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="min-w-0 break-words">{formatOrderAge(order.createdAt, now)}</span>
            <span className="min-w-0 font-medium break-words text-slate-900">
              {order.customer.fullName}
            </span>
            <span className="min-w-0 break-words">{itemCount} sản phẩm</span>
            <span className="min-w-0 font-medium break-words text-slate-900">
              {formatCurrency(order.total)}
            </span>
            <span className={TAG_CLASSES}>{SOURCE_LABELS[order.source]}</span>
            {order.internalNotes.length > 0 && <span className={TAG_CLASSES}>Có ghi chú</span>}
            {showTracking && (
              <span className="min-w-0 break-words">Mã vận đơn: {order.trackingCode}</span>
            )}
          </div>
        </div>
        {actions ? <div className="min-w-0 sm:shrink-0">{actions}</div> : null}
      </div>
      {panel ? <div className="mt-3 min-w-0">{panel}</div> : null}
    </li>
  );
}
