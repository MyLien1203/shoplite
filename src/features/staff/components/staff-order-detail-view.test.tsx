import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/features/orders/types";
import { StaffOrderDetailView } from "./staff-order-detail-view";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

function makeOrder(id: string): Order {
  const at = new Date(Date.now() - 3_600_000).toISOString();
  return {
    id,
    status: "pending",
    createdAt: at,
    updatedAt: at,
    customer: { fullName: `Khách ${id}`, phone: "0356789012", address: "x" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [],
    subtotal: 0,
    shippingFee: 0,
    total: 1000,
    source: "web",
    statusHistory: [{ status: "pending", at }],
    internalNotes: [],
  };
}

const res = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  refresh.mockReset();
});

describe("<StaffOrderDetailView />", () => {
  it("đang tải: khung xương aria-busy, chữ sr-only, liên kết về danh sách", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StaffOrderDetailView orderId="SL-1" />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(screen.getByText("Đang tải chi tiết đơn")).toHaveClass("sr-only");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Về danh sách đơn" })).toHaveAttribute(
      "href",
      "/staff",
    );
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("thành công: hiện chi tiết, fetch đúng một lần tới API nhân viên, không /api/orders", async () => {
    fetchMock.mockReturnValue(res(makeOrder("SL-1")));
    render(<StaffOrderDetailView orderId="SL-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "SL-1" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/staff/orders/SL-1");
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/^\/api\/orders/);
    expect(screen.getByRole("link", { name: "Về danh sách đơn" })).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("401: replace + refresh, không render gì", async () => {
    fetchMock.mockReturnValue(res({ error: {} }, 401));
    const { container } = render(<StaffOrderDetailView orderId="SL-1" />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login?expired=1"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("404: lời không tìm thấy, không role=alert, có liên kết về danh sách", async () => {
    fetchMock.mockReturnValue(res({ error: {} }, 404));
    render(<StaffOrderDetailView orderId="SL-NOPE" />);
    expect(await screen.findByText("Không tìm thấy đơn hàng này.")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: "Về danh sách đơn" })).toHaveAttribute(
      "href",
      "/staff",
    );
  });

  it("lỗi: role=alert rose-50; Thử lại tải đúng một lần mỗi bấm", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    render(<StaffOrderDetailView orderId="SL-1" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không kết nối được máy chủ, vui lòng thử lại.");
    expect(alert).toHaveClass("bg-rose-50");
    expect(screen.getByRole("link", { name: "Về danh sách đơn" })).toBeVisible();

    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("thử lại thành công hiện chi tiết", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(res({}, 500));
    render(<StaffOrderDetailView orderId="SL-1" />);
    const retry = await screen.findByRole("button", { name: "Thử lại" });
    fetchMock.mockReturnValue(res(makeOrder("SL-1")));
    await user.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 1, name: "SL-1" })).toBeVisible();
  });

  it("thân 200 thiếu items là lỗi", async () => {
    fetchMock.mockReturnValue(res({ id: "x", statusHistory: [], internalNotes: [] }));
    render(<StaffOrderDetailView orderId="SL-1" />);
    expect(await screen.findByRole("alert")).toBeVisible();
  });

  it("unmount khi đang tải: abort và không setState sau đó", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const { unmount } = render(<StaffOrderDetailView orderId="SL-1" />);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveFetch(new Response(JSON.stringify(makeOrder("SL-1")), { status: 200 }));
    });
    expect(replace).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
