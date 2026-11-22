// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffApi, requireStaffPage } from "./require-staff";
import { signToken } from "./signed-token";

const cookieValue = vi.hoisted(() => ({
  value: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sl_staff" && cookieValue.value !== undefined
        ? { name, value: cookieValue.value }
        : undefined,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const SECRET = "s".repeat(32);
const EXP = Date.parse("2026-11-21T12:00:00Z");

describe("hết hạn phiên nhân viên theo đồng hồ tiêm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", SECRET);
    cookieValue.value = signToken({ purpose: "staff", exp: EXP }, SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("trước exp: cả hai dạng cho qua", async () => {
    vi.setSystemTime(EXP - 1000);
    await expect(requireStaffPage()).resolves.toBeUndefined();
    await expect(requireStaffApi()).resolves.toBeUndefined();
  });

  it("sau exp: trang tới ?expired=1, API UNAUTHORIZED", async () => {
    vi.setSystemTime(EXP + 1000);
    await expect(requireStaffPage()).rejects.toThrow("REDIRECT:/staff/login?expired=1");
    await expect(requireStaffApi()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
