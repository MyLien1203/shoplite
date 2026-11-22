import { NextResponse, type NextRequest } from "next/server";

/**
 * Chuyển hướng lạc quan: chưa có cookie `sl_staff` thì về đăng nhập sớm.
 * Không phải kiểm quyền; việc đó nằm ở requireStaffPage/requireStaffApi.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/staff/login" || request.cookies.get("sl_staff")?.value) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/staff/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/staff/:path*" };
