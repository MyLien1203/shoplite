import { describe, expect, it } from "vitest";
import {
  isNormalizableOrder,
  type LegacyOrder,
  normalizeOrder,
} from "./normalize-order";

const legacy = (over: Partial<LegacyOrder> = {}): LegacyOrder => ({
  id: "SL-1",
  status: "pending",
  createdAt: "2026-10-21T03:00:00.000Z",
  updatedAt: "2026-10-22T03:00:00.000Z",
  customer: { fullName: "A", phone: "0901234567", address: "1 Trần Phú" },
  shippingMethod: "standard",
  paymentMethod: "cod",
  items: [],
  subtotal: 0,
  shippingFee: 0,
  total: 0,
  ...over,
});

describe("normalizeOrder", () => {
  it("đơn cũ pending: điền trường mới, giữ updatedAt", () => {
    const result = normalizeOrder(legacy());
    expect(result.source).toBe("web");
    expect(result.statusHistory).toEqual([
      { status: "pending", at: "2026-10-21T03:00:00.000Z" },
    ]);
    expect(result.internalNotes).toEqual([]);
    expect(result.updatedAt).toBe("2026-10-22T03:00:00.000Z");
  });

  it("đơn cũ cancelled: thêm mục cancelled tại updatedAt", () => {
    const result = normalizeOrder(legacy({ status: "cancelled" }));
    expect(result.statusHistory).toEqual([
      { status: "pending", at: "2026-10-21T03:00:00.000Z" },
      { status: "cancelled", at: "2026-10-22T03:00:00.000Z" },
    ]);
  });

  it("idempotent và không sửa đầu vào", () => {
    const input = legacy({ status: "shipping" });
    const snapshot = structuredClone(input);
    const once = normalizeOrder(input);
    expect(input).toEqual(snapshot);
    expect(normalizeOrder(once)).toEqual(once);
  });

  it("đơn đã mới được giữ nguyên", () => {
    const full = normalizeOrder(
      legacy({
        source: "manual",
        statusHistory: [{ status: "pending", at: "2026-10-21T04:00:00.000Z" }],
        internalNotes: [
          { id: "n1", text: "x", createdAt: "2026-10-21T05:00:00.000Z" },
        ],
        trackingCode: "T1",
      }),
    );
    expect(full.source).toBe("manual");
    expect(full.statusHistory).toHaveLength(1);
    expect(full.internalNotes).toHaveLength(1);
    expect(full.trackingCode).toBe("T1");
    expect(normalizeOrder(full)).toEqual(full);
  });
});

describe("isNormalizableOrder", () => {
  it("chấp nhận đơn hợp lệ", () => {
    expect(isNormalizableOrder(legacy())).toBe(true);
  });

  it.each([
    ["null", null],
    ["chuỗi", "x"],
    ["mảng", []],
    ["status lạ", { ...legacy(), status: "weird" }],
    ["thiếu id", { ...legacy(), id: undefined }],
    ["thiếu createdAt", { ...legacy(), createdAt: undefined }],
    ["thiếu updatedAt", { ...legacy(), updatedAt: undefined }],
    ["createdAt không hợp lệ", { ...legacy(), createdAt: "không phải ngày" }],
    ["updatedAt là số", { ...legacy(), updatedAt: 123 }],
  ])("từ chối: %s", (_name, value) => {
    expect(isNormalizableOrder(value)).toBe(false);
  });
});
