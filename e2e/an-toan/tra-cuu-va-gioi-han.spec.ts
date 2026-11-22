// spec: specs/tieu-chi.md (Luồng C, AT-4)
import {
  expect,
  KHACH_MAU,
  LOOKUP_NOT_FOUND,
  RATE_LIMITED,
  test,
  type ApiError,
  type Owner,
} from "./fixtures";

const MA_KHONG_TON_TAI = "SL-20200101-AAAAAA";
const SDT_SAI = "0912345679";

// Bảng các kiểu tra cứu sai: mọi kiểu phải nhận đúng một lời, không cho biết trường nào sai.
const KIEU_SAI = [
  {
    ten: "sai SĐT",
    input: (o: Owner) => ({ orderId: o.orderId, phone: SDT_SAI }),
  },
  {
    ten: "sai SĐT dạng +84",
    input: (o: Owner) => ({ orderId: o.orderId, phone: "+84912345679" }),
  },
  {
    ten: "Mã đơn không tồn tại, SĐT đúng",
    input: () => ({ orderId: MA_KHONG_TON_TAI, phone: KHACH_MAU.phone }),
  },
  {
    ten: "sai cả Mã đơn và SĐT",
    input: () => ({ orderId: MA_KHONG_TON_TAI, phone: SDT_SAI }),
  },
];

test.describe("Tra cứu đơn bằng Mã đơn + SĐT", () => {
  for (const kieu of KIEU_SAI) {
    test(
      `AT-4a tra cứu ${kieu.ten}: 404 ORDER_NOT_FOUND cùng một lời`,
      { tag: "@AT-4" },
      async ({ stranger, owner }) => {
        const response = await stranger.post("/api/orders/lookup", { data: kieu.input(owner) });
        expect(response.status()).toBe(404);
        const body = (await response.json()) as ApiError;
        expect(body.error.code).toBe("ORDER_NOT_FOUND");
        expect(body.error.message).toBe(LOOKUP_NOT_FOUND);
      },
    );
  }

  test(
    "AT-4a tra cứu đúng trả 200 chỉ với Mã đơn",
    { tag: "@AT-4" },
    async ({ stranger, owner }) => {
      const response = await stranger.post("/api/orders/lookup", {
        data: { orderId: owner.orderId, phone: "+84912345678" },
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ orderId: owner.orderId });
    },
  );

  test(
    "AT-4b sai 5 lần thì lần 6 bị 429 kể cả khi nhập đúng",
    { tag: "@AT-4" },
    async ({ stranger, owner }) => {
      const statuses: number[] = [];
      const wrong = { orderId: owner.orderId, phone: SDT_SAI };
      const right = { orderId: owner.orderId, phone: owner.phone };

      await test.step("5 lần sai đều là 404", async () => {
        for (let lan = 1; lan <= 5; lan++) {
          const response = await stranger.post("/api/orders/lookup", { data: wrong });
          statuses.push(response.status());
          expect(response.status(), `lần sai thứ ${lan}`).toBe(404);
        }
      });

      await test.step("lần 6 nhập đúng vẫn bị 429 với lời cố định", async () => {
        const response = await stranger.post("/api/orders/lookup", { data: right });
        statuses.push(response.status());
        expect(response.status()).toBe(429);
        const body = (await response.json()) as ApiError;
        expect(body.error.code).toBe("RATE_LIMITED");
        expect(body.error.message).toBe(RATE_LIMITED);
      });

      await test.step("gửi tiếp trong thời gian khóa nhận lại 429 cùng lời", async () => {
        const response = await stranger.post("/api/orders/lookup", { data: right });
        statuses.push(response.status());
        expect(response.status()).toBe(429);
        expect(((await response.json()) as ApiError).error.message).toBe(RATE_LIMITED);
      });

      test.info().annotations.push({ type: "số liệu 429", description: statuses.join(", ") });
    },
  );

  test(
    "AT-4c lần đúng giữa chừng không bị tính và không xóa bộ đếm sai",
    { tag: "@AT-4" },
    async ({ stranger, owner }) => {
      const wrong = { orderId: owner.orderId, phone: SDT_SAI };
      const right = { orderId: owner.orderId, phone: owner.phone };

      for (let lan = 1; lan <= 4; lan++) {
        expect((await stranger.post("/api/orders/lookup", { data: wrong })).status()).toBe(404);
      }
      // Mới sai 4 lần: nhập đúng vẫn qua
      expect((await stranger.post("/api/orders/lookup", { data: right })).status()).toBe(200);
      // Lần đúng không reset: lần sai kế tiếp là lần thứ 5 ...
      expect((await stranger.post("/api/orders/lookup", { data: wrong })).status()).toBe(404);
      // ... nên lần kế tiếp (dù đúng) bị khóa
      expect((await stranger.post("/api/orders/lookup", { data: right })).status()).toBe(429);
    },
  );

  test(
    "AT-4d form tra cứu hiện lời khóa khi đã sai 5 lần, nút dùng lại được",
    { tag: "@AT-4" },
    async ({ page, stranger, owner }) => {
      // `stranger` và `page` cùng IP riêng của test nên dùng chung bộ đếm
      for (let lan = 1; lan <= 5; lan++) {
        await stranger.post("/api/orders/lookup", {
          data: { orderId: owner.orderId, phone: SDT_SAI },
        });
      }

      await page.goto("/orders");
      await page.getByLabel(/Mã đơn/).fill(owner.orderId);
      await page.getByLabel(/Số điện thoại/).fill(owner.phone);
      await page.getByRole("button", { name: "Xem đơn hàng" }).click();

      await expect(page.getByRole("alert").filter({ hasText: RATE_LIMITED })).toBeVisible();
      await expect(page.getByRole("button", { name: "Xem đơn hàng" })).toBeEnabled();
      await expect(page).toHaveURL(/\/orders$/);
    },
  );
});
