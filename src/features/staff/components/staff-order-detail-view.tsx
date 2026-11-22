"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Order } from "@/features/orders/types";
import { loadStaffOrder } from "../load-staff-order";
import { StaffOrderDetail } from "./staff-order-detail";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; order: Order; now: number }
  | { kind: "not_found" }
  | { kind: "error" }
  | { kind: "redirecting" };

interface StaffOrderDetailViewProps {
  orderId: string;
}

const BACK_LINK_CLASSES =
  "inline-block text-sm font-medium text-slate-700 underline-offset-2 hover:underline";

function BackLink() {
  return (
    <Link href="/staff" className={BACK_LINK_CLASSES}>
      Về danh sách đơn
    </Link>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded-2xl bg-slate-100 ${className}`} />;
}

export function StaffOrderDetailView({ orderId }: StaffOrderDetailViewProps) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const controllerRef = useRef<AbortController | null>(null);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  });

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const result = await loadStaffOrder(orderId, controller.signal);
    if (result === null || controller.signal.aborted) return;
    if (result.kind === "ok") {
      setState({ kind: "ready", order: result.order, now: Date.now() });
    } else if (result.kind === "unauthorized") {
      setState({ kind: "redirecting" });
      routerRef.current.replace("/staff/login?expired=1");
      routerRef.current.refresh();
    } else if (result.kind === "not_found") {
      setState({ kind: "not_found" });
    } else {
      setState({ kind: "error" });
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu một lần khi mount
    void load();
    return () => controllerRef.current?.abort();
  }, [load]);

  function handleRetry() {
    setState({ kind: "loading" });
    void load();
  }

  if (state.kind === "redirecting") return null;

  if (state.kind === "loading") {
    return (
      <div aria-busy="true" className="flex min-w-0 flex-col gap-4">
        <span className="sr-only">Đang tải chi tiết đơn</span>
        <BackLink />
        <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
          <SkeletonBlock className="h-8 w-64 max-w-full" />
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-28 w-full" />
          <SkeletonBlock className="h-28 w-full" />
        </div>
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="min-w-0">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-lg font-semibold text-slate-900">Không tìm thấy đơn hàng này.</p>
        </div>
        <div className="mt-3">
          <BackLink />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="min-w-0">
        <div role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-medium">Không kết nối được máy chủ, vui lòng thử lại.</p>
          <Button variant="secondary" className="mt-3" onClick={handleRetry}>
            Thử lại
          </Button>
        </div>
        <div className="mt-3">
          <BackLink />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <StaffOrderDetail order={state.order} now={state.now} />
      <div className="mt-6">
        <BackLink />
      </div>
    </div>
  );
}
