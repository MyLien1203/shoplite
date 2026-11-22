import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderStatus } from "@/features/orders/types";
import { StaffOrderItem } from "./staff-order-item";

function makeOrder(id: string, status: OrderStatus = "pending"): Order {
  const at = new Date(Date.now() - 3_600_000).toISOString();
  return {
    id,
    status,
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
    statusHistory: [{ status, at }],
    internalNotes: [],
  };
}

const json = (body: unknown, status: number) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
const cb = { onTransitioned: vi.fn(), onStale: vi.fn(), onUnauthorized: vi.fn() };

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  cb.onTransitioned.mockReset();
  cb.onStale.mockReset();
  cb.onUnauthorized.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function renderItem(order: Order) {
  return render(
    <ul>
      <StaffOrderItem order={order} now={Date.now()} {...cb} />
    </ul>,
  );
}

describe("<StaffOrderItem />", () => {
  it("Chờ xác nhận: Xác nhận (primary) và Hủy (secondary), md, h-12 flex-1 dưới sm, cùng hàng gap-2", () => {
    renderItem(makeOrder("SL-1"));
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName("Xác nhận đơn SL-1");
    expect(buttons[0]).toHaveTextContent("Xác nhận");
    expect(buttons[0]).toHaveClass("bg-indigo-600", "h-10", "max-sm:h-12", "max-sm:flex-1");
    expect(buttons[1]).toHaveAccessibleName("Hủy đơn SL-1");
    expect(buttons[1]).toHaveTextContent("Hủy");
    expect(buttons[1]).toHaveClass("bg-white", "h-10", "max-sm:h-12", "max-sm:flex-1");
    expect(buttons[1]).toHaveAttribute("aria-expanded", "false");
    expect(buttons[1]).toHaveAttribute("aria-controls");
    expect(buttons[0].parentElement).toBe(buttons[1].parentElement);
    expect(buttons[0].parentElement).toHaveClass("flex", "gap-2");
    expect(buttons[0].parentElement).not.toHaveClass("flex-col");
  });

  it("Đang giao: nút Đã giao với aria-label riêng", () => {
    renderItem(makeOrder("SL-2", "shipping"));
    expect(screen.getByRole("button", { name: "Đánh dấu đã giao đơn SL-2" })).toHaveTextContent(
      "Đã giao",
    );
  });

  it.each(["delivered", "cancelled"] as const)(
    "%s: không nút, không khung actions rỗng",
    (status) => {
      const { container } = renderItem(makeOrder("SL-3", status));
      expect(screen.queryByRole("button")).toBeNull();
      expect(container.querySelector(".sm\\:shrink-0")).toBeNull();
    },
  );

  it("bấm: một fetch với target, đang gửi disabled + nhãn mới, chưa đổi trước khi server trả", async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    const btn = screen.getByRole("button", { name: "Xác nhận đơn SL-1" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Đang xác nhận…");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/staff/orders/SL-1/transition");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ target: "confirmed" });
    expect(cb.onTransitioned).not.toHaveBeenCalled();
    const done = { ...makeOrder("SL-1"), status: "confirmed" };
    await act(async () => resolve(new Response(JSON.stringify(done), { status: 200 })));
    expect(cb.onTransitioned).toHaveBeenCalledWith(done);
  });

  it("Đã giao: nhãn đang gửi là Đang cập nhật…", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-2", "shipping"));
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Đang cập nhật…");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ target: "delivered" });
  });

  it("bấm đôi cùng tick chỉ một fetch", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-1"));
    const btn = screen.getByRole("button", { name: "Xác nhận đơn SL-1" });
    act(() => {
      btn.click();
      btn.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("INSUFFICIENT_STOCK: lời server trong role=alert rose, nút bật lại và nhận tiêu điểm", async () => {
    const user = userEvent.setup();
    const msg = 'Sản phẩm "Áo" chỉ còn 1 sản phẩm';
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    // trình duyệt làm mất tiêu điểm khi nút bị disabled: mô phỏng bằng cách chuyển tiêu điểm đi nơi khác
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    expect(other).toHaveFocus();
    await act(async () =>
      resolve(
        new Response(JSON.stringify({ error: { code: "INSUFFICIENT_STOCK", message: msg } }), {
          status: 409,
        }),
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(msg);
    expect(alert).toHaveClass("bg-rose-50", "text-rose-700");
    const btn = screen.getByRole("button", { name: "Xác nhận đơn SL-1" });
    expect(btn).toBeEnabled();
    expect(btn).toHaveFocus();
    other.remove();
    expect(screen.getByText("Chờ xác nhận")).toBeVisible();
    expect(cb.onTransitioned).not.toHaveBeenCalled();
  });

  it("bấm lại xóa thông báo cũ rồi gửi lại", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(json({}, 500));
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể cập nhật đơn, vui lòng thử lại.",
    );
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("mất mạng: lời kết nối trong role=alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("down"));
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ, vui lòng thử lại.",
    );
  });

  it("stale: gọi onStale, hiện Đơn vừa được cập nhật. trong role=status, nút bật lại", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({ error: { code: "INVALID_STATUS_TRANSITION", message: "x" } }, 409),
    );
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(cb.onStale).toHaveBeenCalledWith("SL-1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận đơn SL-1" })).toBeEnabled();
  });

  it("401: gọi onUnauthorized, không alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json({}, 401));
    renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    await waitFor(() => expect(cb.onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("unmount khi đang gửi: hủy fetch, không setState, không cảnh báo", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((r) => (resolve = r));
    });
    const { unmount } = renderItem(makeOrder("SL-1"));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn SL-1" }));
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(new Response("{}", { status: 500 })));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(cb.onTransitioned).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("mã nguồn không chứa confirm(, toast, dialog, draggable, PATCH, router.refresh", () => {
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/staff-order-item.tsx"),
      "utf8",
    );
    for (const banned of [
      "confirm(",
      "toast",
      "dialog",
      "draggable",
      "window.confirm",
      "router.refresh",
      "PATCH",
      "cancel-order-button",
      "localStorage",
      "setInterval",
      "[#",
      "rounded-[",
    ]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});

describe("<StaffOrderItem /> hủy qua panel xác nhận (2.12)", () => {
  const cancelBtn = () => screen.getByRole("button", { name: "Hủy đơn SL-1" });
  const confirmBtn = () => screen.getByRole("button", { name: "Xác nhận đơn SL-1" });
  const panel = () => screen.queryByRole("group");
  const doCancel = () => screen.getByRole("button", { name: "Xác nhận hủy" });
  const no = () => screen.getByRole("button", { name: "Không" });
  const lastBody = () =>
    JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body) as unknown;

  it.each(["confirmed", "shipping", "delivered", "cancelled"] as const)(
    "%s: không nút Hủy, không panel",
    (status) => {
      renderItem(makeOrder("SL-1", status));
      expect(screen.queryByRole("button", { name: /Hủy đơn/ })).toBeNull();
      expect(panel()).toBeNull();
    },
  );

  it("bấm Hủy: panel rose-50 hiện, tiêu điểm vào khung panel, chưa fetch, aria-expanded/controls đúng", async () => {
    const user = userEvent.setup();
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    const group = screen.getByRole("group", { name: "Bạn chắc chắn muốn hủy đơn hàng này?" });
    expect(group).toHaveClass("bg-rose-50", "rounded-xl", "p-4", "text-sm");
    expect(group).toHaveAttribute("tabindex", "-1");
    expect(group).toHaveFocus();
    expect(screen.getByText("Bạn chắc chắn muốn hủy đơn hàng này?")).toHaveClass("text-rose-900");
    expect(cancelBtn()).toHaveAttribute("aria-expanded", "true");
    expect(cancelBtn().getAttribute("aria-controls")).toBe(group.id);
    expect(doCancel()).toHaveClass("bg-rose-600", "h-10", "max-sm:h-12", "max-sm:flex-1");
    expect(no()).toHaveClass("bg-white", "h-10", "max-sm:h-12", "max-sm:flex-1");
    expect(doCancel().parentElement).toBe(no().parentElement);
    expect(doCancel().parentElement).toHaveClass("gap-2");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Không: đóng panel, tiêu điểm về Hủy, không fetch", async () => {
    const user = userEvent.setup();
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(no());
    expect(panel()).toBeNull();
    expect(cancelBtn()).toHaveFocus();
    expect(cancelBtn()).toHaveAttribute("aria-expanded", "false");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bấm lại Hủy (toggle) đóng panel, tiêu điểm ở Hủy, không fetch", async () => {
    const user = userEvent.setup();
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(cancelBtn());
    expect(panel()).toBeNull();
    expect(cancelBtn()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Esc khi tiêu điểm ở khung panel hoặc trong khung actions: đóng, tiêu điểm về Hủy", async () => {
    const user = userEvent.setup();
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.keyboard("{Escape}");
    expect(panel()).toBeNull();
    expect(cancelBtn()).toHaveFocus();
    await user.click(cancelBtn());
    confirmBtn().focus();
    await user.keyboard("{Escape}");
    expect(panel()).toBeNull();
    expect(cancelBtn()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Esc khi panel đóng không làm gì", async () => {
    const user = userEvent.setup();
    renderItem(makeOrder("SL-1"));
    confirmBtn().focus();
    await user.keyboard("{Escape}");
    expect(confirmBtn()).toHaveFocus();
  });

  it("Xác nhận hủy: đúng một fetch { target: cancelled }, đang hủy disabled, chưa gọi onTransitioned; ok thì gọi và đóng panel", async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/staff/orders/SL-1/transition");
    expect(lastBody()).toEqual({ target: "cancelled" });
    const sending = screen.getByRole("button", { name: "Đang hủy…" });
    expect(sending).toBeDisabled();
    expect(no()).toBeDisabled();
    expect(cancelBtn()).toBeDisabled();
    expect(confirmBtn()).toBeDisabled();
    expect(cb.onTransitioned).not.toHaveBeenCalled();
    const done = { ...makeOrder("SL-1"), status: "cancelled" };
    await act(async () => resolve(new Response(JSON.stringify(done), { status: 200 })));
    expect(cb.onTransitioned).toHaveBeenCalledWith(done);
    expect(panel()).toBeNull();
  });

  it("bấm đôi Xác nhận hủy cùng tick chỉ một fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    const btn = doCancel();
    act(() => {
      btn.click();
      btn.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("đang gửi: Esc và Không bị bỏ qua, panel không đóng", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    await user.keyboard("{Escape}");
    fireEvent.keyDown(screen.getByRole("group"), { key: "Escape" });
    fireEvent.keyDown(cancelBtn(), { key: "Escape" });
    fireEvent.click(no());
    fireEvent.click(cancelBtn());
    expect(panel()).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Xác nhận khi panel mở: đóng panel rồi gửi confirmed, một fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(confirmBtn());
    expect(panel()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody()).toEqual({ target: "confirmed" });
    expect(cancelBtn()).toBeDisabled();
  });

  it("Xác nhận đang gửi: Hủy disabled, không mở panel, không fetch thứ hai", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderItem(makeOrder("SL-1"));
    await user.click(confirmBtn());
    expect(cancelBtn()).toBeDisabled();
    fireEvent.click(cancelBtn());
    expect(panel()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "mất mạng",
      () => Promise.reject(new TypeError("down")),
      "Không kết nối được máy chủ, vui lòng thử lại.",
    ],
    ["5xx", () => json({}, 500), "Không thể cập nhật đơn, vui lòng thử lại."],
    [
      "thân 200 hỏng",
      () => Promise.resolve(new Response("{}", { status: 200 })),
      "Không thể cập nhật đơn, vui lòng thử lại.",
    ],
    [
      "stock (phòng thủ)",
      () => json({ error: { code: "INSUFFICIENT_STOCK", message: "Lời server" } }, 409),
      "Không thể cập nhật đơn, vui lòng thử lại.",
    ],
  ])(
    "%s: panel giữ mở, role=alert trong panel, nút bật lại, tiêu điểm về Xác nhận hủy",
    async (_name, reply, text) => {
      const user = userEvent.setup();
      fetchMock.mockImplementation(reply);
      renderItem(makeOrder("SL-1"));
      await user.click(cancelBtn());
      await user.click(doCancel());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(text);
      expect(alert).toHaveClass("text-rose-700");
      expect(screen.getByRole("group")).toContainElement(alert);
      expect(doCancel()).toBeEnabled();
      expect(doCancel()).toHaveTextContent("Xác nhận hủy");
      await waitFor(() => expect(doCancel()).toHaveFocus());
      expect(cb.onTransitioned).not.toHaveBeenCalled();
      expect(cb.onStale).not.toHaveBeenCalled();
      fetchMock.mockReturnValueOnce(new Promise(() => {}));
      await user.click(doCancel());
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("lỗi rồi đóng panel và mở lại: lời lỗi đã xóa", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(json({}, 500));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    await screen.findByRole("alert");
    await user.click(no());
    await user.click(cancelBtn());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stale: đóng panel, gọi onStale, hiện Đơn vừa được cập nhật.", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({ error: { code: "INVALID_STATUS_TRANSITION", message: "x" } }, 409),
    );
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    expect(await screen.findByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(cb.onStale).toHaveBeenCalledWith("SL-1");
    expect(panel()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cancelBtn()).toBeEnabled();
  });

  it("401: gọi onUnauthorized, không alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json({}, 401));
    renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    await waitFor(() => expect(cb.onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lời stock của Xác nhận vẫn hiện, Hủy dùng được; Xác nhận hủy xóa lời stock", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(
      json({ error: { code: "INSUFFICIENT_STOCK", message: "Hết hàng Áo" } }, 409),
    );
    renderItem(makeOrder("SL-1"));
    await user.click(confirmBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent("Hết hàng Áo");
    await user.click(cancelBtn());
    expect(screen.getByRole("group")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Hết hàng Áo");
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(doCancel());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lastBody()).toEqual({ target: "cancelled" });
  });

  it("panel nằm dưới lời stock khi có cả hai", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(
      json({ error: { code: "INSUFFICIENT_STOCK", message: "Hết hàng Áo" } }, 409),
    );
    renderItem(makeOrder("SL-1"));
    await user.click(confirmBtn());
    const alert = await screen.findByRole("alert");
    await user.click(cancelBtn());
    expect(alert.compareDocumentPosition(screen.getByRole("group"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("đơn đổi sang trạng thái khác (prop): panel tự đóng, không nút Hủy", async () => {
    const user = userEvent.setup();
    const view = renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    view.rerender(
      <ul>
        <StaffOrderItem order={makeOrder("SL-1", "confirmed")} now={Date.now()} {...cb} />
      </ul>,
    );
    expect(panel()).toBeNull();
    expect(screen.queryByRole("button", { name: /Hủy đơn/ })).toBeNull();
  });

  it("render lại cùng đơn (làm mới): panel và tiêu điểm giữ nguyên", async () => {
    const user = userEvent.setup();
    const order = makeOrder("SL-1");
    const view = renderItem(order);
    await user.click(cancelBtn());
    view.rerender(
      <ul>
        <StaffOrderItem order={{ ...order }} now={Date.now() + 1000} {...cb} />
      </ul>,
    );
    expect(screen.getByRole("group")).toHaveFocus();
    expect(cancelBtn()).toHaveAttribute("aria-expanded", "true");
  });

  it("unmount khi đang hủy: hủy fetch, không setState, không cảnh báo", async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((r) => (resolve = r));
    });
    const { unmount } = renderItem(makeOrder("SL-1"));
    await user.click(cancelBtn());
    await user.click(doCancel());
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(new Response("{}", { status: 500 })));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("<StaffOrderItem /> giao hàng kèm mã vận đơn (2.13)", () => {
  const CREATED = "2026-11-20T18:30:00.000Z";
  const confirmed = () => ({ ...makeOrder("SL-1", "confirmed"), createdAt: CREATED });
  const shipBtn = () => screen.getByRole("button", { name: "Giao hàng đơn SL-1" });
  const startBtn = () => screen.getByRole("button", { name: /Bắt đầu giao|Đang chuyển/ });
  const code = () => screen.getByLabelText("Mã vận đơn");
  const date = () => screen.getByLabelText("Ngày giao dự kiến");
  const lastBody = () =>
    JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body) as unknown;
  const SHIPPED = { ...confirmed(), status: "shipping" as const };
  const shippingOrder = () => SHIPPED;

  it("nút Giao hàng chỉ ở confirmed: primary md, aria-expanded false, controls trỏ panel, không panel", () => {
    renderItem(confirmed());
    expect(shipBtn()).toHaveAttribute("aria-expanded", "false");
    expect(shipBtn()).toHaveAttribute("aria-controls", "shipping-panel-SL-1");
    expect(shipBtn()).toHaveClass("bg-indigo-600", "max-sm:h-12", "max-sm:w-full", "h-10");
    expect(screen.queryByLabelText("Mã vận đơn")).toBeNull();
  });

  it.each(["pending", "shipping", "delivered", "cancelled"] as const)(
    "%s: không nút Giao hàng",
    (status) => {
      renderItem(makeOrder("SL-1", status));
      expect(screen.queryByRole("button", { name: /Giao hàng đơn/ })).toBeNull();
    },
  );

  it("pending chỉ có Xác nhận và Hủy", () => {
    renderItem(makeOrder("SL-1", "pending"));
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Xác nhận đơn SL-1",
      "Hủy đơn SL-1",
    ]);
  });

  it("bấm mở panel: aria-expanded true, tiêu điểm ô mã, min ngày VN, chưa fetch", async () => {
    renderItem(confirmed());
    await userEvent.setup().click(shipBtn());
    expect(shipBtn()).toHaveAttribute("aria-expanded", "true");
    expect(code()).toHaveFocus();
    expect(date()).toHaveAttribute("min", "2026-11-21");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Esc đóng, tiêu điểm về nút; bấm lại nút cũng đóng; đóng xóa dữ liệu đã nhập", async () => {
    const user = userEvent.setup();
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.type(code(), "GHN1");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Mã vận đơn")).toBeNull();
    expect(shipBtn()).toHaveFocus();
    expect(shipBtn()).toHaveAttribute("aria-expanded", "false");
    await user.click(shipBtn());
    expect(code()).toHaveValue("");
    await user.type(code(), "X");
    await user.click(shipBtn());
    expect(screen.queryByLabelText("Mã vận đơn")).toBeNull();
    expect(shipBtn()).toHaveFocus();
    await user.click(shipBtn());
    expect(code()).toHaveValue("");
  });

  it("để trống: body đúng { target: shipping }, đang chuyển khóa mọi thứ, ok gọi onTransitioned", async () => {
    const user = userEvent.setup();
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/staff/orders/SL-1/transition");
    expect(lastBody()).toEqual({ target: "shipping" });
    expect(startBtn()).toBeDisabled();
    expect(startBtn()).toHaveTextContent("Đang chuyển…");
    expect(shipBtn()).toBeDisabled();
    expect(code()).toHaveAttribute("readonly");
    await user.keyboard("{Escape}");
    expect(code()).toBeInTheDocument();
    expect(cb.onTransitioned).not.toHaveBeenCalled();
    await act(async () => resolve(new Response(JSON.stringify(shippingOrder()), { status: 200 })));
    expect(cb.onTransitioned).toHaveBeenCalledWith(shippingOrder());
  });

  it("đủ hai trường: body có trackingCode đã trim và ngày", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json(shippingOrder(), 200));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.type(code(), "  GHN123  ");
    fireEvent.change(date(), { target: { value: "2026-11-25" } });
    await user.click(startBtn());
    await waitFor(() => expect(cb.onTransitioned).toHaveBeenCalled());
    expect(lastBody()).toEqual({
      target: "shipping",
      trackingCode: "GHN123",
      expectedDeliveryDate: "2026-11-25",
    });
  });

  it("lỗi client: không fetch", async () => {
    const user = userEvent.setup();
    renderItem(confirmed());
    await user.click(shipBtn());
    fireEvent.change(date(), { target: { value: "2026-11-20" } });
    await user.click(startBtn());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(date()).toHaveAttribute("aria-invalid", "true");
  });

  it("bấm đôi Bắt đầu giao cùng tick chỉ một fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    renderItem(confirmed());
    await user.click(shipBtn());
    const form = code().closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("400 VALIDATION_ERROR có details: lỗi đúng ô, giữ dữ liệu, tiêu điểm ô lỗi, gửi lại được", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(
      json(
        { error: { code: "VALIDATION_ERROR", message: "x", details: { trackingCode: "Mã sai" } } },
        400,
      ),
    );
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.type(code(), "GHN9");
    await user.click(startBtn());
    expect(await screen.findByText("Mã sai.")).toBeVisible();
    expect(code()).toHaveValue("GHN9");
    expect(code()).toHaveAttribute("aria-invalid", "true");
    expect(code()).toHaveFocus();
    expect(date()).not.toHaveAttribute("aria-invalid");
    expect(startBtn()).toBeEnabled();
    fetchMock.mockReturnValueOnce(json(shippingOrder(), 200));
    await user.click(startBtn());
    await waitFor(() => expect(cb.onTransitioned).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lỗi mạng: alert chung trong panel, giữ dữ liệu, nút bật lại, bấm lại gửi lại", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("net"));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.type(code(), "GHN9");
    await user.click(startBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ, vui lòng thử lại.",
    );
    expect(code()).toHaveValue("GHN9");
    expect(startBtn()).toBeEnabled();
    fetchMock.mockReturnValueOnce(json(shippingOrder(), 200));
    await user.click(startBtn());
    await waitFor(() => expect(cb.onTransitioned).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("500: alert chung, không lỗi từng ô", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json({ error: { code: "X", message: "x" } }, 500));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể cập nhật đơn, vui lòng thử lại.",
    );
    expect(code()).not.toHaveAttribute("aria-invalid");
  });

  it("stale 409: panel đóng, onStale, Đơn vừa được cập nhật.", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      json({ error: { code: "INVALID_STATUS_TRANSITION", message: "x" } }, 409),
    );
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    expect(await screen.findByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(cb.onStale).toHaveBeenCalledWith("SL-1");
    expect(screen.queryByLabelText("Mã vận đơn")).toBeNull();
  });

  it("404 ORDER_NOT_FOUND: coi là stale", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json({ error: { code: "ORDER_NOT_FOUND", message: "x" } }, 404));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    await waitFor(() => expect(cb.onStale).toHaveBeenCalledWith("SL-1"));
  });

  it("401: gọi onUnauthorized, không alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(json({}, 401));
    renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    await waitFor(() => expect(cb.onUnauthorized).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("unmount khi đang gửi: hủy fetch, không cảnh báo", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = renderItem(confirmed());
    await user.click(shipBtn());
    await user.click(startBtn());
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("đơn đổi sang trạng thái khác (prop): panel tự đóng, nút thành Đã giao", async () => {
    const user = userEvent.setup();
    const { rerender } = renderItem(confirmed());
    await user.click(shipBtn());
    rerender(
      <ul>
        <StaffOrderItem order={shippingOrder()} now={Date.now()} {...cb} />
      </ul>,
    );
    expect(screen.queryByLabelText("Mã vận đơn")).toBeNull();
    expect(screen.getByRole("button", { name: "Đánh dấu đã giao đơn SL-1" })).toBeInTheDocument();
  });
});
