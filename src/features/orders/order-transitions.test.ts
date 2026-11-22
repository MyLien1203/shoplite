import { describe, expect, it } from "vitest";
import { OrderError } from "./order-errors";
import { planTransition } from "./order-transitions";
import { ORDER_STATUSES, type Order, type OrderItem, type OrderStatus } from "./types";

const NOW = new Date("2026-11-22T08:00:00.000Z");
const CREATED = "2026-11-20T01:00:00.000Z";

const IMAGE = { emoji: "🎧", from: "#000", to: "#fff" };

function item(productId: string, quantity: number): OrderItem {
  return {
    productId,
    slug: `slug-${productId}`,
    name: `SP ${productId}`,
    image: IMAGE,
    unitPrice: 100_000,
    quantity,
    lineTotal: 100_000 * quantity,
  };
}

function makeOrder(status: OrderStatus, items: OrderItem[] = [item("a", 2), item("b", 1)]): Order {
  return {
    id: "SL-TEST-1",
    status,
    createdAt: CREATED,
    updatedAt: CREATED,
    customer: { fullName: "Trần Thị B", phone: "0987654321", address: "45 Lê Lợi, Đà Nẵng" },
    shippingMethod: "standard",
    paymentMethod: "cod",
    items,
    subtotal: 300_000,
    shippingFee: 30_000,
    total: 330_000,
    source: "web",
    statusHistory: [{ status: "pending", at: CREATED }],
    internalNotes: [],
  };
}

const VALID_PAIRS: [OrderStatus, OrderStatus][] = [
  ["pending", "confirmed"],
  ["confirmed", "shipping"],
  ["shipping", "delivered"],
  ["pending", "cancelled"],
];

const isValid = (from: OrderStatus, to: OrderStatus) =>
  VALID_PAIRS.some(([f, t]) => f === from && t === to);

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("planTransition: bảng 5x5", () => {
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      if (from === to) {
        it(`${from} -> ${to}: noop, không tạo đơn mới`, () => {
          expect(planTransition(makeOrder(from), to, {}, NOW)).toEqual({ kind: "noop" });
        });
      } else if (isValid(from, to)) {
        it(`${from} -> ${to}: apply`, () => {
          const plan = planTransition(makeOrder(from), to, {}, NOW);
          expect(plan.kind).toBe("apply");
        });
      } else {
        it(`${from} -> ${to}: ném INVALID_STATUS_TRANSITION 409`, () => {
          const error = catchError(() => planTransition(makeOrder(from), to, {}, NOW));
          expect(error).toBeInstanceOf(OrderError);
          expect((error as OrderError).code).toBe("INVALID_STATUS_TRANSITION");
          expect((error as OrderError).httpStatus).toBe(409);
        });
      }
    }
  }

  it("đếm đúng: 4 hợp lệ, 5 noop, 16 bị từ chối", () => {
    let apply = 0;
    let noop = 0;
    let rejected = 0;
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        try {
          const plan = planTransition(makeOrder(from), to, {}, NOW);
          if (plan.kind === "apply") apply++;
          else noop++;
        } catch {
          rejected++;
        }
      }
    }
    expect([apply, noop, rejected]).toEqual([4, 5, 16]);
  });

  it("lời lỗi nêu nhãn tiếng Việt, không lộ dữ liệu khách", () => {
    const error = catchError(() => planTransition(makeOrder("pending"), "delivered", {}, NOW));
    expect((error as OrderError).message).toBe(
      'Không thể chuyển đơn từ "Chờ xác nhận" sang "Đã giao"',
    );
  });
});

