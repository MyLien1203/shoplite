import { NextResponse } from "next/server";
import { requireStaffApi } from "@/features/access/require-staff";
import { getAccessConfig } from "@/features/access/server";
import { resolveCookieSecure } from "@/features/access/staff-login";
import { handleRouteError } from "@/lib/http";
import { parseWriteRequest } from "@/lib/write-request";

export async function POST(request: Request) {
  try {
    const config = getAccessConfig();
    await parseWriteRequest(request, {
      trustedProxyHops: config.configured ? config.trustedProxyHops : 0,
    });
    await requireStaffApi();

    const response = NextResponse.json({ ok: true });
    response.cookies.set("sl_staff", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: config.configured ? resolveCookieSecure(request, config) : false,
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
