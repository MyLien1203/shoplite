import { afterEach, describe, expect, it, vi } from "vitest";
import { loadStaffOrders } from "./load-staff-orders";

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("loadStaffOrders", () => {
  it("200 hợp lệ trả ok kèm orders và counts; gọi đúng URL, no-store", async () => {
    const counts = { active: 1, all: 1 };
    const fetchMock = stubFetch(() => json({ orders: [{ id: "A" }], counts }));
    const signal = new AbortController().signal;
    const result = await loadStaffOrders("active", signal);
    expect(result).toEqual({ kind: "ok", orders: [{ id: "A" }], counts });
    expect(fetchMock).toHaveBeenCalledWith("/api/orders?status=active", {
      cache: "no-store",
      signal,
    });
  });

  it("401 là unauthorized", async () => {
    stubFetch(() => json({ error: "x" }, 401));
    expect(await loadStaffOrders("active")).toEqual({ kind: "unauthorized" });
  });

  it("500 là error", async () => {
    stubFetch(() => json({}, 500));
    expect(await loadStaffOrders("active")).toEqual({ kind: "error" });
  });

  it.each([
    ["thiếu orders", { counts: {} }],
    ["orders không phải mảng", { orders: 1 }],
    ["null", null],
  ])("thân 200 hỏng (%s) là error", async (_n, body) => {
    stubFetch(() => json(body));
    expect(await loadStaffOrders("active")).toEqual({ kind: "error" });
  });

  it("thân không phải JSON là error", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>", { status: 200 })));
    expect(await loadStaffOrders("active")).toEqual({ kind: "error" });
  });

  it("fetch ném lỗi là error", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await loadStaffOrders("active")).toEqual({ kind: "error" });
  });

  it("AbortError bị bỏ qua (null)", async () => {
    stubFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    expect(await loadStaffOrders("active")).toBeNull();
  });
});
