import { afterEach, describe, expect, it, vi } from "vitest";
import { loadStaffOrder } from "./load-staff-order";

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const validOrder = { id: "SL-1", items: [], statusHistory: [], internalNotes: [] };

afterEach(() => vi.unstubAllGlobals());

describe("loadStaffOrder", () => {
  it("200 hợp lệ trả ok; gọi đúng URL, no-store, truyền signal", async () => {
    const fetchMock = stubFetch(() => json(validOrder));
    const signal = new AbortController().signal;
    expect(await loadStaffOrder("SL-1", signal)).toEqual({ kind: "ok", order: validOrder });
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/orders/SL-1", {
      cache: "no-store",
      signal,
    });
  });

  it("id có ký tự lạ được encodeURIComponent", async () => {
    const fetchMock = stubFetch(() => json(validOrder));
    await loadStaffOrder("a/b?c#d e");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/staff/orders/a%2Fb%3Fc%23d%20e");
  });

  it("401 là unauthorized", async () => {
    stubFetch(() => json({ error: "x" }, 401));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "unauthorized" });
  });

  it("404 là not_found", async () => {
    stubFetch(() => json({ error: "x" }, 404));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "not_found" });
  });

  it("500 là error", async () => {
    stubFetch(() => json({}, 500));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "error" });
  });

  it("fetch ném là error", async () => {
    stubFetch(() => Promise.reject(new TypeError("down")));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "error" });
  });

  it.each([
    ["thiếu items", { id: "x", statusHistory: [], internalNotes: [] }],
    ["thiếu statusHistory", { id: "x", items: [], internalNotes: [] }],
    ["thiếu internalNotes", { id: "x", items: [], statusHistory: [] }],
    ["id không phải chuỗi", { id: 1, items: [], statusHistory: [], internalNotes: [] }],
    ["null", null],
    ["mảng", []],
  ])("thân 200 hỏng (%s) là error", async (_n, body) => {
    stubFetch(() => json(body));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "error" });
  });

  it("thân không phải JSON là error", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>", { status: 200 })));
    expect(await loadStaffOrder("SL-1")).toEqual({ kind: "error" });
  });

  it("AbortError trả null", async () => {
    stubFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    expect(await loadStaffOrder("SL-1")).toBeNull();
  });
});
