import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/features/orders/types";
import { StaffOrdersView } from "./staff-orders-view";

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

const okCounts = (orders: Order[], counts: Record<string, number>) =>
  Promise.resolve(new Response(JSON.stringify({ orders, counts }), { status: 200 }));

const ok = (orders: Order[]) =>
  Promise.resolve(new Response(JSON.stringify({ orders, counts: {} }), { status: 200 }));

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

describe("<StaffOrdersView />", () => {
  it("đang tải: khung xương aria-busy, chữ sr-only, không dòng thật", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(<StaffOrdersView />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(within(busy as HTMLElement).getByText("Đang tải danh sách đơn")).toHaveClass("sr-only");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByTestId("staff-order-row")).toBeNull();
  });

  it("có đơn: giữ nguyên thứ tự server, gọi fetch đúng một lần, nút Xác nhận trên mỗi dòng Chờ xác nhận, không liên kết", async () => {
    fetchMock.mockReturnValue(ok([makeOrder("C"), makeOrder("A"), makeOrder("B")]));
    render(<StaffOrdersView />);
    const rows = await screen.findAllByTestId("staff-order-row");
    expect(rows.map((r) => r.getAttribute("data-order-id"))).toEqual(["C", "A", "B"]);
    expect(screen.getByRole("list", { name: "Danh sách đơn cần xử lý" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/orders?status=active");
    const list = screen.getByRole("list", { name: "Danh sách đơn cần xử lý" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Xác nhận", "Hủy", "Xác nhận", "Hủy", "Xác nhận", "Hủy"]);
    expect(within(list).queryByRole("link")).toBeNull();
  });

  it("500 đơn: hiện đủ", async () => {
    const orders = Array.from({ length: 500 }, (_, i) => makeOrder(`O${i}`));
    fetchMock.mockReturnValue(ok(orders));
    render(<StaffOrdersView />);
    await waitFor(() => expect(screen.getAllByTestId("staff-order-row")).toHaveLength(500));
    expect(screen.getAllByTestId("staff-order-row")[499]).toHaveAttribute("data-order-id", "O499");
  });

  it("rỗng: lời đúng, không h2, không nút, chỉ một heading khớp /đơn cần xử lý/i", async () => {
    fetchMock.mockReturnValue(ok([]));
    render(
      <>
        <h1>Đơn cần xử lý</h1>
        <StaffOrdersView />
      </>,
    );
    expect(await screen.findByText("Không có đơn cần xử lý")).toBeVisible();
    expect(screen.getByText("Mọi đơn đã được xử lý. Đơn mới sẽ hiện ở đây.")).toBeVisible();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    const area = screen.getByRole("region", { name: "Kết quả danh sách đơn" });
    expect(within(area).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Làm mới"]);
    expect(screen.getAllByRole("heading", { name: /đơn cần xử lý/i })).toHaveLength(1);
  });

  it("lỗi mạng: role=alert; Thử lại tải đúng một lần mỗi bấm và trở về khung xương", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    render(<StaffOrdersView />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không kết nối được máy chủ, vui lòng thử lại.");
    expect(alert).toHaveClass("bg-rose-50");
    expect(screen.queryByTestId("staff-order-row")).toBeNull();

    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("Thử lại thành công thay bằng danh sách", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("{}", { status: 500 })));
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByTestId("staff-order-row")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("thân 200 hỏng là lỗi", async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response("{}", { status: 200 })));
    render(<StaffOrdersView />);
    expect(await screen.findByRole("alert")).toBeVisible();
  });

  it("401: chuyển tới đăng nhập kèm expired=1, refresh, không lỗi, không danh sách", async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response("{}", { status: 401 })));
    render(<StaffOrdersView />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login?expired=1"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("unmount khi đang tải: hủy fetch, không setState, không cảnh báo", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((res) => {
        resolve = res;
      });
    });
    const { unmount } = render(<StaffOrdersView />);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolve(new Response(JSON.stringify({ orders: [makeOrder("A")], counts: {} })));
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("mã nguồn không chứa toast, dialog, draggable, setInterval", () => {
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/staff-orders-view.tsx"),
      "utf8",
    );
    for (const banned of [
      "toast",
      "dialog",
      "draggable",
      "setInterval",
      "localStorage",
      "overflow-x",
      "[#",
      "rounded-[",
      "bg-[",
    ]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
}

const urls = () => fetchMock.mock.calls.map((c) => c[0]);
const live = () => screen.getByTestId("staff-orders-live");
const region = () => screen.getByRole("region", { name: "Kết quả danh sách đơn" });

describe("<StaffOrdersView /> lọc và làm mới (2.10)", () => {
  afterEach(() => {
    setVisibility("visible");
  });

  it("mở trang: chip Cần xử lý chọn sẵn kèm số, vùng live báo số", async () => {
    fetchMock.mockReturnValue(okCounts([makeOrder("A"), makeOrder("B")], { active: 7 }));
    render(<StaffOrdersView />);
    expect(live()).toHaveAttribute("aria-live", "polite");
    expect(live()).not.toHaveAttribute("role");
    expect(live()).toHaveTextContent("");
    await screen.findAllByTestId("staff-order-row");
    expect(screen.getByRole("radio", { name: "Cần xử lý (7)" })).toBeChecked();
    expect(live()).toHaveTextContent("Cần xử lý: 2 đơn.");
  });

  it("counts rỗng: chip không số, không NaN/undefined", async () => {
    fetchMock.mockReturnValue(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    expect(screen.getByRole("radio", { name: "Cần xử lý" })).toBeChecked();
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it("chọn chip: gọi đúng URL, khung xương, nhãn ul, live, tiêu điểm ở chip", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockReturnValueOnce(ok([makeOrder("S")]));
    await user.click(screen.getByText("Đang giao"));
    expect(urls()[1]).toBe("/api/orders?status=shipping");
    expect(await screen.findByRole("list", { name: "Danh sách đơn: Đang giao" })).toBeVisible();
    expect(live()).toHaveTextContent("Đang giao: 1 đơn.");
    expect(screen.getByRole("radio", { name: "Đang giao" })).toHaveFocus();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByText("Tất cả"));
    expect(urls()[2]).toBe("/api/orders?status=all");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(live()).toHaveTextContent("");
  });

  it.each(["pending", "confirmed", "delivered", "cancelled"] as const)(
    "chip %s gọi status tương ứng",
    async (status) => {
      const user = userEvent.setup();
      fetchMock.mockReturnValue(ok([]));
      render(<StaffOrdersView />);
      await screen.findByText("Không có đơn cần xử lý");
      const radio = document.querySelector(`input[value="${status}"]`) as HTMLElement;
      await user.click(radio);
      expect(urls()[1]).toBe(`/api/orders?status=${status}`);
    },
  );

  it("chọn lại chip đang chọn không fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    await user.click(screen.getByText("Cần xử lý"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("đổi chip nhanh: lần A bị hủy, chỉ kết quả B hiện", async () => {
    const user = userEvent.setup();
    const signals: AbortSignal[] = [];
    const resolvers: ((r: Response) => void)[] = [];
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((res) => resolvers.push(res));
    });
    render(<StaffOrdersView />);
    await user.click(screen.getByText("Chờ xác nhận"));
    await user.click(screen.getByText("Đang giao"));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(true);
    const body = (id: string) =>
      new Response(JSON.stringify({ orders: [makeOrder(id)], counts: {} }), { status: 200 });
    await act(async () => {
      resolvers[2](body("B"));
      resolvers[1](body("A"));
    });
    const rows = await screen.findAllByTestId("staff-order-row");
    expect(rows.map((r) => r.getAttribute("data-order-id"))).toEqual(["B"]);
  });

  it("bộ lọc rỗng: lời + Xem đơn cần xử lý đưa về active, tiêu điểm vào vùng kết quả", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockReturnValueOnce(ok([]));
    await user.click(screen.getByText("Đang giao"));
    expect(await screen.findByText("Không có đơn nào ở trạng thái này.")).toBeVisible();
    expect(screen.queryByText("Không có đơn cần xử lý")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Xem đơn cần xử lý" }));
    expect(region()).toHaveFocus();
    expect(urls()[2]).toBe("/api/orders?status=active");
    expect(screen.getByRole("radio", { name: "Cần xử lý" })).toBeChecked();
  });

  it("Tất cả rỗng dùng cùng lời", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockReturnValueOnce(ok([]));
    await user.click(screen.getByText("Tất cả"));
    expect(await screen.findByText("Không có đơn nào ở trạng thái này.")).toBeVisible();
  });

  it("đổi chip rồi lỗi: lỗi đầy đủ; Thử lại tải bộ lọc đang chọn, tiêu điểm vào vùng kết quả", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    await user.click(screen.getByText("Đã giao"));
    const retry = await screen.findByRole("button", { name: "Thử lại" });
    expect(screen.queryByTestId("staff-order-row")).toBeNull();
    fetchMock.mockReturnValueOnce(ok([makeOrder("D")]));
    await user.click(retry);
    expect(region()).toHaveFocus();
    expect(urls()[2]).toBe("/api/orders?status=delivered");
    expect(await screen.findByRole("list", { name: "Danh sách đơn: Đã giao" })).toBeVisible();
  });

  it("làm mới thành công: giữ danh sách cũ, aria-busy, aria-disabled giữ tiêu điểm, rồi thay dữ liệu", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(okCounts([makeOrder("A")], { active: 1 }));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    const btn = screen.getByRole("button", { name: "Làm mới" });
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-disabled", "true");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveFocus();
    expect(btn).toHaveTextContent("Đang làm mới…");
    expect(btn).toHaveClass("aria-disabled:opacity-50");
    expect(screen.getByRole("list", { name: "Danh sách đơn cần xử lý" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByTestId("staff-order-row")).toHaveAttribute("data-order-id", "A");
    await user.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({ orders: [makeOrder("N1"), makeOrder("N2")], counts: { active: 2 } }),
        ),
      );
    });
    await waitFor(() => expect(screen.getAllByTestId("staff-order-row")).toHaveLength(2));
    expect(screen.getByRole("radio", { name: "Cần xử lý (2)" })).toBeChecked();
    expect(btn).toHaveTextContent("Làm mới");
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(btn).toHaveFocus();
    expect(live()).toHaveTextContent("Cần xử lý: 2 đơn.");
  });

  it("làm mới lỗi: giữ danh sách, alert phía trên; lần sau thành công xóa alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("{}", { status: 500 })));
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Không kết nối được máy chủ, vui lòng thử lại.");
    expect(alert).toHaveClass("bg-rose-50");
    expect(within(alert).queryByRole("button")).toBeNull();
    expect(screen.getByTestId("staff-order-row")).toBeVisible();
    const following = alert.compareDocumentPosition(screen.getByRole("list"));
    expect(following & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fetchMock.mockReturnValueOnce(ok([makeOrder("B")]));
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByTestId("staff-order-row")).toHaveAttribute("data-order-id", "B");
  });

  it("làm mới 401: chuyển tới đăng nhập, không alert", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("{}", { status: 401 })));
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login?expired=1"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Làm mới khi đang error tải đầy đủ", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    render(<StaffOrdersView />);
    await screen.findByRole("alert");
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(await screen.findByTestId("staff-order-row")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("visibilitychange: visible tải một lần, hidden không, không tải chồng", async () => {
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    act(() => setVisibility("hidden"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    act(() => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("staff-order-row")).toBeVisible();
  });

  it("visibilitychange khi loading hoặc error không làm gì", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    const first = render(<StaffOrdersView />);
    act(() => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError("down"));
    render(<StaffOrdersView />);
    await screen.findByRole("alert");
    act(() => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unmount gỡ nghe visibilitychange", async () => {
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    const { unmount } = render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    unmount();
    act(() => setVisibility("visible"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("làm mới đè đổi chip: làm mới bị hủy, khung xương bộ lọc mới", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findByTestId("staff-order-row");
    let signal!: AbortSignal;
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise(() => {});
    });
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByText("Đã hủy"));
    expect(signal.aborted).toBe(true);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByTestId("staff-order-row")).toBeNull();
  });

  it("vùng kết quả luôn mount với tabindex -1; bấm Làm mới khi đang tải bị bỏ qua", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<StaffOrdersView />);
    expect(region()).toHaveAttribute("tabindex", "-1");
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const withStatus = (order: Order, status: Order["status"]): Order => ({ ...order, status });
const post = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const statusRegion = () => screen.getByTestId("staff-orders-transition-status");
const rowOf = (id: string) =>
  screen.getAllByTestId("staff-order-row").find((r) => r.getAttribute("data-order-id") === id)!;
const headingOf = (id: string) => within(rowOf(id)).getByRole("heading", { level: 2 });
const posts = () => fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");

/** GET trả `lists` lần lượt (lần cuối lặp lại); POST trả `onPost(url)`. */
function route(lists: Order[][], counts: Record<string, number>, onPost: (url: string) => unknown) {
  let g = 0;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === "POST") return onPost(url);
    const orders = lists[Math.min(g, lists.length - 1)];
    g += 1;
    return okCounts(orders, counts);
  });
}

