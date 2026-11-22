import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

// Thư mục tạm cho dữ liệu E2E, tạo một lần: config được nạp lại ở mỗi worker nên
// đặt vào env (thừa kế tới worker) để mọi lần nạp dùng chung một thư mục.
// Không tự xóa; để hệ điều hành dọn.
process.env.PW_E2E_DIR ??= mkdtempSync(path.join(tmpdir(), "shoplite-e2e-"));
const E2E_DIR = process.env.PW_E2E_DIR;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Test đặt hàng cùng ghi một file dữ liệu tạm; chạy tuần tự để màu đỏ chỉ đến từ lỗi thật.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    // Bằng chứng khi test đỏ: chỉ giữ lại khi hỏng để thư mục test-results gọn.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    // Luôn khởi động server mới để E2E không bao giờ chạm dữ liệu thật. Nếu cổng đang bị
    // chiếm (ví dụ `npm run dev`), `npm run test:e2e` lỗi: tắt server đó rồi chạy lại.
    reuseExistingServer: false,
    env: {
      STORE_FILE: path.join(E2E_DIR, "store.json"),
      ORDERS_FILE: path.join(E2E_DIR, "orders.json"),
      // Giá trị giả, không đọc .env* thật.
      STAFF_PASSWORD: "e2e-staff-password",
      SESSION_SECRET: "e2e-session-secret-0123456789abcdef-0123456789",
      // Tin 1 tầng proxy: app lấy IP khách từ x-forwarded-for, để mỗi test có IP riêng (xem fixtures.ts)
      // và bộ đếm giới hạn thử sai (nằm trong bộ nhớ server) không bị các test dùng chung.
      TRUSTED_PROXY_HOPS: "1",
    },
    timeout: 120_000,
  },
});
