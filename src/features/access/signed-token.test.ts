// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signToken, type TokenPayload, verifyToken } from "./signed-token";

const SECRET = "s".repeat(32);
const NOW = 1_000_000;
const staff: TokenPayload = { purpose: "staff", exp: NOW + 1000 };
const own: TokenPayload = {
  purpose: "own",
  exp: NOW + 1000,
  orderIds: ["SL-1"],
};

describe("signed-token", () => {
  it("token đúng verify được", () => {
    expect(verifyToken(signToken(staff, SECRET), SECRET, "staff", NOW)).toEqual(
      {
        ok: true,
        payload: staff,
      },
    );
    expect(verifyToken(signToken(own, SECRET), SECRET, "own", NOW)).toEqual({
      ok: true,
      payload: own,
    });
  });

  it("chữ ký bị sửa thì từ chối", () => {
    const token = signToken(staff, SECRET);
    const [body, sig] = token.split(".");
    const bytes = Buffer.from(sig, "base64url");
    bytes[10] ^= 0xff;
    const tampered = `${body}.${bytes.toString("base64url")}`;
    expect(verifyToken(tampered, SECRET, "staff", NOW)).toEqual({ ok: false });
  });

  it("chữ ký có bit đệm bị đổi thì từ chối", () => {
    const [body, sig] = signToken(staff, SECRET).split(".");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const idx = alphabet.indexOf(sig.slice(-1));
    const altered = sig.slice(0, -1) + alphabet[idx ^ 1];
    expect(Buffer.from(altered, "base64url")).toEqual(
      Buffer.from(sig, "base64url"),
    );
    expect(verifyToken(`${body}.${altered}`, SECRET, "staff", NOW)).toEqual({
      ok: false,
    });
  });

  it("now = NaN thì từ chối", () => {
    expect(verifyToken(signToken(staff, SECRET), SECRET, "staff", NaN)).toEqual(
      { ok: false },
    );
  });

  it("còn hợp lệ ở exp - 1", () => {
    expect(
      verifyToken(signToken(staff, SECRET), SECRET, "staff", staff.exp - 1).ok,
    ).toBe(true);
  });

  it("payload ký đúng nhưng sai hình dạng thì từ chối", () => {
    const forge = (payload: unknown) => {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = createHmac("sha256", SECRET)
        .update(body)
        .digest()
        .toString("base64url");
      return `${body}.${sig}`;
    };
    const exp = NOW + 1000;
    const cases: Array<[unknown, "staff" | "own"]> = [
      [{ purpose: "own", exp }, "own"],
      [{ purpose: "own", exp, orderIds: [1] }, "own"],
      [{ purpose: "admin", exp }, "staff"],
      [{ purpose: "staff", exp: "x" }, "staff"],
      [{ purpose: "staff", exp: null }, "staff"],
      [{ purpose: "staff" }, "staff"],
    ];
    for (const [payload, purpose] of cases) {
      expect(verifyToken(forge(payload), SECRET, purpose, NOW)).toEqual({
        ok: false,
      });
    }
  });

  it("sai secret thì từ chối", () => {
    expect(
      verifyToken(signToken(staff, SECRET), "x".repeat(32), "staff", NOW),
    ).toEqual({
      ok: false,
    });
  });

  it("hết hạn thì từ chối (now >= exp)", () => {
    const token = signToken(staff, SECRET);
    expect(verifyToken(token, SECRET, "staff", NOW + 1000)).toEqual({
      ok: false,
    });
    expect(verifyToken(token, SECRET, "staff", NOW + 1000 + 1)).toEqual({
      ok: false,
    });
  });

  it("sai purpose thì từ chối", () => {
    expect(verifyToken(signToken(own, SECRET), SECRET, "staff", NOW)).toEqual({
      ok: false,
    });
  });

  it("chữ ký sai độ dài thì từ chối, không ném", () => {
    const [body] = signToken(staff, SECRET).split(".");
    const sigs = [
      "",
      "AAAA",
      Buffer.alloc(31).toString("base64url"),
      Buffer.alloc(33).toString("base64url"),
    ];
    for (const sig of sigs) {
      expect(() =>
        verifyToken(`${body}.${sig}`, SECRET, "staff", NOW),
      ).not.toThrow();
      expect(verifyToken(`${body}.${sig}`, SECRET, "staff", NOW)).toEqual({
        ok: false,
      });
    }
  });

  it("token rác thì từ chối, không ném", () => {
    const body = Buffer.from("không phải json").toString("base64url");
    const sig = createHmac("sha256", SECRET)
      .update(body)
      .digest()
      .toString("base64url");
    for (const t of ["", "nodot", "a.b.c", "!!!.???", `${body}.${sig}`]) {
      expect(verifyToken(t, SECRET, "staff", NOW)).toEqual({ ok: false });
    }
  });
});