describe("<StaffOrdersView /> xác nhận và đã giao một cú bấm (2.11)", () => {
  it("vùng role=status sr-only luôn có mặt, tách khỏi vùng aria-live của chip", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<StaffOrdersView />);
    expect(statusRegion()).toHaveAttribute("role", "status");
    expect(statusRegion()).toHaveClass("sr-only");
    expect(statusRegion()).not.toBe(live());
    expect(statusRegion()).toHaveTextContent("");
  });

  it("xác nhận: chờ server, rồi đổi tại chỗ, giữ thứ tự, không tải lại, counts giữ, tiêu điểm + status", async () => {
    const user = userEvent.setup();
    const [a, b] = [makeOrder("A"), makeOrder("B")];
    let resolve!: (r: Response) => void;
    route(
      [[a, b]],
      { active: 7, pending: 2, confirmed: 0, all: 9 },
      () => new Promise((r) => (resolve = r)),
    );
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    expect(screen.getByRole("button", { name: "Xác nhận đơn A" })).toBeDisabled();
    expect(within(rowOf("A")).getByText("Chờ xác nhận")).toBeVisible();
    expect(screen.getByRole("button", { name: "Xác nhận đơn B" })).toBeEnabled();
    await act(async () => resolve(new Response(JSON.stringify(withStatus(a, "confirmed")))));
    expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible();
    expect(within(rowOf("A")).queryByRole("button", { name: "Xác nhận đơn A" })).toBeNull();
    expect(within(rowOf("A")).getByRole("button", { name: "Giao hàng đơn A" })).toBeVisible();
    expect(screen.getAllByTestId("staff-order-row").map((r) => r.dataset.orderId)).toEqual([
      "A",
      "B",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(posts()).toHaveLength(1);
    expect(headingOf("A")).toHaveFocus();
    expect(statusRegion()).toHaveTextContent("Đã chuyển đơn A sang Đã xác nhận");
    expect(screen.getByRole("radio", { name: "Cần xử lý (7)" })).toBeChecked();
  });

  it("Đã giao ở Cần xử lý: dòng rời, counts giảm, tiêu điểm sang dòng kế, status đọc", async () => {
    const user = userEvent.setup();
    const [a, s, c] = [makeOrder("A"), withStatus(makeOrder("S"), "shipping"), makeOrder("C")];
    route([[a, s, c]], { active: 3, shipping: 1, delivered: 0 }, () =>
      post(200, withStatus(s, "delivered")),
    );
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã giao đơn S" }));
    await waitFor(() => expect(screen.queryByText("Khách S")).toBeNull());
    expect(screen.getAllByTestId("staff-order-row").map((r) => r.dataset.orderId)).toEqual([
      "A",
      "C",
    ]);
    expect(headingOf("C")).toHaveFocus();
    expect(statusRegion()).toHaveTextContent("Đã chuyển đơn S sang Đã giao");
    expect(screen.getByRole("radio", { name: "Cần xử lý (2)" })).toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dòng cuối rời danh sách: tiêu điểm sang dòng liền trước", async () => {
    const user = userEvent.setup();
    const [a, s] = [makeOrder("A"), withStatus(makeOrder("S"), "shipping")];
    route([[a, s]], {}, () => post(200, withStatus(s, "delivered")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã giao đơn S" }));
    await waitFor(() => expect(screen.getAllByTestId("staff-order-row")).toHaveLength(1));
    expect(headingOf("A")).toHaveFocus();
  });

  it("dòng duy nhất rời danh sách: tiêu điểm vào p của khối rỗng (tabindex -1, không heading)", async () => {
    const user = userEvent.setup();
    const s = withStatus(makeOrder("S"), "shipping");
    route([[s]], {}, () => post(200, withStatus(s, "delivered")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã giao đơn S" }));
    const empty = await screen.findByText("Không có đơn cần xử lý");
    expect(empty.tagName).toBe("P");
    expect(empty).toHaveAttribute("tabindex", "-1");
    expect(empty).toHaveFocus();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("bộ lọc Tất cả: Đã giao thành công thì dòng ở lại và nhận tiêu điểm", async () => {
    const user = userEvent.setup();
    const s = withStatus(makeOrder("S"), "shipping");
    route([[s]], {}, () => post(200, withStatus(s, "delivered")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByText("Tất cả"));
    await screen.findByRole("list", { name: "Danh sách đơn: Tất cả" });
    await user.click(screen.getByRole("button", { name: "Đánh dấu đã giao đơn S" }));
    await waitFor(() => expect(within(rowOf("S")).getByText("Đã giao")).toBeVisible());
    expect(headingOf("S")).toHaveFocus();
  });

  it("200 lặp (đơn đã ở đích) xử lý như thành công", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    route([[a]], {}, () => post(200, withStatus(a, "confirmed")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent("Đã chuyển đơn A sang Đã xác nhận"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("thiếu tồn: lời server dưới dòng trong role=alert, dòng giữ Chờ xác nhận, không tải lại", async () => {
    const user = userEvent.setup();
    const msg = 'Sản phẩm "Áo" đã hết hàng';
    route([[makeOrder("A")]], { active: 1 }, () =>
      post(409, { error: { code: "INSUFFICIENT_STOCK", message: msg } }),
    );
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    expect(await within(rowOf("A")).findByRole("alert")).toHaveTextContent(msg);
    expect(within(rowOf("A")).getByText("Chờ xác nhận")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusRegion()).toHaveTextContent("");
  });

  it("hai dòng cùng lúc độc lập: A đang gửi, B lỗi không ảnh hưởng A", async () => {
    const user = userEvent.setup();
    route([[makeOrder("A"), makeOrder("B")]], {}, (url) =>
      url.includes("/B/") ? post(500, {}) : new Promise(() => {}),
    );
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn B" }));
    expect(await within(rowOf("B")).findByRole("alert")).toBeVisible();
    expect(within(rowOf("A")).queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận đơn A" })).toBeDisabled();
    expect(posts()).toHaveLength(2);
  });

  it("stale: tải lại im lặng (không khung xương), dòng theo trạng thái thực, lời + tiêu điểm", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    let reload!: (r: Response) => void;
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return post(409, { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } });
      g += 1;
      return g === 1 ? ok([a]) : new Promise<Response>((r) => (reload = r));
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/orders?status=active");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByTestId("staff-order-row")).toBeVisible();
    expect(live()).toHaveTextContent("Cần xử lý: 1 đơn.");
    await act(async () =>
      reload(new Response(JSON.stringify({ orders: [withStatus(a, "confirmed")], counts: {} }))),
    );
    expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible();
    expect(within(rowOf("A")).queryByRole("button", { name: "Xác nhận đơn A" })).toBeNull();
    expect(within(rowOf("A")).getByRole("button", { name: "Giao hàng đơn A" })).toBeVisible();
    expect(within(rowOf("A")).getByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(headingOf("A")).toHaveFocus();
    expect(live()).toHaveTextContent("Cần xử lý: 1 đơn.");
  });

  it("stale mà dòng rời bộ lọc: lời đọc ở vùng trạng thái chung, tiêu điểm sang dòng kế", async () => {
    const user = userEvent.setup();
    const [a, b] = [makeOrder("A"), makeOrder("B")];
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return post(404, { error: { code: "ORDER_NOT_FOUND", message: "x" } });
      g += 1;
      return g === 1 ? ok([a, b]) : ok([b]);
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(screen.getAllByTestId("staff-order-row")).toHaveLength(1));
    expect(statusRegion()).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(headingOf("B")).toHaveFocus();
  });

  it("stale mà tải lại hỏng: giữ danh sách cũ, không alert chung, vẫn hiện lời ở dòng", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return post(409, { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } });
      g += 1;
      return g === 1 ? ok([a]) : Promise.reject(new TypeError("down"));
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(within(rowOf("A")).getByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Xác nhận đơn A" })).toBeEnabled();
    await waitFor(() => expect(headingOf("A")).toHaveFocus());
  });

  it("stale khi Làm mới đang bay mà tải lại im lặng hỏng: nút Làm mới không kẹt ở Đang làm mới", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return post(409, { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } });
      g += 1;
      if (g === 1) return ok([a]);
      return g === 2 ? new Promise<Response>(() => {}) : Promise.reject(new TypeError("down"));
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Làm mới" })).not.toHaveAttribute("aria-disabled"),
    );
    expect(screen.queryByRole("button", { name: "Đang làm mới…" })).toBeNull();
    expect(screen.getByRole("list", { name: "Danh sách đơn cần xử lý" })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("bấm thành công dòng B khi tải lại im lặng của stale dòng A đang bay: chạy lại tải lại, A vẫn được làm mới", async () => {
    const user = userEvent.setup();
    const [a, b] = [makeOrder("A"), makeOrder("B")];
    let g = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return String(url).includes("/A/")
          ? post(409, { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } })
          : post(200, withStatus(b, "confirmed"));
      g += 1;
      if (g === 1) return ok([a, b]);
      return g === 2
        ? new Promise<Response>(() => {})
        : ok([withStatus(a, "confirmed"), withStatus(b, "confirmed")]);
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(g).toBe(2));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn B" }));
    await waitFor(() => expect(g).toBe(3));
    await waitFor(() => expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible());
    expect(within(rowOf("B")).getByText("Đã xác nhận")).toBeVisible();
  });

  it("vùng role=status của view là duy nhất trong mã nguồn (không thêm vùng trạng thái thứ hai)", () => {
    const src = readFileSync(
      join(process.cwd(), "src/features/staff/components/staff-orders-view.tsx"),
      "utf8",
    );
    expect(src.split('role="status"')).toHaveLength(2);
  });

  it("401 khi bấm: chuyển tới đăng nhập kèm expired=1, refresh, không lỗi thô", async () => {
    const user = userEvent.setup();
    route([[makeOrder("A")]], {}, () => post(401, {}));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login?expired=1"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("làm mới đang bay khi bấm thành công: không ghi đè dòng mới bằng dữ liệu cũ", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    let late!: (r: Response) => void;
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST") return post(200, withStatus(a, "confirmed"));
      g += 1;
      return g === 1 ? ok([a]) : new Promise<Response>((r) => (late = r));
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Làm mới" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible());
    await act(async () => late(new Response(JSON.stringify({ orders: [a], counts: {} }))));
    expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible();
    expect(screen.getByRole("button", { name: "Làm mới" })).not.toHaveAttribute("aria-disabled");
  });

  it("không gọi API nào ngoài /api/orders?status= và transition", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    route([[a]], {}, () => post(200, withStatus(a, "confirmed")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Xác nhận đơn A" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toMatch(/^\/api\/orders\?status=|^\/api\/staff\/orders\/A\/transition$/);
    }
  });
});

describe("<StaffOrdersView /> hủy đơn qua panel (2.12)", () => {
  const openCancel = async (user: ReturnType<typeof userEvent.setup>, id: string) => {
    await user.click(screen.getByRole("button", { name: `Hủy đơn ${id}` }));
    await user.click(screen.getByRole("button", { name: "Xác nhận hủy" }));
  };

  it("Cần xử lý: hủy thành công, dòng rời, counts active giảm, tiêu điểm dòng kế, status đọc, body cancelled", async () => {
    const user = userEvent.setup();
    const [a, b, c] = [makeOrder("A"), makeOrder("B"), makeOrder("C")];
    route([[a, b, c]], { active: 3, pending: 3, cancelled: 0 }, () =>
      post(200, withStatus(b, "cancelled")),
    );
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await openCancel(user, "B");
    await waitFor(() => expect(screen.queryByText("Khách B")).toBeNull());
    expect(screen.getAllByTestId("staff-order-row").map((r) => r.dataset.orderId)).toEqual([
      "A",
      "C",
    ]);
    expect(headingOf("C")).toHaveFocus();
    expect(statusRegion()).toHaveTextContent("Đã chuyển đơn B sang Đã hủy");
    expect(screen.getByRole("radio", { name: "Cần xử lý (2)" })).toBeChecked();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ target: "cancelled" });
    expect(posts()[0][0]).toBe("/api/staff/orders/B/transition");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Tất cả: hủy thành công thì dòng ở lại là Đã hủy, không còn nút, tiêu điểm h2", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    route([[a]], {}, () => post(200, withStatus(a, "cancelled")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByText("Tất cả"));
    await screen.findByRole("list", { name: "Danh sách đơn: Tất cả" });
    await openCancel(user, "A");
    await waitFor(() => expect(within(rowOf("A")).getByText("Đã hủy")).toBeVisible());
    expect(within(rowOf("A")).queryByRole("button")).toBeNull();
    expect(within(rowOf("A")).queryByRole("group")).toBeNull();
    expect(headingOf("A")).toHaveFocus();
    expect(statusRegion()).toHaveTextContent("Đã chuyển đơn A sang Đã hủy");
  });

  it("200 lặp (đơn đã cancelled) xử lý như thành công", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    route([[a]], {}, () => post(200, withStatus(a, "cancelled")));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await openCancel(user, "A");
    await waitFor(() => expect(statusRegion()).toHaveTextContent("Đã chuyển đơn A sang Đã hủy"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stale (409): panel đóng, tải lại im lặng, dòng theo trạng thái thực kèm lời", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    let g = 0;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return post(409, { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } });
      g += 1;
      return g === 1 ? ok([a]) : ok([withStatus(a, "confirmed")]);
    });
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await openCancel(user, "A");
    await waitFor(() => expect(within(rowOf("A")).getByText("Đã xác nhận")).toBeVisible());
    expect(within(rowOf("A")).getByRole("status")).toHaveTextContent("Đơn vừa được cập nhật.");
    expect(within(rowOf("A")).queryByRole("group")).toBeNull();
    expect(within(rowOf("A")).queryByRole("button", { name: /Hủy đơn/ })).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("401: chuyển tới đăng nhập, không alert", async () => {
    const user = userEvent.setup();
    route([[makeOrder("A")]], {}, () => post(401, {}));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await openCancel(user, "A");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/staff/login?expired=1"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lỗi 500: panel giữ mở với role=alert, dòng không đổi, không tải lại", async () => {
    const user = userEvent.setup();
    route([[makeOrder("A")]], {}, () => post(500, {}));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await openCancel(user, "A");
    const alert = await within(rowOf("A")).findByRole("alert");
    expect(alert).toHaveTextContent("Không thể cập nhật đơn, vui lòng thử lại.");
    expect(within(rowOf("A")).getByRole("group")).toContainElement(alert);
    expect(within(rowOf("A")).getByText("Chờ xác nhận")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusRegion()).toHaveTextContent("");
  });

  it("Làm mới khi panel mở: panel và tiêu điểm giữ nguyên", async () => {
    const user = userEvent.setup();
    const a = makeOrder("A");
    route([[a]], { active: 1 }, () => new Promise(() => {}));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    await user.click(screen.getByRole("button", { name: "Hủy đơn A" }));
    const group = within(rowOf("A")).getByRole("group");
    expect(group).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Làm mới" })).not.toHaveAttribute("aria-disabled"),
    );
    expect(within(rowOf("A")).getByRole("group")).toBe(group);
    expect(group).toHaveFocus();
    expect(screen.getByRole("button", { name: "Hủy đơn A" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("view vẫn chỉ có đúng một vùng role=status (không thêm vùng thứ hai)", async () => {
    fetchMock.mockReturnValue(ok([makeOrder("A")]));
    render(<StaffOrdersView />);
    await screen.findAllByTestId("staff-order-row");
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});
