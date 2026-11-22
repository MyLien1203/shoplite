"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import type { Order, OrderStatus } from "@/features/orders/types";
import { transitionStaffOrder, type TransitionExtra } from "../transition-staff-order";
import { StaffOrderRow } from "./staff-order-row";
import { ShippingPanel } from "./shipping-panel";

interface ItemAction {
  target: OrderStatus;
  label: string;
  pendingLabel: string;
  ariaLabel: (orderId: string) => string;
  /** Mục mở panel thay vì gửi ngay: xác nhận Hủy hoặc form Giao hàng. */
  opensPanel?: "cancel" | "shipping";
}

/** Bảng hành động theo trạng thái; thêm mục ở đây để mở rộng, không đổi luồng. */
const ITEM_ACTIONS: Partial<Record<OrderStatus, ItemAction[]>> = {
  pending: [
    {
      target: "confirmed",
      label: "Xác nhận",
      pendingLabel: "Đang xác nhận…",
      ariaLabel: (id) => `Xác nhận đơn ${id}`,
    },
    {
      target: "cancelled",
      label: "Hủy",
      pendingLabel: "Đang hủy…",
      ariaLabel: (id) => `Hủy đơn ${id}`,
      opensPanel: "cancel",
    },
  ],
  confirmed: [
    {
      target: "shipping",
      label: "Giao hàng",
      pendingLabel: "Đang chuyển…",
      ariaLabel: (id) => `Giao hàng đơn ${id}`,
      opensPanel: "shipping",
    },
  ],
  shipping: [
    {
      target: "delivered",
      label: "Đã giao",
      pendingLabel: "Đang cập nhật…",
      ariaLabel: (id) => `Đánh dấu đã giao đơn ${id}`,
    },
  ],
};

export const STALE_NOTE = "Đơn vừa được cập nhật.";
const GENERIC_MESSAGE = "Không thể cập nhật đơn, vui lòng thử lại.";
const BUTTON_LAYOUT = "max-sm:h-12 max-sm:flex-1 sm:flex-none";

type ShippingFeedback =
  | { kind: "invalid"; errors: { trackingCode?: string; expectedDeliveryDate?: string } }
  | { kind: "error"; text: string }
  | null;

type Message = { kind: "error"; text: string } | { kind: "stale" } | null;

interface StaffOrderItemProps {
  order: Order;
  now: number;
  onTransitioned: (order: Order) => void;
  onStale: (id: string) => void;
  onUnauthorized: () => void;
}

