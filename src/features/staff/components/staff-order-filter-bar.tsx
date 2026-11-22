import type { StaffOrderFilter } from "@/features/orders/staff-order-list";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/features/orders/types";
import { cn } from "@/lib/cn";

interface StaffOrderFilterBarProps {
  value: StaffOrderFilter;
  onChange: (value: StaffOrderFilter) => void;
  /** Số đơn cần xử lý của lần tải thành công gần nhất; thiếu hoặc không hữu hạn thì không hiện số. */
  activeCount?: number;
}

const CHIP_BASE =
  "inline-flex min-h-10 items-center rounded-full px-4 text-sm cursor-pointer " +
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600";
const CHIP_SELECTED =
  "bg-indigo-50 text-indigo-700 ring-2 ring-inset ring-indigo-600 font-semibold";
const CHIP_IDLE = "bg-white text-slate-900 ring-1 ring-inset ring-slate-300 font-medium";

export function StaffOrderFilterBar({ value, onChange, activeCount }: StaffOrderFilterBarProps) {
  const activeLabel =
    typeof activeCount === "number" && Number.isFinite(activeCount)
      ? `Cần xử lý (${activeCount})`
      : "Cần xử lý";
  const chips: { filter: StaffOrderFilter; label: string }[] = [
    { filter: "active", label: activeLabel },
    ...ORDER_STATUSES.map((status) => ({
      filter: status as StaffOrderFilter,
      label: ORDER_STATUS_LABELS[status],
    })),
    { filter: "all", label: "Tất cả" },
  ];

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Lọc theo trạng thái</legend>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <label key={chip.filter}>
            <input
              type="radio"
              name="staff-order-filter"
              value={chip.filter}
              checked={value === chip.filter}
              onChange={() => onChange(chip.filter)}
              className="peer sr-only"
            />
            <span className={cn(CHIP_BASE, value === chip.filter ? CHIP_SELECTED : CHIP_IDLE)}>
              {chip.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
