"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OrderListCounts, StaffOrderFilter } from "@/features/orders/staff-order-list";
import { ORDER_STATUS_LABELS, type Order } from "@/features/orders/types";
import { loadStaffOrders } from "../load-staff-orders";
import { applyTransitionToCounts, matchesFilter } from "../staff-list-updates";
import { StaffOrderFilterBar } from "./staff-order-filter-bar";
import { STALE_NOTE, StaffOrderItem } from "./staff-order-item";

type ViewState =
  | { kind: "loading" }
  | {
      kind: "ready";
      orders: Order[];
      now: number;
      filter: StaffOrderFilter;
      refreshing: boolean;
      refreshError: boolean;
    }
  | { kind: "error" }
  | { kind: "redirecting" };

type LoadMode = "full" | "refresh" | "silent";

interface FocusTarget {
  id: string;
  prevIds: string[];
  ready: boolean;
}

function filterLabel(filter: StaffOrderFilter): string {
  if (filter === "active") return "Cần xử lý";
  if (filter === "all") return "Tất cả";
  return ORDER_STATUS_LABELS[filter];
}

function SkeletonRow() {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex animate-pulse flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-32 rounded-lg bg-slate-100" />
            <div className="h-5 w-20 rounded-full bg-slate-100" />
          </div>
          <div className="mt-3 h-4 w-full max-w-sm rounded-lg bg-slate-100" />
        </div>
      </div>
    </li>
  );
}