export function StaffOrderItem({
  order,
  now,
  onTransitioned,
  onStale,
  onUnauthorized,
}: StaffOrderItemProps) {
  const [pendingTarget, setPendingTarget] = useState<OrderStatus | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [shippingFeedback, setShippingFeedback] = useState<ShippingFeedback>(null);
  const inFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const refocusRef = useRef<"first" | "cancel" | null>(null);
  const panelId = useId();
  const shippingPanelId = `shipping-panel-${order.id}`;
  const questionId = useId();

  const panelOpen = cancelOpen && order.status === "pending";
  const shipOpen = shippingOpen && order.status === "confirmed";

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (pendingTarget !== null || refocusRef.current === null) return;
    const where = refocusRef.current;
    refocusRef.current = null;
    if (where === "cancel") panelRef.current?.querySelector("button")?.focus();
    else actionsRef.current?.querySelector("button")?.focus();
  }, [pendingTarget]);

  useEffect(() => {
    if (panelOpen) panelRef.current?.focus();
  }, [panelOpen]);

  async function send(target: OrderStatus, fromPanel: boolean, extra?: TransitionExtra) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPendingTarget(target);
    setMessage(null);
    setCancelError(null);
    setShippingFeedback(null);
    if (!fromPanel) setCancelOpen(false);
    const controller = new AbortController();
    controllerRef.current = controller;
    const result = await transitionStaffOrder(order.id, target, controller.signal, extra);
    if (result === null || controller.signal.aborted) return;
    inFlightRef.current = false;
    setPendingTarget(null);
    if (result.kind === "ok") {
      setCancelOpen(false);
      setShippingOpen(false);
      onTransitioned(result.order);
    } else if (result.kind === "stale") {
      setCancelOpen(false);
      setShippingOpen(false);
      setMessage({ kind: "stale" });
      onStale(order.id);
    } else if (result.kind === "unauthorized") {
      onUnauthorized();
    } else if (target === "shipping") {
      if (result.kind === "invalid") {
        setShippingFeedback({ kind: "invalid", errors: result.details });
      } else {
        setShippingFeedback({
          kind: "error",
          text: result.kind === "stock" ? GENERIC_MESSAGE : result.message,
        });
      }
    } else if (fromPanel) {
      refocusRef.current = "cancel";
      setCancelError(result.kind === "stock" ? GENERIC_MESSAGE : result.message);
    } else {
      refocusRef.current = "first";
      setMessage({
        kind: "error",
        text: result.message,
      });
    }
  }

  function closeCancel() {
    if (inFlightRef.current) return;
    setCancelOpen(false);
    setCancelError(null);
    actionsRef.current?.querySelector<HTMLElement>("[aria-controls]")?.focus();
  }

  function toggleCancel() {
    if (inFlightRef.current) return;
    if (panelOpen) closeCancel();
    else setCancelOpen(true);
  }

  function closeShipping() {
    if (inFlightRef.current) return;
    setShippingOpen(false);
    setShippingFeedback(null);
    actionsRef.current?.querySelector<HTMLElement>("[aria-controls]")?.focus();
  }

  function toggleShipping() {
    if (inFlightRef.current) return;
    if (shipOpen) closeShipping();
    else setShippingOpen(true);
  }

  function onEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (panelOpen) closeCancel();
    else if (shipOpen) closeShipping();
  }

  const actions = ITEM_ACTIONS[order.status] ?? [];

  const actionsNode =
    actions.length > 0 ? (
      <div ref={actionsRef} className="flex gap-2" onKeyDown={onEscape}>
        {actions.map((action) =>
          action.opensPanel === "shipping" ? (
            <Button
              key={action.target}
              variant="primary"
              size="md"
              className="max-sm:h-12 max-sm:w-full sm:flex-none"
              disabled={pendingTarget !== null}
              aria-label={action.ariaLabel(order.id)}
              aria-expanded={shipOpen}
              aria-controls={shippingPanelId}
              onClick={toggleShipping}
            >
              {action.label}
            </Button>
          ) : action.opensPanel ? (
            <Button
              key={action.target}
              variant="secondary"
              size="md"
              className={BUTTON_LAYOUT}
              disabled={pendingTarget !== null}
              aria-label={action.ariaLabel(order.id)}
              aria-expanded={panelOpen}
              aria-controls={panelId}
              onClick={toggleCancel}
            >
              {action.label}
            </Button>
          ) : (
            <Button
              key={action.target}
              variant="primary"
              size="md"
              className={BUTTON_LAYOUT}
              disabled={pendingTarget !== null}
              aria-label={action.ariaLabel(order.id)}
              onClick={() => void send(action.target, false)}
            >
              {pendingTarget === action.target ? action.pendingLabel : action.label}
            </Button>
          ),
        )}
      </div>
    ) : undefined;

  let notice;
  if (message?.kind === "error") {
    notice = (
      <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-700">
        <p className="text-sm font-medium">{message.text}</p>
      </div>
    );
  } else if (message?.kind === "stale") {
    notice = (
      <p role="status" className="text-sm text-slate-700">
        {STALE_NOTE}
      </p>
    );
  }

  const cancelling = pendingTarget === "cancelled";
  const panel =
    notice || panelOpen || shipOpen ? (
      <>
        {notice}
        {shipOpen && (
          <div className={notice ? "mt-3" : undefined}>
            <ShippingPanel
              orderId={order.id}
              createdAt={order.createdAt}
              pending={pendingTarget === "shipping"}
              serverErrors={shippingFeedback?.kind === "invalid" ? shippingFeedback.errors : null}
              generalError={shippingFeedback?.kind === "error" ? shippingFeedback.text : null}
              onSubmit={(values) => void send("shipping", true, values)}
              onClose={closeShipping}
            />
          </div>
        )}
        {panelOpen && (
          <div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-labelledby={questionId}
            tabIndex={-1}
            onKeyDown={onEscape}
            className={`rounded-xl bg-rose-50 p-4 text-sm focus:outline-none${notice ? " mt-3" : ""}`}
          >
            <p id={questionId} className="font-medium text-rose-900">
              Bạn chắc chắn muốn hủy đơn hàng này?
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="md"
                className={BUTTON_LAYOUT}
                disabled={pendingTarget !== null}
                onClick={() => void send("cancelled", true)}
              >
                {cancelling ? "Đang hủy…" : "Xác nhận hủy"}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className={BUTTON_LAYOUT}
                disabled={pendingTarget !== null}
                onClick={closeCancel}
              >
                Không
              </Button>
            </div>
            {cancelError && (
              <p role="alert" className="mt-2 text-rose-700">
                {cancelError}
              </p>
            )}
          </div>
        )}
      </>
    ) : undefined;

  return <StaffOrderRow order={order} now={now} actions={actionsNode} panel={panel} />;
}
