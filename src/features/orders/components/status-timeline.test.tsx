import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeOrder } from "@/features/orders/normalize-order";
import type { OrderSource, OrderStatus, StatusHistoryEntry } from "@/features/orders/types";
import { buildTimelineSteps, StatusTimeline } from "./status-timeline";

const T1 = "2026-11-20T03:00:00.000Z";
const T2 = "2026-11-20T05:00:00.000Z";
const T3 = "2026-11-21T05:00:00.000Z";
const T4 = "2026-11-22T05:00:00.000Z";

function h(status: OrderStatus, at: string): StatusHistoryEntry {
  return { status, at };
}

function renderTimeline(status: OrderStatus, source: OrderSource, history: StatusHistoryEntry[]) {
  render(<StatusTimeline status={status} source={source} statusHistory={history} />);
  const list = screen.getByRole("list", { name: "Tiến trình đơn hàng" });
  return { list, items: within(list).getAllByRole("listitem") };
}

function labels(items: HTMLElement[]) {
  return items.map((li) => li.querySelector("div > span")?.firstChild?.textContent);
}

function current(items: HTMLElement[]) {
  return items.filter((li) => li.getAttribute("aria-current") === "step");
}

describe("StatusTimeline", () => {
  it("đơn web đang giao: 4 bước, 2 đã qua có giờ, Đang giao hiện tại, Đã giao chưa tới", () => {
    const { items } = renderTimeline("shipping", "web", [
      h("pending", T1),
      h("confirmed", T2),
      h("shipping", T3),
    ]);
    expect(labels(items)).toEqual(["Chờ xác nhận", "Đã xác nhận", "Đang giao", "Đã giao"]);
    expect(current(items)).toEqual([items[2]]);
    expect(items[0].textContent).toContain("đã qua");
    expect(items[1].textContent).toContain("đã qua");
    expect(items[2].textContent).toContain("hiện tại");
    expect(items[3].textContent).toContain("chưa tới");
    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[1].querySelector("svg")).not.toBeNull();
    expect(items[2].querySelector("svg")).toBeNull();
    expect(items[3].querySelector("svg")).toBeNull();
    expect(items[0].querySelector("time")?.getAttribute("datetime")).toBe(T1);
    expect(items[2].querySelector("time")?.getAttribute("datetime")).toBe(T3);
    expect(items[3].querySelector("time")).toBeNull();
    expect(items[2].textContent).toContain("3");
    expect(items[3].textContent).toContain("4");
  });

  it("đơn web đã giao: Đã giao là bước hiện tại, ba bước trước đã qua", () => {
    const { items } = renderTimeline("delivered", "web", [
      h("pending", T1),
      h("confirmed", T2),
      h("shipping", T3),
      h("delivered", T4),
    ]);
    expect(items).toHaveLength(4);
    expect(current(items)).toEqual([items[3]]);
    expect(items.filter((li) => li.querySelector("time"))).toHaveLength(4);
    expect(items.slice(0, 3).every((li) => li.textContent?.includes("đã qua"))).toBe(true);
    expect(items[3].textContent).toContain("hiện tại");
  });

  it("đơn đã hủy: chỉ bước có mục rồi Đã hủy, không bước chưa tới", () => {
    const { items } = renderTimeline("cancelled", "web", [h("pending", T1), h("cancelled", T2)]);
    expect(labels(items)).toEqual(["Chờ xác nhận", "Đã hủy"]);
    expect(current(items)).toEqual([items[1]]);
    expect(items[0].querySelector("time")).not.toBeNull();
    expect(items[1].querySelector("time")?.getAttribute("datetime")).toBe(T2);
    expect(items[0].querySelector("svg.lucide-check")).not.toBeNull();
    expect(items[1].querySelector("svg.lucide-x")).not.toBeNull();
    expect(items[0].querySelector("span.w-0\\.5")?.className).toContain("bg-emerald-700");
    expect(screen.queryByText(/chưa tới/)).toBeNull();
    expect(screen.queryByText("Đã giao")).toBeNull();
  });

  it("hủy sau khi đã xác nhận: giữ các bước đã qua có mục", () => {
    const { items } = renderTimeline("cancelled", "web", [
      h("pending", T1),
      h("confirmed", T2),
      h("cancelled", T3),
    ]);
    expect(labels(items)).toEqual(["Chờ xác nhận", "Đã xác nhận", "Đã hủy"]);
  });

  it("đơn tạo tay: 3 bước từ Đã xác nhận, đánh số từ 1, không có Chờ xác nhận", () => {
    const { items } = renderTimeline("confirmed", "manual", [h("confirmed", T1)]);
    expect(labels(items)).toEqual(["Đã xác nhận", "Đang giao", "Đã giao"]);
    expect(current(items)).toEqual([items[0]]);
    expect(items[0].textContent).toContain("1");
    expect(items[1].textContent).toContain("2");
    expect(screen.queryByText("Chờ xác nhận")).toBeNull();
  });

  it("đơn cũ đã giao (qua normalizeOrder): bước giữa không giờ", () => {
    const order = normalizeOrder({
      id: "SL-1",
      status: "delivered",
      createdAt: T1,
      updatedAt: T4,
      customer: { fullName: "A", phone: "0900000000", address: "x" },
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0,
    });
    const { items } = renderTimeline(order.status, order.source, order.statusHistory);
    expect(labels(items)).toEqual(["Chờ xác nhận", "Đã xác nhận", "Đang giao", "Đã giao"]);
    expect(items.map((li) => li.querySelector("time") !== null)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(items[1].textContent).toContain("đã qua");
    expect(items[2].textContent).toContain("đã qua");
    expect(current(items)).toEqual([items[3]]);
  });

  it("đơn cũ đã hủy (qua normalizeOrder): như đơn đã hủy", () => {
    const order = normalizeOrder({
      id: "SL-2",
      status: "cancelled",
      createdAt: T1,
      updatedAt: T2,
      customer: { fullName: "A", phone: "0900000000", address: "x" },
      shippingMethod: "standard",
      paymentMethod: "cod",
      items: [],
      subtotal: 0,
      shippingFee: 0,
      total: 0,
    });
    const { items } = renderTimeline(order.status, order.source, order.statusHistory);
    expect(labels(items)).toEqual(["Chờ xác nhận", "Đã hủy"]);
    expect(items.every((li) => li.querySelector("time"))).toBe(true);
  });

  it("thời điểm hỏng hoặc trống: bước vẫn hiện, không giờ, không ném lỗi", () => {
    const { items } = renderTimeline("confirmed", "web", [
      h("pending", "không-phải-ngày"),
      h("confirmed", ""),
    ]);
    expect(items).toHaveLength(4);
    expect(items.some((li) => li.querySelector("time"))).toBe(false);
  });

  it("trùng mục cùng trạng thái: dùng mục mới nhất (cuối mảng)", () => {
    const { items } = renderTimeline("confirmed", "web", [
      h("pending", T1),
      h("confirmed", T2),
      h("confirmed", T3),
    ]);
    expect(items[1].querySelector("time")?.getAttribute("datetime")).toBe(T3);
  });

  it("lịch sử rỗng: hiện bước theo status, không giờ", () => {
    const { items } = renderTimeline("pending", "web", []);
    expect(items).toHaveLength(4);
    expect(current(items)).toEqual([items[0]]);
    expect(items[0].textContent).toContain("hiện tại");
    expect(screen.queryAllByText(/\d{2}:\d{2}/)).toHaveLength(0);
    expect(items.some((li) => li.querySelector("time"))).toBe(false);
  });

  it("bước đã qua/hiện tại/chưa tới đều có chữ trạng thái sr-only", () => {
    const { items } = renderTimeline("confirmed", "web", [h("pending", T1), h("confirmed", T2)]);
    for (const li of items) {
      expect(li.querySelector("span.sr-only")?.textContent?.trim()).toMatch(
        /^(đã qua|hiện tại|chưa tới)$/,
      );
    }
  });

  it("vòng tròn size-7 và đường nối w-0.5 là aria-hidden; bước cuối không có đường nối", () => {
    const { items } = renderTimeline("confirmed", "web", [h("pending", T1), h("confirmed", T2)]);
    for (const li of items) {
      const circle = li.querySelector("span.size-7");
      expect(circle?.getAttribute("aria-hidden")).toBe("true");
      expect(circle?.className).toContain("rounded-full");
    }
    const connectors = items.map((li) => li.querySelector("span.w-0\\.5"));
    expect(connectors.slice(0, 3).every((c) => c?.getAttribute("aria-hidden") === "true")).toBe(
      true,
    );
    expect(connectors[3]).toBeNull();
    // đoạn nối xanh khi bước kế tiếp đã qua/hiện tại, xám đậm (slate-500, ≥ 3:1) khi chưa tới
    expect(connectors[0]?.className).toContain("bg-emerald-700");
    expect(connectors[1]?.className).toContain("bg-slate-500");
  });
});

describe("buildTimelineSteps", () => {
  it("trả trạng thái từng bước", () => {
    expect(
      buildTimelineSteps({
        status: "shipping",
        source: "web",
        statusHistory: [h("pending", T1), h("shipping", T3)],
      }),
    ).toEqual([
      { status: "pending", state: "done", at: T1 },
      { status: "confirmed", state: "done", at: undefined },
      { status: "shipping", state: "current", at: T3 },
      { status: "delivered", state: "upcoming" },
    ]);
  });
});

describe("StatusTimeline thuần trình bày", () => {
  const source = readFileSync(join(__dirname, "status-timeline.tsx"), "utf8");

  it("không import features/access, features/staff, next/navigation, hook, fetch", () => {
    expect(source).not.toMatch(/features\/(access|staff)/);
    expect(source).not.toContain("next/navigation");
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/\buse(State|Effect|Router|Memo|Callback)\b/);
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/\bopacity-/);
  });
});
