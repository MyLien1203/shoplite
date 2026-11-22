// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertCanViewOrder, getCurrentActor } from "./current-actor";
import { signToken } from "./signed-token";

const jar = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.values[name] !== undefined ? { name, value: jar.values[name] } : undefined,
  }),
}));

const SECRET = "s".repeat(32);
const ownToken = (ids: string[], exp = Date.now() + 60_000, secret = SECRET) =>
  signToken({ purpose: "own", exp, orderIds: ids }, secret);
const staffToken = (exp = Date.now() + 60_000) => signToken({ purpose: "staff", exp }, SECRET);

async function denied(id: string): Promise<unknown> {
  try {
    await assertCanViewOrder(id);
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("getCurrentActor / assertCanViewOrder", () => {
  beforeEach(() => {
    jar.values = {};
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("không cookie: anonymous, bị từ chối", async () => {
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
    expect(await denied("A")).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("sl_own chứa id: customer, cho qua; id khác bị từ chối", async () => {
    jar.values.sl_own = ownToken(["A"]);
    expect(await getCurrentActor()).toEqual({ kind: "customer", ownedIds: ["A"] });
    expect(await denied("A")).toBeUndefined();
    expect(await denied("B")).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("staff thắng, xem mọi đơn", async () => {
    jar.values.sl_staff = staffToken();
    jar.values.sl_own = ownToken(["A"]);
    expect(await getCurrentActor()).toEqual({ kind: "staff" });
    expect(await denied("Z")).toBeUndefined();
  });

  it("cookie hết hạn, sai chữ ký, rác: anonymous", async () => {
    jar.values.sl_own = ownToken(["A"], Date.now() - 1);
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
    jar.values.sl_own = ownToken(["A"], undefined, "x".repeat(32));
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
    jar.values.sl_own = "rac";
    jar.values.sl_staff = "rac";
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
  });

  it("chưa cấu hình: anonymous dù cookie hợp lệ", async () => {
    jar.values.sl_own = ownToken(["A"]);
    jar.values.sl_staff = staffToken();
    vi.stubEnv("STAFF_PASSWORD", "");
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
    vi.stubEnv("STAFF_PASSWORD", "pw");
    vi.stubEnv("SESSION_SECRET", "short");
    expect(await getCurrentActor()).toEqual({ kind: "anonymous" });
    expect(await denied("A")).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
