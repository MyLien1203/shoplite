import { verifyToken } from "./signed-token";

export type Actor =
  | { kind: "staff" }
  | { kind: "customer"; ownedIds: string[] }
  | { kind: "anonymous" };

export interface ActorCookies {
  sl_staff?: string;
  sl_own?: string;
}

/** Xác định ai đang gọi: staff thắng customer; token sai coi như không có. */
export function resolveActor(
  cookies: ActorCookies,
  secret: string,
  now: number,
): Actor {
  if (
    cookies.sl_staff &&
    verifyToken(cookies.sl_staff, secret, "staff", now).ok
  ) {
    return { kind: "staff" };
  }
  if (cookies.sl_own) {
    const result = verifyToken(cookies.sl_own, secret, "own", now);
    if (result.ok && result.payload.purpose === "own") {
      return { kind: "customer", ownedIds: result.payload.orderIds };
    }
  }
  return { kind: "anonymous" };
}

export function canAccessOrder(actor: Actor, orderId: string): boolean {
  if (actor.kind === "staff") return true;
  if (actor.kind === "customer") return actor.ownedIds.includes(orderId);
  return false;
}
