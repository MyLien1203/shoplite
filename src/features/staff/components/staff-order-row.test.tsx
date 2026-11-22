import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Order } from "@/features/orders/types";
import { StaffOrderRow } from "./staff-order-row";

const NOW = Date.parse("2026-11-22T12:00:00.000Z");

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "SL-0001",
    status: "pending",
    createdAt: new Date(NOW - 5 * 60_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    customer: {
      fullName: "Nguyễn Văn An",
      phone: "0356789012",
      email: "an@example.com",
      address: "12 Đường Bí Mật, Quận 1",
    },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [
      {
        productId: "p1",
        slug: "p1",
        name: "A",
        image: { emoji: "x", from: "a", to: "b" },
        unitPrice: 100000,
        quantity: 2,
        lineTotal: 200000,
      },
      {
        productId: "p2",
        slug: "p2",
        name: "B",
        image: { emoji: "x", from: "a", to: "b" },
        unitPrice: 50000,
        quantity: 1,
        lineTotal: 50000,
      },
    ],
    subtotal: 250000,
    shippingFee: 30000,
    total: 280000,
    source: "web",
    statusHistory: [{ status: "pending", at: new Date(NOW).toISOString() }],
    internalNotes: [],
    ...overrides,
  };
}

function renderRow(props: Partial<Parameters<typeof StaffOrderRow>[0]> = {}) {
  return render(
    <ul>
      <StaffOrderRow order={makeOrder()} now={NOW} {...props} />
    </ul>,
  );
}

describe("<StaffOrderRow />", () => {
  it("hiện mã đơn, huy hiệu, tuổi đơn, khách, số sản phẩm (tổng quantity), tổng tiền, nguồn", () => {
    renderRow();
    const row = screen.getByTestId("staff-order-row");
    expect(row).toHaveAttribute("data-order-id", "SL-0001");
    expect(row.tagName).toBe("LI");
    const h2 = within(row).getByRole("heading", { level: 2, name: "SL-0001" });
    expect(h2).toHaveAttribute("tabindex", "-1");
    expect(within(row).getByText("Chờ xác nhận")).toBeVisible();
    expect(within(row).getByText("5 phút")).toBeVisible();
    expect(within(row).getByText("Nguyễn Văn An")).toBeVisible();
    expect(within(row).getByText("3 sản phẩm")).toBeVisible();
    expect(within(row).getByText(/280\.000/)).toBeVisible();
    expect(within(row).getByText("Web")).toBeVisible();
    expect(within(row).queryByText("Có ghi chú")).toBeNull();
  });

  it("đơn tạo tay có ghi chú: nhãn Tạo tay, Có ghi chú, không lộ nội dung ghi chú", () => {
    renderRow({
      order: makeOrder({
        source: "manual",
        internalNotes: [
          { id: "n1", text: "BÍ-MẬT-NỘI-BỘ", createdAt: new Date(NOW).toISOString() },
        ],
      }),
    });
    expect(screen.getByText("Tạo tay")).toBeVisible();
    expect(screen.getByText("Có ghi chú")).toBeVisible();
    expect(screen.queryByText(/BÍ-MẬT-NỘI-BỘ/)).toBeNull();
  });

  it("không hiện phone, address, email", () => {
    renderRow();
    const text = screen.getByTestId("staff-order-row").textContent ?? "";
    expect(text).not.toContain("0356789012");
    expect(text).not.toContain("Bí Mật");
    expect(text).not.toContain("an@example.com");
  });

  it("mã vận đơn chỉ hiện khi Đang giao và có trackingCode", () => {
    const { unmount } = renderRow({
      order: makeOrder({ status: "shipping", trackingCode: "VN123" }),
    });
    expect(screen.getByText("Mã vận đơn: VN123")).toBeVisible();
    unmount();
    const second = renderRow({ order: makeOrder({ status: "shipping" }) });
    expect(screen.queryByText(/Mã vận đơn/)).toBeNull();
    second.unmount();
    renderRow({ order: makeOrder({ status: "pending", trackingCode: "VN123" }) });
    expect(screen.queryByText(/Mã vận đơn/)).toBeNull();
  });

  it("chuỗi dài: có min-w-0 và break-words, không whitespace-nowrap", () => {
    renderRow({
      order: makeOrder({
        status: "shipping",
        trackingCode: "T".repeat(50),
        customer: { fullName: "N".repeat(80), phone: "0", address: "x" },
      }),
    });
    expect(screen.getByText("N".repeat(80))).toHaveClass("min-w-0", "break-words");
    expect(screen.getByText(`Mã vận đơn: ${"T".repeat(50)}`)).toHaveClass("min-w-0", "break-words");
    expect(screen.getByTestId("staff-order-row").innerHTML).not.toContain("whitespace-nowrap");
  });

  it("actions và panel vắng thì không render khung rỗng", () => {
    renderRow();
    const row = screen.getByTestId("staff-order-row");
    expect(row.querySelectorAll(".sm\\:shrink-0")).toHaveLength(0);
    expect(row.children).toHaveLength(1);
  });

  it("actions bên phải từ sm (hàng ngang, sm:shrink-0); panel dưới cùng", () => {
    renderRow({ actions: <span>HÀNH-ĐỘNG</span>, panel: <span>PANEL</span> });
    const row = screen.getByTestId("staff-order-row");
    const actions = screen.getByText("HÀNH-ĐỘNG").parentElement as HTMLElement;
    expect(actions).toHaveClass("sm:shrink-0");
    expect(actions.parentElement).toHaveClass("flex-col", "sm:flex-row");
    const panel = screen.getByText("PANEL").parentElement as HTMLElement;
    expect(panel.parentElement).toBe(row);
    expect(panel).toBe(row.lastElementChild);
  });

  it("li có khung theo spec; không có nút hay liên kết", () => {
    renderRow();
    const row = screen.getByTestId("staff-order-row");
    expect(row).toHaveClass("rounded-2xl", "border", "border-slate-200", "bg-white", "p-4");
    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).queryByRole("link")).toBeNull();
  });

  it("mã nguồn không chứa mẫu bị cấm", () => {
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/staff-order-row.tsx"),
      "utf8",
    );
    for (const banned of [
      "onClick",
      "<a",
      "Link",
      "button",
      "whitespace-nowrap",
      "overflow-x",
      "toast",
      "[#",
      "rounded-[",
      "bg-[",
    ]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});
