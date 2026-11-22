// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRouteError } from "@/lib/http";
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

async function apiError(): Promise<unknown> {
  try {
    await requireStaffApi();
  } catch (e) {
    return e;
  }
  return undefined;
}

async function pageRedirect(): Promise<string | undefined> {
  try {
    await requireStaffPage();
  } catch (e) {
    const message = (e as Error).message;
    expect(message.startsWith("REDIRECT:")).toBe(true);
    return message;
  }
  return undefined;
}

describe("requireStaff", () => {
  beforeEach(() => {
    cookieValue.value = undefined;
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("có phiên thì cả hai dạng cho qua", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: Date.now() + 60_000 },
      SECRET,
    );
    expect(await pageRedirect()).toBeUndefined();
    expect(await apiError()).toBeUndefined();
  });

  it("không cookie: trang tới /staff/login, API UNAUTHORIZED", async () => {
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("hết hạn: trang tới ?expired=1, API UNAUTHORIZED", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: Date.now() - 1 },
      SECRET,
    );
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login?expired=1");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("chữ ký sai hoặc token own: ?expired=1", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: Date.now() + 60_000 },
      "x".repeat(32),
    );
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login?expired=1");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
    cookieValue.value = signToken(
      { purpose: "own", exp: Date.now() + 60_000, orderIds: [] },
      SECRET,
    );
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login?expired=1");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("cookie rác: trang ?expired=1, API UNAUTHORIZED", async () => {
    cookieValue.value = "garbage";
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login?expired=1");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("chưa cấu hình: từ chối dù cookie hợp lệ", async () => {
    cookieValue.value = signToken(
      { purpose: "staff", exp: Date.now() + 60_000 },
      SECRET,
    );
    vi.stubEnv("STAFF_PASSWORD", "");
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", "short");
    expect(await pageRedirect()).toBe("REDIRECT:/staff/login");
    expect(await apiError()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("route dùng handleRouteError trả 401 chuẩn", async () => {
    const res = handleRouteError(await apiError());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(typeof body.error.message).toBe("string");
  });
});
