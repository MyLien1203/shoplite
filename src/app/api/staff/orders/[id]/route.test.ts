// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "@/features/access/signed-token";
import type { StoreGateway } from "@/features/store/store-gateway";
import { GET } from "./route";

const SECRET = "s".repeat(32);
const ID_A = "SL-20261021-AAAAAA";

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sl_staff" && jar.value !== undefined ? { name, value: jar.value } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const ids = vi.hoisted(() => ({ next: [] as string[] }));
vi.mock("@/features/orders/server", async () => {
  const { createOrderService: create } = await import("@/features/orders/order-service");
  const { createInMemoryStoreGateway: createStore } =
    await import("@/features/store/in-memory-store");
  const store = createStore();
  return {
    orderService: create({
      store,
      logEvent: () => {},
      generateId: () => ids.next.shift() ?? "SL-20261021-FFFFFF",
    }),
    testStore: store,
  };
});

async function testStore(): Promise<StoreGateway> {
  const mod = (await import("@/features/orders/server")) as unknown as { testStore: StoreGateway };
  return mod.testStore;
}

async function seedWithNote(id: string) {
  const { orderService } = await import("@/features/orders/server");
  ids.next.push(id);
  await orderService.placeOrder({
    customer: { fullName: "Nguyễn Văn Test", phone: "0912345678", address: "12 Nguyễn Huệ" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items: [{ productId: "p011", quantity: 1 }],
  });
  const store = await testStore();
  await store.update((data) => ({
    data: {
      ...data,
      orders: data.orders.map((o) =>
        o.id === id
          ? {
              ...o,
              internalNotes: [{ id: "n1", text: "Gọi trước khi giao", createdAt: o.createdAt }],
            }
          : o,
      ),
    },
    result: undefined,
  }));
}

const staffCookie = () => signToken({ purpose: "staff", exp: Date.now() + 60_000 }, SECRET);

function get(id: string): Promise<Response> {
  return GET(new Request(`http://shop.test/api/staff/orders/${id}`), {
    params: Promise.resolve({ id }),
  } as Parameters<typeof GET>[1]);
}

describe("GET /api/staff/orders/:id", () => {
  beforeEach(async () => {
    vi.stubEnv("STAFF_PASSWORD", "mat-khau");
    vi.stubEnv("SESSION_SECRET", SECRET);
    jar.value = staffCookie();
    const store = await testStore();
    await store.update((data) => ({
      data: { ...data, orders: [], inventory: {} },
      result: undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("200 - có phiên: trả đơn đầy đủ kể cả internalNotes và SĐT", async () => {
    await seedWithNote(ID_A);
    const response = await get(ID_A);
    expect(response.status).toBe(200);
    const order = await response.json();
    expect(order.id).toBe(ID_A);
    expect(order.internalNotes).toEqual([
      { id: "n1", text: "Gọi trước khi giao", createdAt: expect.any(String) },
    ]);
    expect(order.customer.phone).toBe("0912345678");
    expect(order.statusHistory).toHaveLength(1);
  });

  it("401 - không cookie, không đọc store", async () => {
    await seedWithNote(ID_A);
    jar.value = undefined;
    const store = await testStore();
    const read = vi.spyOn(store, "read");
    const update = vi.spyOn(store, "update");
    const response = await get(ID_A);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(read).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("401 - cookie hỏng, không lộ ghi chú", async () => {
    await seedWithNote(ID_A);
    jar.value = "khong-phai-token";
    const response = await get(ID_A);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("Gọi trước khi giao");
  });

  it("404 ORDER_NOT_FOUND - id lạ", async () => {
    const response = await get("SL-NOPE");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("ORDER_NOT_FOUND");
  });

  it("không ghi store", async () => {
    await seedWithNote(ID_A);
    const store = await testStore();
    const before = await store.read();
    await get(ID_A);
    expect(await store.read()).toEqual(before);
  });
});
