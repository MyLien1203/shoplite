import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancelOrderButton } from "./cancel-order-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

async function openPanel() {
  render(<CancelOrderButton orderId="SL-20261021-AAAAAA" />);
  await userEvent.click(screen.getByRole("button", { name: "Hủy đơn hàng" }));
}

describe("CancelOrderButton", () => {
  beforeEach(() => {
    refresh.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bấm Hủy đơn hàng hiện panel xác nhận; Không đóng panel", async () => {
    await openPanel();
    expect(screen.getByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Không" }));
    expect(screen.queryByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toBeNull();
    expect(screen.getByRole("button", { name: "Hủy đơn hàng" })).toBeInTheDocument();
  });

  it("thành công: gọi PATCH, đóng panel và refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: "cancelled" }, 200));
    vi.stubGlobal("fetch", fetchMock);
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders/SL-20261021-AAAAAA",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      }),
    );
    expect(screen.queryByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toBeNull();
  });

  it("404: role=alert đúng lời kèm liên kết Tra cứu đơn hàng tới /orders", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: "ORDER_NOT_FOUND", message: "Lời của server không dùng" } }, 404),
        ),
    );
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không thể hủy đơn. Vui lòng tra cứu lại đơn hàng.");
    expect(alert).not.toHaveTextContent("Lời của server không dùng");
    expect(screen.getByRole("link", { name: "Tra cứu đơn hàng" })).toHaveAttribute(
      "href",
      "/orders",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("409: hiện lời của server, không có liên kết, nút bấm lại được", async () => {
    const message = "Chỉ có thể hủy đơn hàng đang ở trạng thái Chờ xác nhận";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ error: { code: "INVALID_STATUS_TRANSITION", message } }, 409)),
    );
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("link", { name: "Tra cứu đơn hàng" })).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận hủy" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("body không phân tích được: lời chung, nút bấm lại được", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 500 })));
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể hủy đơn hàng");
    expect(screen.getByRole("button", { name: "Xác nhận hủy" })).toBeEnabled();
  });

  it("fetch ném lỗi: lời chung và nút vẫn bấm lại được", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể hủy đơn hàng");
    expect(screen.getByRole("button", { name: "Xác nhận hủy" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
