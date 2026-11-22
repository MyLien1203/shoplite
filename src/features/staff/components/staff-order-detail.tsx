import Link from "next/link";
import type { ReactNode } from "react";
import { ProductImage } from "@/features/catalog/components/product-image";
import { PAYMENT_OPTIONS } from "@/features/checkout/checkout-schema";
import { SHIPPING_OPTIONS } from "@/features/checkout/pricing";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { StatusTimeline } from "@/features/orders/components/status-timeline";
import { formatOrderAge } from "@/features/orders/format-order-age";
import type { InternalNote, Order } from "@/features/orders/types";
import { formatCurrency, formatDateTime } from "@/lib/format";

interface StaffOrderDetailProps {
  order: Order;
  /** Thời điểm (ms) chụp một lần khi tải xong, dùng tính Tuổi đơn. */
  now: number;
  /** Chỗ cắm nút hành động (Story 2.16). */
  actions?: ReactNode;
}

const SOURCE_LABELS = { web: "Web", manual: "Tạo tay" } as const;

const TAG_CLASSES = "rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700";
const CARD_CLASSES = "min-w-0 rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-slate-200";

/** formatDateTime ném RangeError với chuỗi hỏng, nên kiểm trước và bỏ giờ nếu hỏng. */
function safeDateTime(value: string): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? formatDateTime(value)
    : null;
}

/** "2026-11-25" -> "25/11/2026" bằng cắt chuỗi (không qua Date, tránh lệch múi giờ). */
function formatExpectedDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Mới nhất trước: createdAt giảm dần, hòa (hoặc hỏng) thì theo thứ tự mảng ngược. */
function sortNotesNewestFirst(notes: InternalNote[]): InternalNote[] {
  return notes
    .map((note, index) => {
      const time = Date.parse(note.createdAt);
      return { note, index, time: Number.isNaN(time) ? -Infinity : time };
    })
    .sort((a, b) => {
      if (a.time !== b.time) return a.time > b.time ? -1 : 1;
      return b.index - a.index;
    })
    .map((entry) => entry.note);
}

export function StaffOrderDetail({ order, now, actions }: StaffOrderDetailProps) {
  const hasShippingInfo = Boolean(order.trackingCode) || Boolean(order.expectedDeliveryDate);
  const placedAt = safeDateTime(order.createdAt);
  const notes = sortNotesNewestFirst(order.internalNotes);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="min-w-0">
        <Link
          href="/staff"
          className="inline-block text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          ← Đơn cần xử lý
        </Link>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-2xl font-bold break-words text-slate-900">{order.id}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span className="min-w-0 break-words">
            Tuổi đơn: {formatOrderAge(order.createdAt, now)}
          </span>
          {placedAt && <span className="min-w-0 break-words">Đặt lúc {placedAt}</span>}
          <span className={TAG_CLASSES}>{SOURCE_LABELS[order.source]}</span>
        </div>
        {actions ? <div className="mt-3 min-w-0">{actions}</div> : null}
      </header>

      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Sản phẩm</h2>
        <ul className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex min-w-0 items-center gap-4 py-3">
              <div className="w-14 shrink-0">
                <ProductImage image={item.image} alt={item.name} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words text-slate-900">{item.name}</p>
                <p className="text-sm break-words text-slate-600">
                  {formatCurrency(item.unitPrice)} × {item.quantity}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-slate-900">
                {formatCurrency(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Tạm tính</dt>
            <dd className="text-slate-900">{formatCurrency(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Phí giao hàng</dt>
            <dd className="text-slate-900">
              {order.shippingFee === 0 ? "Miễn phí" : formatCurrency(order.shippingFee)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-base">
            <dt className="font-semibold text-slate-900">Tổng cộng</dt>
            <dd className="font-bold text-slate-900">{formatCurrency(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <section className={CARD_CLASSES}>
          <h2 className="mb-2 text-base font-semibold text-slate-900">Người nhận</h2>
          <p className="font-medium break-words text-slate-900">{order.customer.fullName}</p>
          <p className="break-words text-slate-700">{order.customer.phone}</p>
          {order.customer.email && (
            <p className="break-words text-slate-700">{order.customer.email}</p>
          )}
          <p className="mt-2 break-words text-slate-700">{order.customer.address}</p>
          {order.customer.note && (
            <p className="mt-2 break-words whitespace-pre-wrap text-slate-700 italic">
              Ghi chú của khách: {order.customer.note}
            </p>
          )}
        </section>
        <section className={CARD_CLASSES}>
          <h2 className="mb-2 text-base font-semibold text-slate-900">Giao hàng & thanh toán</h2>
          <p className="break-words text-slate-900">
            <span className="text-slate-600">Giao hàng: </span>
            {SHIPPING_OPTIONS[order.shippingMethod].label}
          </p>
          <p className="break-words text-slate-900">
            <span className="text-slate-600">Thanh toán: </span>
            {PAYMENT_OPTIONS[order.paymentMethod].label}
          </p>
        </section>
      </div>

      {hasShippingInfo && (
        <section className={CARD_CLASSES}>
          <h2 className="mb-2 text-base font-semibold text-slate-900">Giao hàng</h2>
          {order.trackingCode && (
            <p className="break-words text-slate-900">Mã vận đơn: {order.trackingCode}</p>
          )}
          {order.expectedDeliveryDate && (
            <p className="break-words text-slate-900">
              Ngày giao dự kiến: {formatExpectedDate(order.expectedDeliveryDate)}
            </p>
          )}
        </section>
      )}

      <section className={CARD_CLASSES}>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Lịch sử trạng thái</h2>
        <StatusTimeline
          statusHistory={order.statusHistory}
          source={order.source}
          status={order.status}
        />
      </section>

      {notes.length > 0 && (
        <section className={CARD_CLASSES}>
          <h2 className="text-base font-semibold text-slate-900">Ghi chú nội bộ</h2>
          <p className="mt-1 mb-3 text-xs font-medium text-slate-600">Chỉ nhân viên thấy</p>
          <ul className="divide-y divide-slate-100">
            {notes.map((note) => {
              const at = safeDateTime(note.createdAt);
              return (
                <li key={note.id} className="min-w-0 py-2 first:pt-0 last:pb-0">
                  {at && <p className="text-xs text-slate-600">{at}</p>}
                  <p className="break-words whitespace-pre-wrap text-slate-900">{note.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
