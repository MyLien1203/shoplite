import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderLookupForm } from "./order-lookup-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";

describe("OrderLookupForm", () => {
  beforeEach(() => {
    push.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ô trống: báo lỗi từng ô, không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderLookupForm />);
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));
    expect(screen.getByTestId("error-orderId")).toHaveTextContent("Vui lòng nhập Mã đơn.");
    expect(screen.getByTestId("error-phone")).toHaveTextContent("Vui lòng nhập số điện thoại.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SĐT sai dạng: báo lỗi, không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderLookupForm />);
    await userEvent.type(screen.getByLabelText(/Mã đơn/), "SL-1");
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));
    expect(screen.getByTestId("error-phone")).toHaveTextContent(
      "Số điện thoại không hợp lệ (ví dụ: 0912345678)",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("200: gọi API và chuyển tới /orders/<orderId>", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ orderId: "SL-20261021-4F9A2C" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderLookupForm />);
    await userEvent.type(screen.getByLabelText(/Mã đơn/), "sl-20261021-4f9a2c");
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), "0912345678");
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/SL-20261021-4F9A2C"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/orders/lookup");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ orderId: "sl-20261021-4f9a2c", phone: "0912345678" });
  });

  it("404: lỗi chung trong role=alert, giữ nguyên giá trị đã nhập", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "ORDER_NOT_FOUND", message: NOT_FOUND } }), {
          status: 404,
        }),
      ),
    );
    render(<OrderLookupForm />);
    await userEvent.type(screen.getByLabelText(/Mã đơn/), "SL-X");
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), "0912345678");
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(NOT_FOUND);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-X");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("0912345678");
    expect(push).not.toHaveBeenCalled();
  });

  it("defaultOrderId và initialError: điền sẵn Mã đơn và hiện lỗi trong role=alert", () => {
    render(<OrderLookupForm defaultOrderId="SL-20261021-4F9A2C" initialError={NOT_FOUND} />);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("SL-20261021-4F9A2C");
    expect(screen.getByLabelText(/Số điện thoại/)).toHaveValue("");
    expect(screen.getByRole("alert")).toHaveTextContent(NOT_FOUND);
  });

  it("không có prop: ô trống và không có alert", () => {
    render(<OrderLookupForm />);
    expect(screen.getByLabelText(/Mã đơn/)).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lỗi mạng: báo lỗi chung", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<OrderLookupForm />);
    await userEvent.type(screen.getByLabelText(/Mã đơn/), "SL-X");
    await userEvent.type(screen.getByLabelText(/Số điện thoại/), "0912345678");
    await userEvent.click(screen.getByRole("button", { name: "Xem đơn hàng" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không kết nối được máy chủ");
  });
});
