import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transitionStaffOrder } from "./transition-staff-order";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status: number) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const err = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

describe("transitionStaffOrder", () => {
  it("gửi POST đúng URL đã mã hóa, header, cache và body chỉ có target", async () => {
    fetchMock.mockReturnValue(json({ id: "SL/1 2", status: "confirmed" }, 200));
    const signal = new AbortController().signal;
    await transitionStaffOrder("SL/1 2", "confirmed", signal);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/staff/orders/SL%2F1%202/transition");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBe(signal);
    expect(JSON.parse(init.body)).toEqual({ target: "confirmed" });
    expect(init.body).not.toMatch(/trackingCode|expectedDeliveryDate/);
  });

  it("200 hợp lệ là ok kèm đơn server trả", async () => {
    const order = { id: "SL-1", status: "delivered" };
    fetchMock.mockReturnValue(json(order, 200));
    expect(await transitionStaffOrder("SL-1", "delivered")).toEqual({ kind: "ok", order });
  });

  it.each([
    ["thiếu id", { status: "confirmed" }],
    ["id không phải chuỗi", { id: 1, status: "confirmed" }],
    ["status lạ", { id: "A", status: "weird" }],
    ["null", null],
  ])("200 nhưng thân sai (%s) là error chung", async (_n, body) => {
    fetchMock.mockReturnValue(json(body, 200));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({
      kind: "error",
      message: "Không thể cập nhật đơn, vui lòng thử lại.",
    });
  });

  it("401 là unauthorized", async () => {
    fetchMock.mockReturnValue(json({}, 401));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({ kind: "unauthorized" });
  });

  it("409 INSUFFICIENT_STOCK giữ nguyên lời server", async () => {
    fetchMock.mockReturnValue(err("INSUFFICIENT_STOCK", 'Sản phẩm "Áo" chỉ còn 1 sản phẩm', 409));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({
      kind: "stock",
      message: 'Sản phẩm "Áo" chỉ còn 1 sản phẩm',
    });
  });

  it("409 INVALID_STATUS_TRANSITION và 404 ORDER_NOT_FOUND là stale", async () => {
    fetchMock.mockReturnValueOnce(err("INVALID_STATUS_TRANSITION", "x", 409));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({ kind: "stale" });
    fetchMock.mockReturnValueOnce(err("ORDER_NOT_FOUND", "x", 404));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({ kind: "stale" });
  });

  it.each([
    ["400", () => err("VALIDATION_ERROR", "chi tiết kỹ thuật", 400)],
    ["500", () => json({}, 500)],
    ["409 mã lạ", () => err("OTHER", "x", 409)],
    ["thân hỏng 500", () => Promise.resolve(new Response("<html>", { status: 500 }))],
    ["thân hỏng 200", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("%s là error chung, không lộ chi tiết", async (_n, make) => {
    fetchMock.mockReturnValue(make());
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({
      kind: "error",
      message: "Không thể cập nhật đơn, vui lòng thử lại.",
    });
  });

  it("fetch ném lỗi là error mạng", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));
    expect(await transitionStaffOrder("A", "confirmed")).toEqual({
      kind: "error",
      message: "Không kết nối được máy chủ, vui lòng thử lại.",
    });
  });

  it("AbortError trả null", async () => {
    fetchMock.mockRejectedValue(new DOMException("a", "AbortError"));
    expect(await transitionStaffOrder("A", "confirmed")).toBeNull();
  });

  it("extra: body gộp đúng khóa có mặt, không khóa rỗng/undefined", async () => {
    fetchMock.mockReturnValue(json({ id: "A", status: "shipping" }, 200));
    await transitionStaffOrder("A", "shipping", undefined, {
      trackingCode: "GHN1",
      expectedDeliveryDate: "2026-11-25",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      target: "shipping",
      trackingCode: "GHN1",
      expectedDeliveryDate: "2026-11-25",
    });
    fetchMock.mockClear();
    await transitionStaffOrder("A", "shipping", undefined, { trackingCode: "X" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      target: "shipping",
      trackingCode: "X",
    });
    fetchMock.mockClear();
    await transitionStaffOrder("A", "shipping", undefined, {});
    expect(fetchMock.mock.calls[0][1].body).toBe('{"target":"shipping"}');
    fetchMock.mockClear();
    await transitionStaffOrder("A", "shipping", undefined, {
      trackingCode: undefined,
      expectedDeliveryDate: undefined,
    });
    expect(fetchMock.mock.calls[0][1].body).toBe('{"target":"shipping"}');
  });

  it("400 VALIDATION_ERROR có details: invalid, bỏ khóa lạ và giá trị không phải chuỗi", async () => {
    fetchMock.mockReturnValue(
      json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Thông tin giao hàng không hợp lệ",
            details: { trackingCode: "Mã sai", expectedDeliveryDate: 5, target: "lạ" },
          },
        },
        400,
      ),
    );
    expect(await transitionStaffOrder("A", "shipping")).toEqual({
      kind: "invalid",
      message: "Thông tin giao hàng không hợp lệ",
      details: { trackingCode: "Mã sai" },
    });
  });

  it.each([
    ["không details", { error: { code: "VALIDATION_ERROR", message: "x" } }],
    [
      "details chỉ khóa lạ",
      { error: { code: "VALIDATION_ERROR", message: "x", details: { target: "y" } } },
    ],
    ["details là mảng", { error: { code: "VALIDATION_ERROR", message: "x", details: ["a"] } }],
    ["mã lỗi khác", { error: { code: "OTHER", message: "x", details: { trackingCode: "y" } } }],
  ])("400 %s vẫn là error chung", async (_n, body) => {
    fetchMock.mockReturnValue(json(body, 400));
    expect(await transitionStaffOrder("A", "shipping")).toEqual({
      kind: "error",
      message: "Không thể cập nhật đơn, vui lòng thử lại.",
    });
  });
});
