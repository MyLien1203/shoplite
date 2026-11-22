import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Test header thật trên `next build` + `next start` (dev luôn tự đặt no-store nên không thay được).
// Cần `npm run build` trước, rồi chạy `npx playwright test -c playwright.prod.config.ts`. Cổng riêng, dữ liệu tạm.
const PORT = Number(process.env.PROD_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

process.env.PW_PROD_DIR ??= mkdtempSync(path.join(tmpdir(), "shoplite-prod-"));
const DIR = process.env.PW_PROD_DIR;

export default defineConfig({
  testDir: "./e2e-prod",
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: BASE_URL },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    env: {
      STORE_FILE: path.join(DIR, "store.json"),
      ORDERS_FILE: path.join(DIR, "orders.json"),
      // Giá trị giả, không đọc .env* thật.
      STAFF_PASSWORD: "prod-test-staff-password",
      SESSION_SECRET: "prod-test-session-secret-0123456789abcdef-0123456789",
    },
    timeout: 300_000,
  },
});