export function StaffOrdersView() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [filter, setFilter] = useState<StaffOrderFilter>("active");
  const [counts, setCounts] = useState<Partial<OrderListCounts> | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [transitionNote, setTransitionNote] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const focusRef = useRef<FocusTarget | null>(null);
  const loadModeRef = useRef<LoadMode | null>(null);
  const routerRef = useRef(router);
  const stateRef = useRef(state);
  const filterRef = useRef(filter);
  useEffect(() => {
    routerRef.current = router;
    stateRef.current = state;
    filterRef.current = filter;
  });

  /** Đưa tiêu điểm tới dòng đích, hoặc dòng kế/liền trước còn hiện, hoặc khối rỗng (đọc từ DOM). */
  const resolveFocus = useCallback(() => {
    const target = focusRef.current;
    if (!target || !target.ready) return;
    focusRef.current = null;
    const region = regionRef.current;
    if (!region) return;
    const rows = new Map<string, HTMLElement>();
    for (const row of region.querySelectorAll<HTMLElement>("[data-order-id]")) {
      rows.set(row.getAttribute("data-order-id") ?? "", row);
    }
    const index = target.prevIds.indexOf(target.id);
    const candidates = [
      target.id,
      ...target.prevIds.slice(index + 1),
      ...target.prevIds.slice(0, Math.max(index, 0)).reverse(),
    ];
    for (const id of candidates) {
      const heading = rows.get(id)?.querySelector("h2");
      if (heading) {
        heading.focus();
        return;
      }
    }
    emptyRef.current?.focus();
  }, []);

  const redirectToLogin = useCallback(() => {
    controllerRef.current?.abort();
    setState({ kind: "redirecting" });
    routerRef.current.replace("/staff/login?expired=1");
    routerRef.current.refresh();
  }, []);

  const load = useCallback(
    async (target: StaffOrderFilter, mode: LoadMode) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      busyRef.current = true;
      loadModeRef.current = mode;
      if (mode === "full") {
        focusRef.current = null;
        setState({ kind: "loading" });
        setAnnouncement("");
        setTransitionNote("");
      } else if (mode === "refresh") {
        setState((prev) => (prev.kind === "ready" ? { ...prev, refreshing: true } : prev));
      }
      const result = await loadStaffOrders(target, controller.signal);
      if (result === null || controller.signal.aborted) return;
      busyRef.current = false;
      loadModeRef.current = null;
      const pendingFocus = focusRef.current;
      if (result.kind === "ok") {
        setCounts(result.counts ?? undefined);
        if (mode !== "silent") {
          setAnnouncement(`${filterLabel(target)}: ${result.orders.length} đơn.`);
        }
        if (pendingFocus) {
          pendingFocus.ready = true;
          if (!result.orders.some((o) => o.id === pendingFocus.id)) setTransitionNote(STALE_NOTE);
        }
        setState({
          kind: "ready",
          orders: result.orders,
          now: Date.now(),
          filter: target,
          refreshing: false,
          refreshError: false,
        });
      } else if (result.kind === "unauthorized") {
        redirectToLogin();
      } else if (mode === "full") {
        setState({ kind: "error" });
      } else if (mode === "silent") {
        // giữ danh sách cũ, không báo lỗi; dòng vẫn có lời "Đơn vừa được cập nhật."
        // một lần "Làm mới" bị tải lại im lặng này hủy phải được trả về trạng thái rảnh
        setState((prev) =>
          prev.kind === "ready"
            ? prev.refreshing
              ? { ...prev, refreshing: false }
              : prev
            : { kind: "error" },
        );
        if (pendingFocus) {
          pendingFocus.ready = true;
          resolveFocus();
        }
      } else {
        setState((prev) =>
          prev.kind === "ready" ? { ...prev, refreshing: false, refreshError: true } : prev,
        );
        if (pendingFocus) {
          pendingFocus.ready = true;
          resolveFocus();
        }
      }
    },
    [redirectToLogin, resolveFocus],
  );

  const handleTransitioned = useCallback(
    (order: Order) => {
      const cur = stateRef.current;
      if (cur.kind !== "ready") return;
      const previous = cur.orders.find((o) => o.id === order.id);
      const prevIds = cur.orders.map((o) => o.id);
      const kept = matchesFilter(order.status, cur.filter);
      const orders = kept
        ? cur.orders.map((o) => (o.id === order.id ? order : o))
        : cur.orders.filter((o) => o.id !== order.id);
      // một lần làm mới đang bay có thể mang dữ liệu trước khi đổi: hủy để không ghi đè dòng mới
      let refreshing = cur.refreshing;
      const restartSilent = loadModeRef.current === "silent";
      if (loadModeRef.current === "refresh" || restartSilent) {
        controllerRef.current?.abort();
        busyRef.current = false;
        loadModeRef.current = null;
        refreshing = false;
      }
      const next: ViewState = { ...cur, orders, refreshing };
      stateRef.current = next;
      setState(next);
      if (previous)
        setCounts((prev) =>
          prev ? applyTransitionToCounts(prev, previous.status, order.status) : prev,
        );
      focusRef.current = { id: order.id, prevIds, ready: true };
      setTransitionNote(`Đã chuyển đơn ${order.id} sang ${ORDER_STATUS_LABELS[order.status]}`);
      if (restartSilent) void load(filterRef.current, "silent");
    },
    [load],
  );

  const handleStale = useCallback(
    (id: string) => {
      const cur = stateRef.current;
      if (cur.kind !== "ready") return;
      focusRef.current = { id, prevIds: cur.orders.map((o) => o.id), ready: false };
      void load(filterRef.current, "silent");
    },
    [load],
  );

  const requestRefresh = useCallback(() => {
    if (busyRef.current) return;
    const kind = stateRef.current.kind;
    if (kind === "ready") void load(filterRef.current, "refresh");
    else if (kind === "error") void load(filterRef.current, "full");
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu một lần khi mount
    void load("active", "full");
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current || stateRef.current.kind !== "ready") return;
      void load(filterRef.current, "refresh");
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [load]);

  useEffect(() => {
    resolveFocus();
  }, [state, resolveFocus]);

  function handleFilterChange(next: StaffOrderFilter) {
    if (next === filter) return;
    setFilter(next);
    void load(next, "full");
  }

  function handleRetry() {
    regionRef.current?.focus();
    void load(filter, "full");
  }

  function handleBackToActive() {
    regionRef.current?.focus();
    setFilter("active");
    void load("active", "full");
  }

  if (state.kind === "redirecting") return null;

  const refreshing = state.kind === "ready" && state.refreshing;
  const busy = state.kind === "loading" || refreshing;

  let content;
  if (state.kind === "loading") {
    content = (
      <div aria-busy="true" className="mt-4">
        <span className="sr-only">Đang tải danh sách đơn</span>
        <ul className="space-y-3" aria-hidden="true">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ul>
      </div>
    );
  } else if (state.kind === "error") {
    content = (
      <div role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-rose-700">
        <p className="text-sm font-medium">Không kết nối được máy chủ, vui lòng thử lại.</p>
        <Button variant="secondary" className="mt-3" onClick={handleRetry}>
          Thử lại
        </Button>
      </div>
    );
  } else if (state.orders.length === 0) {
    content =
      state.filter === "active" ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p
            ref={emptyRef}
            tabIndex={-1}
            className="text-lg font-semibold text-slate-900 focus:outline-none"
          >
            Không có đơn cần xử lý
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Mọi đơn đã được xử lý. Đơn mới sẽ hiện ở đây.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p
            ref={emptyRef}
            tabIndex={-1}
            className="text-lg font-semibold text-slate-900 focus:outline-none"
          >
            Không có đơn nào ở trạng thái này.
          </p>
          <Button variant="secondary" className="mt-4" onClick={handleBackToActive}>
            Xem đơn cần xử lý
          </Button>
        </div>
      );
  } else {
    content = (
      <ul
        aria-label={
          state.filter === "active"
            ? "Danh sách đơn cần xử lý"
            : `Danh sách đơn: ${filterLabel(state.filter)}`
        }
        aria-busy={refreshing || undefined}
        className="mt-4 space-y-3"
      >
        {state.orders.map((order) => (
          <StaffOrderItem
            key={order.id}
            order={order}
            now={state.now}
            onTransitioned={handleTransitioned}
            onStale={handleStale}
            onUnauthorized={redirectToLogin}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <StaffOrderFilterBar
          value={filter}
          onChange={handleFilterChange}
          activeCount={counts?.active}
        />
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (busy) return;
            requestRefresh();
          }}
        >
          {refreshing ? "Đang làm mới…" : "Làm mới"}
        </Button>
      </div>
      <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="staff-orders-live">
        {announcement}
      </p>
      <p role="status" className="sr-only" data-testid="staff-orders-transition-status">
        {transitionNote}
      </p>
      {state.kind === "ready" && state.refreshError ? (
        <div role="alert" className="mt-4 rounded-2xl bg-rose-50 p-4 text-rose-700">
          <p className="text-sm font-medium">Không kết nối được máy chủ, vui lòng thử lại.</p>
        </div>
      ) : null}
      <div
        ref={regionRef}
        role="region"
        aria-label="Kết quả danh sách đơn"
        tabIndex={-1}
        className="focus:outline-none"
      >
        {content}
      </div>
    </>
  );
}
