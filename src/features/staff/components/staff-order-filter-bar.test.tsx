import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StaffOrderFilterBar } from "./staff-order-filter-bar";

const LABELS = [
  "Cần xử lý",
  "Chờ xác nhận",
  "Đã xác nhận",
  "Đang giao",
  "Đã giao",
  "Đã hủy",
  "Tất cả",
];

describe("<StaffOrderFilterBar />", () => {
  it("nhóm radio tên 'Lọc theo trạng thái', nhãn đúng thứ tự", () => {
    render(<StaffOrderFilterBar value="active" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Lọc theo trạng thái" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual(LABELS);
    expect(radios.map((r) => r.getAttribute("value"))).toEqual([
      "active",
      "pending",
      "confirmed",
      "shipping",
      "delivered",
      "cancelled",
      "all",
    ]);
  });

  it("chỉ chip Cần xử lý có số; thiếu hoặc không hữu hạn thì không số", () => {
    const { rerender } = render(
      <StaffOrderFilterBar value="active" onChange={() => {}} activeCount={3} />,
    );
    expect(screen.getByText("Cần xử lý (3)")).toBeInTheDocument();
    expect(screen.getByText("Đã giao")).toBeInTheDocument();
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      rerender(<StaffOrderFilterBar value="active" onChange={() => {}} activeCount={bad} />);
      expect(screen.getByText("Cần xử lý")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("chip chọn và chưa chọn có lớp đúng", () => {
    render(<StaffOrderFilterBar value="shipping" onChange={() => {}} />);
    const selected = screen.getByText("Đang giao");
    expect(selected).toHaveClass(
      "bg-indigo-50",
      "text-indigo-700",
      "ring-2",
      "ring-indigo-600",
      "font-semibold",
    );
    expect(screen.getByRole("radio", { name: "Đang giao" })).toBeChecked();
    const idle = screen.getByText("Đã giao");
    expect(idle).toHaveClass(
      "bg-white",
      "text-slate-900",
      "ring-1",
      "ring-slate-300",
      "font-medium",
    );
    expect(idle).not.toHaveClass("bg-indigo-50");
  });

  it("click gọi onChange đúng giá trị; mũi tên đổi chip", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StaffOrderFilterBar value="active" onChange={onChange} />);
    await user.click(screen.getByText("Tất cả"));
    expect(onChange).toHaveBeenLastCalledWith("all");
    await user.click(screen.getByText("Đã hủy"));
    expect(onChange).toHaveBeenLastCalledWith("cancelled");
    onChange.mockClear();
    screen.getByRole("radio", { name: "Cần xử lý" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("pending");
  });

  it("kiểu: xuống dòng, cao tối thiểu 40px, không cuộn ngang, không token mới", () => {
    const { container } = render(<StaffOrderFilterBar value="active" onChange={() => {}} />);
    expect(container.querySelector(".flex-wrap.gap-2")).not.toBeNull();
    expect(screen.getByText("Tất cả")).toHaveClass("min-h-10", "px-4", "text-sm", "rounded-full");
    expect(screen.getByRole("radio", { name: "Tất cả" })).toHaveClass("sr-only", "peer");
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/staff-order-filter-bar.tsx"),
      "utf8",
    );
    for (const banned of ["overflow-x", "whitespace-nowrap", "[#", "rounded-[", "bg-["]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});