describe("planTransition: apply", () => {
  it.each(VALID_PAIRS)("%s -> %s: status, updatedAt, một mục lịch sử mới", (from, to) => {
    const order = makeOrder(from);
    const plan = planTransition(order, to, {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    expect(plan.order.status).toBe(to);
    expect(plan.order.updatedAt).toBe(NOW.toISOString());
    expect(plan.order.statusHistory).toEqual([
      ...order.statusHistory,
      { status: to, at: NOW.toISOString() },
    ]);
    expect(plan.order.createdAt).toBe(CREATED);
    expect(plan.order.items).toEqual(order.items);
  });

  it("mục lịch sử mới chỉ có status và at (không ghi người thao tác)", () => {
    const plan = planTransition(makeOrder("pending"), "confirmed", {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    const last = plan.order.statusHistory.at(-1);
    expect(Object.keys(last ?? {}).sort()).toEqual(["at", "status"]);
  });

  it("không sửa đơn đầu vào và trả bản sao mới", () => {
    const order = makeOrder("pending");
    const snapshot = structuredClone(order);
    const plan = planTransition(order, "confirmed", {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    expect(order).toEqual(snapshot);
    expect(plan.order).not.toBe(order);
    expect(plan.order.statusHistory).not.toBe(order.statusHistory);
  });

  it("đơn đầu vào không đổi cả khi bị từ chối", () => {
    const order = makeOrder("delivered");
    const snapshot = structuredClone(order);
    catchError(() => planTransition(order, "pending", {}, NOW));
    expect(order).toEqual(snapshot);
  });
});

describe("planTransition: stockDelta", () => {
  it("pending -> confirmed: delta âm cho từng sản phẩm", () => {
    const plan = planTransition(makeOrder("pending"), "confirmed", {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    expect(plan.stockDelta).toEqual([
      { productId: "a", delta: -2 },
      { productId: "b", delta: -1 },
    ]);
  });

  it("cộng dồn dòng trùng productId", () => {
    const order = makeOrder("pending", [item("a", 2), item("b", 1), item("a", 3)]);
    const plan = planTransition(order, "confirmed", {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    expect(plan.stockDelta).toEqual([
      { productId: "a", delta: -5 },
      { productId: "b", delta: -1 },
    ]);
  });

  it.each([
    ["pending", "cancelled"],
    ["confirmed", "shipping"],
    ["shipping", "delivered"],
  ] as const)("%s -> %s: stockDelta rỗng", (from, to) => {
    const plan = planTransition(makeOrder(from), to, {}, NOW);
    if (plan.kind !== "apply") throw new Error("kỳ vọng apply");
    expect(plan.stockDelta).toEqual([]);
  });
});

describe("planTransition: Mã vận đơn và Ngày giao dự kiến (2.5)", () => {
  type Input = Parameters<typeof planTransition>[2];
  const confirmed = (createdAt = CREATED) => ({ ...makeOrder("confirmed"), createdAt });
  const ship = (input: Input, order = confirmed()) => planTransition(order, "shipping", input, NOW);
  const applied = (input: Input, order = confirmed()) => {
    const plan = ship(input, order);
    if (plan.kind !== "apply") throw new Error("expected apply");
    return plan.order;
  };
  const details = (fn: () => unknown) => {
    const error = catchError(fn);
    expect(error).toBeInstanceOf(OrderError);
    const e = error as OrderError;
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.httpStatus).toBe(400);
    return e.details ?? {};
  };

  it("giao đủ hai trường: trim mã, giữ ngày, thêm một mục lịch sử", () => {
    const order = applied({ trackingCode: "  GHN123  ", expectedDeliveryDate: "2026-11-25" });
    expect(order.status).toBe("shipping");
    expect(order.trackingCode).toBe("GHN123");
    expect(order.expectedDeliveryDate).toBe("2026-11-25");
    expect(order.statusHistory).toHaveLength(2);
    expect(order.updatedAt).toBe(NOW.toISOString());
  });

  it("giữ nguyên hoa thường", () => {
    expect(applied({ trackingCode: "ghN-1" }).trackingCode).toBe("ghN-1");
  });

  it.each([
    ["không trường", {}],
    ["chuỗi rỗng", { trackingCode: "", expectedDeliveryDate: "" }],
    ["toàn khoảng trắng", { trackingCode: "   ", expectedDeliveryDate: " \t " }],
  ])("để trống (%s): không có khóa nào", (_n, input) => {
    const order = applied(input);
    expect("trackingCode" in order).toBe(false);
    expect("expectedDeliveryDate" in order).toBe(false);
  });

  it("chỉ một trường: không đặt khóa undefined cho trường kia", () => {
    const order = applied({ trackingCode: "A1", expectedDeliveryDate: "  " });
    expect("expectedDeliveryDate" in order).toBe(false);
    expect(order.trackingCode).toBe("A1");
  });

  it("mã đúng 50 ký tự hợp lệ (sau trim), 51 ký tự lỗi", () => {
    expect(applied({ trackingCode: ` ${"x".repeat(50)} ` }).trackingCode).toBe("x".repeat(50));
    const d = details(() => ship({ trackingCode: "x".repeat(51) }));
    expect(d.trackingCode).toEqual(expect.any(String));
    expect(d.expectedDeliveryDate).toBeUndefined();
  });

  it.each(["AB\nCD", "A\u0000B", "A\u2028B", "A\u2029B", "<b>x</b>", "a>b", "a\tb"])(
    "ký tự cấm bị từ chối: %j",
    (code) => {
      expect(details(() => ship({ trackingCode: code })).trackingCode).toEqual(expect.any(String));
    },
  );

  it.each([
    "25/11/2026",
    "2026-2-5",
    "2026-02-30",
    "2026-13-01",
    "2026-00-10",
    "abc",
    "2026-11-25T00:00",
  ])("ngày sai định dạng hoặc không có thật: %s", (date) => {
    expect(details(() => ship({ expectedDeliveryDate: date })).expectedDeliveryDate).toEqual(
      expect.any(String),
    );
  });

  it("ngày nhuận 2028-02-29 hợp lệ, 2027-02-29 không", () => {
    expect(applied({ expectedDeliveryDate: "2028-02-29" }).expectedDeliveryDate).toBe("2028-02-29");
    details(() => ship({ expectedDeliveryDate: "2027-02-29" }));
  });

  it("không đặt trần trên cho ngày giao", () => {
    expect(applied({ expectedDeliveryDate: "2099-12-31" }).expectedDeliveryDate).toBe("2099-12-31");
  });

  describe("biên múi giờ (createdAt = 2026-11-20T18:30:00Z = 01:30 ngày 21/11 giờ VN)", () => {
    const order = confirmed("2026-11-20T18:30:00.000Z");
    it("ngày UTC của createdAt (20/11) bị từ chối", () => {
      expect(
        details(() => ship({ expectedDeliveryDate: "2026-11-20" }, order)).expectedDeliveryDate,
      ).toEqual(expect.any(String));
    });
    it("đúng ngày VN (21/11) và sau đó hợp lệ", () => {
      expect(applied({ expectedDeliveryDate: "2026-11-21" }, order).expectedDeliveryDate).toBe(
        "2026-11-21",
      );
      expect(applied({ expectedDeliveryDate: "2026-11-22" }, order).expectedDeliveryDate).toBe(
        "2026-11-22",
      );
    });
    it("ngày VN trùng ngày UTC (createdAt = 10:00Z): 19/11 lỗi, 20/11 hợp lệ", () => {
      const same = confirmed("2026-11-20T10:00:00.000Z");
      details(() => ship({ expectedDeliveryDate: "2026-11-19" }, same));
      expect(applied({ expectedDeliveryDate: "2026-11-20" }, same).expectedDeliveryDate).toBe(
        "2026-11-20",
      );
    });
    it("đúng ranh 16:59:59Z / 17:00:00Z", () => {
      const before = confirmed("2026-11-20T16:59:59.000Z");
      const after = confirmed("2026-11-20T17:00:00.000Z");
      expect(applied({ expectedDeliveryDate: "2026-11-20" }, before).expectedDeliveryDate).toBe(
        "2026-11-20",
      );
      details(() => ship({ expectedDeliveryDate: "2026-11-20" }, after));
    });
  });

  it("hai trường cùng sai: gom cả hai khóa một lần", () => {
    const d = details(() => ship({ trackingCode: "x".repeat(51), expectedDeliveryDate: "hỏng" }));
    expect(Object.keys(d).sort()).toEqual(["expectedDeliveryDate", "trackingCode"]);
  });

  it("kiểu không phải chuỗi bị từ chối theo khóa", () => {
    const bad = { trackingCode: 123, expectedDeliveryDate: null } as unknown as Input;
    expect(Object.keys(details(() => ship(bad))).sort()).toEqual([
      "expectedDeliveryDate",
      "trackingCode",
    ]);
  });

  it.each([
    ["pending", "confirmed"],
    ["pending", "cancelled"],
    ["shipping", "delivered"],
  ] as const)("sai bước %s -> %s: trường có mặt (kể cả rỗng) là VALIDATION_ERROR", (from, to) => {
    for (const input of [
      { trackingCode: "A" },
      { expectedDeliveryDate: "2026-11-25" },
      { trackingCode: "" },
      { expectedDeliveryDate: "" },
    ]) {
      const d = details(() => planTransition(makeOrder(from), to, input, NOW));
      expect(Object.keys(d)).toEqual(Object.keys(input));
    }
  });

  it("bước hợp lệ khác không trường vẫn apply, không có khóa vận đơn", () => {
    const plan = planTransition(makeOrder("shipping"), "delivered", {}, NOW);
    expect(plan.kind).toBe("apply");
    if (plan.kind === "apply") expect("trackingCode" in plan.order).toBe(false);
  });

  it("bảng chuyển trước: pending -> shipping kèm trường là 409", () => {
    const error = catchError(() =>
      planTransition(makeOrder("pending"), "shipping", { trackingCode: "A" }, NOW),
    ) as OrderError;
    expect(error.code).toBe("INVALID_STATUS_TRANSITION");
    expect(error.httpStatus).toBe(409);
  });

  it("noop bỏ qua giá trị sai và không ghi đè vận đơn đã lưu", () => {
    const shipping = { ...makeOrder("shipping"), trackingCode: "A1" };
    const before = structuredClone(shipping);
    const plan = planTransition(
      shipping,
      "shipping",
      { trackingCode: "x".repeat(100), expectedDeliveryDate: "hỏng" },
      NOW,
    );
    expect(plan).toEqual({ kind: "noop" });
    expect(shipping).toEqual(before);
  });

  it("đơn delivered: mọi chuyển rời là 409", () => {
    for (const to of ["shipping", "confirmed", "cancelled"] as const) {
      const error = catchError(() =>
        planTransition(makeOrder("delivered"), to, { trackingCode: "A" }, NOW),
      ) as OrderError;
      expect(error.code).toBe("INVALID_STATUS_TRANSITION");
    }
  });

  it("bất biến: đơn đầu vào và input không bị sửa", () => {
    const order = confirmed();
    const input = { trackingCode: "  A1  ", expectedDeliveryDate: " 2026-11-25 " };
    const orderBefore = structuredClone(order);
    const inputBefore = structuredClone(input);
    const result = applied(input, order);
    expect(order).toEqual(orderBefore);
    expect(input).toEqual(inputBefore);
    expect(result).not.toBe(order);
    expect(result.expectedDeliveryDate).toBe("2026-11-25");
  });
});
