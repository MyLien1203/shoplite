// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AccessConfig } from "./access-config";
import { signToken } from "./signed-token";
import { checkStaffAccess } from "./staff-access";

const SECRET = "s".repeat(32);
const NOW = 1_000_000;
const config: AccessConfig = {
  configured: true,
  staffPassword: "pw",
  sessionSecret: SECRET,
  trustedProxyHops: 0,
  cookieSecure: undefined,
};
const staffToken = (exp: number) =>
  signToken({ purpose: "staff", exp }, SECRET);

describe("checkStaffAccess", () => {
  it("phiên đúng thì ok", () => {
    expect(checkStaffAccess(staffToken(NOW + 1000), config, NOW)).toEqual({
      ok: true,
    });
  });
  it("không cookie thì missing", () => {
    expect(checkStaffAccess(undefined, config, NOW)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
  it("hết hạn thì invalid", () => {
    expect(checkStaffAccess(staffToken(NOW), config, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("chữ ký sai thì invalid", () => {
    const t = signToken({ purpose: "staff", exp: NOW + 1000 }, "x".repeat(32));
    expect(checkStaffAccess(t, config, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("token own thì invalid", () => {
    const t = signToken(
      { purpose: "own", exp: NOW + 1000, orderIds: [] },
      SECRET,
    );
    expect(checkStaffAccess(t, config, NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
  it("token rác thì invalid", () => {
    for (const junk of ["nodot", "garbage", "a.b.c", "a.b"]) {
      expect(checkStaffAccess(junk, config, NOW)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });
  it("chưa cấu hình thì unconfigured dù có cookie hay không", () => {
    expect(
      checkStaffAccess(staffToken(NOW + 1000), { configured: false }, NOW),
    ).toEqual({ ok: false, reason: "unconfigured" });
    expect(checkStaffAccess(undefined, { configured: false }, NOW)).toEqual({
      ok: false,
      reason: "unconfigured",
    });
  });
});
