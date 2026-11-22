import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderLookupEntry } from "./order-lookup-entry";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));

const NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";
const LOCKED = "Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau 15 phút.";
const NETWORK = "Không kết nối được máy chủ, vui lòng thử lại.";

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: "X", message } }), { status });
}

function setUrl(path: string) {
  window.history.replaceState(null, "", path);
}

describe("OrderLookupEntry", () => {
  let replaceState: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replace.mockReset();
    setUrl("/orders");
    replaceState = vi.spyOn(window.history, "replaceState");
  });
  afterEach(() => {
    replaceState.mockRestore();
    vi.unstubAllGlobals();
    setUrl("/");
  });

  it("liên kết đúng: xóa fragment trước fetch, hiện 'Đang mở…', rồi router.replace", async () => {
    setUrl("/orders#code=SL-20261021-4F9A2C&phone=0912345678");
    replaceState.mockClear();
    const order: string[] = [];
    replaceState.mockImplementation(() => {
      order.push("replaceState");
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      order.push("fetch");
      return new Response(JSON.stringify({ orderId: "SL-20261021-4F9A2C" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OrderLookupEntry />);
    expect(await screen.findByRole("status")).toHaveTextContent("Đang mở đơn hàng của bạn…");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/orders/SL-20261021-4F9A2C"));

    expect(order).toEqual(["replaceState", "fetch"]);
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", "/orders");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/orders/lookup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      orderId: "SL-20261021-4F9A2C",
      phone: "0912345678",
    });
  });

  it("giữ nguyên query khi xóa fragment", async () => {
    setUrl("/orders?a=1#code=SL-1&phone=0912345678");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ orderId: "SL-1" }))),
    );
    render(<OrderLookupEntry />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", "/orders?a=1");
  });

  it("SĐT %2B84 và + trần: gửi đúng chuỗi +84…, Mã đơn được trim", async () => {
    for (const phoneParam of ["%2B84912345678", "+84912345678"]) {
      replace.mockReset();
      setUrl(`/orders#code=%20sl-2026%20&phone=${phoneParam}`);
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ orderId: "SL-2026" })));
      vi.stubGlobal("fetch", fetchMock);
      const { unmount } = render(<OrderLookupEntry />);
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/orders/SL-2026"));
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        orderId: "sl-2026",
        phone: "+84912345678",
      });
      unmount();
    }
  });

  it("404: form điền sẵn Mã đơn, SĐT trống, lỗi trong role=alert", async () => {
    setUrl("/orders#code=SL-1&phone=0912345679");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(404, NOT_FOUND)));
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_FOUND);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-1");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("429: hiện lời của server", async () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(429, LOCKED)));
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(LOCKED);
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
  });

  it.each([[500], [502]])("%i thân hỏng: lời mất kết nối máy chủ", async (status) => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status })),
    );
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-1");
  });

  it("4xx thân hỏng: dùng lời không tìm thấy", async () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 400 })));
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_FOUND);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-1");
  });

  it("lỗi mạng: form điền sẵn Mã đơn, SĐT trống, lời mất kết nối", async () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NETWORK);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-1");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
  });

  it.each([
    "/orders#code=SL-1",
    "/orders#phone=0912345678",
    "/orders#code=&phone=",
    "/orders#code=SL-1&phone=abc",
    "/orders#code=SL-1&phone=%E0%A4%A",
  ])("%s: form trống, không lỗi, không gọi API, fragment bị xóa", async (path) => {
    setUrl(path);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderLookupEntry />);
    expect(await screen.findByLabelText(/Mã đơn/)).toHaveValue("");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", "/orders");
  });

  it.each(["/orders", "/orders#abc"])(
    "%s: form bình thường, fragment khác để nguyên",
    async (path) => {
      setUrl(path);
      replaceState.mockClear();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      render(<OrderLookupEntry />);
      expect(await screen.findByLabelText(/Mã đơn/)).toHaveValue("");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.hash).toBe(path.includes("#") ? "#abc" : "");
    },
  );

  it("sau effect: chỉ hiện 'Đang mở…', không bao giờ hiện form trong lúc chờ", () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<OrderLookupEntry />);
    // Sau effect đã sang "opening"; không bao giờ hiện form trong lúc chờ.
    expect(container.querySelector("form")).toBeNull();
  });

  it.each([
    ["thân không phải JSON", new Response("oops")],
    ["thiếu orderId", new Response(JSON.stringify({}))],
  ])("200 %s: form điền sẵn, lỗi chung, không điều hướng", async (_name, res) => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
    render(<OrderLookupEntry />);
    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_FOUND);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-1");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("render đầu (server/client đầu tiên) không có form và không có role=status", () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    const html = renderToString(<OrderLookupEntry />);
    expect(html).not.toContain("<form");
    expect(html).not.toContain('role="status"');
  });

  it("strict mode: một lần xóa fragment, một lần fetch", async () => {
    setUrl("/orders#code=SL-1&phone=0912345678");
    replaceState.mockClear();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orderId: "SL-1" })));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <StrictMode>
        <OrderLookupEntry />
      </StrictMode>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });
});
