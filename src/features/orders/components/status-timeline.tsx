import { Check, X } from "lucide-react";
import {
  ORDER_STATUS_LABELS,
  type OrderSource,
  type OrderStatus,
  type StatusHistoryEntry,
} from "@/features/orders/types";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

type FlowStatus = Exclude<OrderStatus, "cancelled">;
export type TimelineStepState = "done" | "current" | "upcoming" | "cancelled";

export interface TimelineStep {
  status: OrderStatus;
  state: TimelineStepState;
  at?: string;
}

interface StatusTimelineProps {
  statusHistory: StatusHistoryEntry[];
  source: OrderSource;
  status: OrderStatus;
}

const WEB_FLOW: readonly FlowStatus[] = ["pending", "confirmed", "shipping", "delivered"];
const MANUAL_FLOW: readonly FlowStatus[] = ["confirmed", "shipping", "delivered"];

const STATE_TEXT: Record<Exclude<TimelineStepState, "cancelled">, string> = {
  done: "đã qua",
  current: "hiện tại",
  upcoming: "chưa tới",
};

/** Thời điểm của mục MỚI NHẤT (cuối mảng) cùng trạng thái; bỏ qua nếu không hợp lệ. */
function latestAt(statusHistory: StatusHistoryEntry[], status: OrderStatus): string | undefined {
  for (let i = statusHistory.length - 1; i >= 0; i -= 1) {
    const entry = statusHistory[i];
    if (entry.status === status) {
      return typeof entry.at === "string" && !Number.isNaN(Date.parse(entry.at))
        ? entry.at
        : undefined;
    }
  }
  return undefined;
}

function hasEntry(statusHistory: StatusHistoryEntry[], status: OrderStatus): boolean {
  return statusHistory.some((entry) => entry.status === status);
}

export function buildTimelineSteps({
  statusHistory,
  source,
  status,
}: StatusTimelineProps): TimelineStep[] {
  const flow = source === "manual" ? MANUAL_FLOW : WEB_FLOW;

  if (status === "cancelled") {
    const passed: TimelineStep[] = flow
      .filter((s) => hasEntry(statusHistory, s))
      .map((s) => ({ status: s, state: "done", at: latestAt(statusHistory, s) }));
    return [
      ...passed,
      { status: "cancelled", state: "cancelled", at: latestAt(statusHistory, "cancelled") },
    ];
  }

  const currentIndex = flow.indexOf(status);
  return flow.map((s, index) => {
    if (index > currentIndex) return { status: s, state: "upcoming" };
    return {
      status: s,
      state: index === currentIndex ? "current" : "done",
      at: latestAt(statusHistory, s),
    };
  });
}

const CIRCLE_CLASSES: Record<TimelineStepState, string> = {
  done: "bg-emerald-700 text-white",
  current: "bg-indigo-600 text-white",
  upcoming: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
};

const LABEL_CLASSES: Record<TimelineStepState, string> = {
  done: "text-slate-900",
  current: "text-slate-900",
  upcoming: "text-slate-500",
  cancelled: "text-rose-700",
};

export function StatusTimeline({ statusHistory, source, status }: StatusTimelineProps) {
  const steps = buildTimelineSteps({ statusHistory, source, status });

  return (
    <ol aria-label="Tiến trình đơn hàng" className="flex flex-col">
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const isLast = next === undefined;
        const isCurrent = step.state === "current" || step.state === "cancelled";
        return (
          <li
            key={step.status}
            aria-current={isCurrent ? "step" : undefined}
            className={cn("relative flex gap-3", !isLast && "pb-6")}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                CIRCLE_CLASSES[step.state],
              )}
            >
              {step.state === "done" ? (
                <Check aria-hidden="true" className="size-4" />
              ) : step.state === "cancelled" ? (
                <X aria-hidden="true" className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-0 left-[13px] w-0.5",
                  next.state === "upcoming" ? "bg-slate-500" : "bg-emerald-700",
                )}
              />
            )}
            <div className="flex flex-col pt-0.5">
              <span className={cn("text-sm font-semibold", LABEL_CLASSES[step.state])}>
                {ORDER_STATUS_LABELS[step.status]}
                {step.state !== "cancelled" && (
                  <span className="sr-only"> {STATE_TEXT[step.state]}</span>
                )}
              </span>
              {step.at && (
                <time dateTime={step.at} className="text-xs text-slate-600">
                  {formatDateTime(step.at)}
                </time>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
