import { formatCurrency } from "@/lib/format";
import { ORDER_STATUS_LABELS, type Order } from "@/features/orders/types";
import type { StoreGateway } from "@/features/store/store-gateway";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/features/access/signed-token";
import { updateOrder } from "@/features/store/update-order";
import OrderDetailPage from "./page";

const SECRET = "s".repeat(32);
const NOT_FOUND = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";
const REAL_ID = "SL-20261021-AAAAAA";

const jar = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.values[name] !== undefined ? { name, value: jar.values[name] } : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/features/orders/server", async () => {
  const { createOrderService: create } = await import("@/features/orders/order-service");
  const { createInMemoryStoreGateway: createStore } =
    await import("@/features/store/in-memory-store");
  const store = createStore();
  return {
    orderService: create({ store, generateId: () => "SL-20261021-AAAAAA" }),
    testStore: store,
  };
});

const INTERNAL_NOTE = "GHI-CHU-NOI-BO-DAC-TRUNG-9Q";
let seeded: Order;

const own = (orderIds: string[], exp = Date.now() + 60_000) =>
  signToken({ purpose: "own", exp, orderIds }, SECRET);
const staff = () => signToken({ purpose: "staff", exp: Date.now() + 60_000 }, SECRET);

async function renderPage(id: string, placed?: string) {
  const ui = await OrderDetailPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(placed ? { placed } : {}),
  } as Parameters<typeof OrderDetailPage>[0]);
  return render(ui);
}

function expectStranger(container: HTMLElement, id: string) {
  expect(screen.getByRole("heading", { level: 1, name: "Tra cứu đơn hàng" })).toBeInTheDocument();
  expect(screen.getByLabelText(/Mã đơn/)).toHaveValue(id);
  expect(screen.getByRole("alert")).toHaveTextContent(NOT_FOUND);
  const html = container.innerHTML;
  const secrets = [
    "Nguyễn Văn Test",
    "0987600001",
    "12 Nguyễn Huệ",
    "Đặt hàng thành công",
    formatCurrency(seeded.total),
    ...seeded.items.map((item) => item.name),
    ORDER_STATUS_LABELS.pending,
  ];
  for (const secret of secrets) {
    expect(html).not.toContain(secret);
  }
}

describe("OrderDetailPage", () => {
  beforeEach(async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    jar.values = {};
    const { orderService } = await import("@/features/orders/server");
    if ((await orderService.listOrders()).length === 0) {
      await orderService.placeOrder({
        customer: { fullName: "Nguyễn Văn Test", phone: "0987600001", address: "12 Nguyễn Huệ" },
        shippingMethod: "standard",
        paymentMethod: "cod",
        items: [{ productId: "p010", quantity: 1 }],
      });
    }
    seeded = await orderService.getOrder(REAL_ID);
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    await testStore.update((data) => ({
      data: {
        ...data,
        orders: data.orders.map((order) => ({
          ...order,
          status: "pending" as const,
          internalNotes: [{ id: "n1", text: INTERNAL_NOTE, createdAt: order.createdAt }],
        })),
      },
      result: undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("chủ đơn: thấy đơn, banner ?placed=1, liên kết Tra cứu đơn khác tới /orders", async () => {
    jar.values.sl_own = own([REAL_ID]);
    await renderPage(REAL_ID, "1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Đơn hàng ${REAL_ID}`);
    expect(screen.getByText("Đặt hàng thành công!")).toBeInTheDocument();
    expect(screen.getAllByText(/Nguyễn Văn Test/).length).toBeGreaterThan(0);
    const back = screen.getByRole("link", { name: /Tra cứu đơn khác/ });
    expect(back).toHaveAttribute("href", "/orders");
    expect(document.body.innerHTML).not.toContain(INTERNAL_NOTE);
  });

  it("nhân viên: xem mọi đơn", async () => {
    jar.values.sl_staff = staff();
    await renderPage(REAL_ID);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`Đơn hàng ${REAL_ID}`);
    expect(screen.queryByText("Đặt hàng thành công!")).toBeNull();
    expect(document.body.innerHTML).not.toContain(INTERNAL_NOTE);
  });

  it("người lạ: form tra cứu điền sẵn Mã đơn, không lộ dữ liệu đơn", async () => {
    const { container } = await renderPage(REAL_ID);
    expectStranger(container, REAL_ID);
  });

  it("người lạ với id không tồn tại: giống hệt", async () => {
    const { container } = await renderPage("SL-20261021-NOPE00");
    expectStranger(container, "SL-20261021-NOPE00");
  });

  it("?placed=1 không có bằng chứng: vẫn view người lạ, không nhánh riêng", async () => {
    const { container } = await renderPage(REAL_ID, "1");
    expectStranger(container, REAL_ID);
  });

  it("sl_own sai id hoặc hết hạn: như người lạ", async () => {
    jar.values.sl_own = own(["SL-OTHER"]);
    let view = await renderPage(REAL_ID);
    expectStranger(view.container, REAL_ID);
    view.unmount();
    jar.values.sl_own = own([REAL_ID], Date.now() - 1);
    view = await renderPage(REAL_ID);
    expectStranger(view.container, REAL_ID);
  });

  it("chưa cấu hình: như người lạ dù có cookie", async () => {
    jar.values.sl_own = own([REAL_ID]);
    vi.stubEnv("SESSION_SECRET", "ngan");
    const { container } = await renderPage(REAL_ID, "1");
    expectStranger(container, REAL_ID);
  });

  it("HC-1: chủ đơn thấy 'Hủy đơn hàng' khi pending, không thấy khi confirmed hoặc cancelled", async () => {
    jar.values.sl_own = own([REAL_ID]);
    const { testStore } = (await import("@/features/orders/server")) as unknown as {
      testStore: StoreGateway;
    };
    const cancelButton = () => screen.queryByRole("button", { name: "Hủy đơn hàng" });

    let view = await renderPage(REAL_ID);
    expect(cancelButton()).toBeInTheDocument();
    view.unmount();

    for (const status of ["confirmed", "cancelled"] as const) {
      await testStore.update((data) => ({
        data: updateOrder(data, REAL_ID, (order) => ({ ...order, status })).data,
        result: undefined,
      }));
      view = await renderPage(REAL_ID);
      expect(cancelButton()).toBeNull();
      view.unmount();
    }
  });

  it("có quyền nhưng id không tồn tại: notFound()", async () => {
    jar.values.sl_staff = staff();
    await expect(renderPage("SL-20261021-NOPE00")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
