// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateShippingForm, vnDateOf } from "./shipping-form";

const CREATED = "2026-11-20T18:30:00.000Z"; // 01:30 ngày 21/11 giờ VN
const run = (trackingCode: string, expectedDeliveryDate: string, createdAt = CREATED) =>
  validateShippingForm({ trackingCode, expectedDeliveryDate }, createdAt);

describe("vnDateOf", () => {
  it("lấy ngày giờ VN (UTC+7), không phải ngày UTC", () => {
    expect(vnDateOf(CREATED)).toBe("2026-11-21");
    expect(vnDateOf("2026-11-20T16:59:59.000Z")).toBe("2026-11-20");
    expect(vnDateOf("2026-11-20T17:00:00.000Z")).toBe("2026-11-21");
  });
  it("không đọc được thì null, không ném", () => {
    expect(vnDateOf("hỏng")).toBeNull();
    expect(vnDateOf("")).toBeNull();
  });
});

describe("validateShippingForm", () => {
  it("để trống cả hai: không giá trị, không lỗi", () => {
    expect(run("", "")).toEqual({ values: {}, errors: {} });
    expect(run("   ", "  ")).toEqual({ values: {}, errors: {} });
  });
  it("chỉ trả khóa có giá trị, mã được trim", () => {
    expect(run(" GHN1 ", "")).toEqual({ values: { trackingCode: "GHN1" }, errors: {} });
    expect(run("", "2026-11-25")).toEqual({
      values: { expectedDeliveryDate: "2026-11-25" },
      errors: {},
    });
    expect(Object.keys(run("", "").values)).toEqual([]);
  });
  it("mã 50 hợp lệ, 51 lỗi (sau trim)", () => {
    expect(run("A".repeat(50), "").errors).toEqual({});
    expect(run(`  ${"A".repeat(50)}  `, "").values.trackingCode).toBe("A".repeat(50));
    expect(run("A".repeat(51), "").errors.trackingCode).toBe("Mã vận đơn tối đa 50 ký tự.");
    expect(run("A".repeat(51), "").values).toEqual({});
  });
  it.each([["A<b>"], ["A>B"], ["A\u200BB"], ["A\nB"], ["A\tB"], ["A\u2028B"], ["A\u2029B"]])(
    "ký tự cấm %j",
    (code) => {
      expect(run(code, "").errors.trackingCode).toBe("Mã vận đơn chứa ký tự không hợp lệ.");
    },
  );
  it("ngày biên múi giờ: 20 lỗi, 21 và 22 hợp lệ", () => {
    expect(run("", "2026-11-20").errors.expectedDeliveryDate).toBe(
      "Ngày giao dự kiến không được sớm hơn ngày đặt hàng.",
    );
    expect(run("", "2026-11-21").errors).toEqual({});
    expect(run("", "2026-11-22").errors).toEqual({});
  });
  it("ngày sai định dạng", () => {
    for (const bad of ["25/11/2026", "2026-1-5", "abc", "2026-11-25T00:00"]) {
      expect(run("", bad).errors.expectedDeliveryDate).toBe("Ngày giao dự kiến không hợp lệ.");
    }
  });
  it("createdAt hỏng: không so ngày, không ném", () => {
    expect(run("", "2000-01-01", "hỏng")).toEqual({
      values: { expectedDeliveryDate: "2000-01-01" },
      errors: {},
    });
  });
  it("hai lỗi cùng lúc", () => {
    const r = run("A".repeat(51), "2026-11-20");
    expect(Object.keys(r.errors).sort()).toEqual(["expectedDeliveryDate", "trackingCode"]);
    expect(r.values).toEqual({});
  });
});
