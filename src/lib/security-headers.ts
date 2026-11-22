/** Đường dẫn chứa thông tin nhạy cảm (đơn hàng, khu nhân viên). `:path*` khớp cả gốc. */
export const NO_LEAK_SOURCES = [
  "/orders/:path*",
  "/staff/:path*",
  "/api/orders/:path*",
  "/api/staff/:path*",
] as const;

/** Không rò rỉ qua Referer và không cho cache. */
export const NO_LEAK_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

export function securityHeaders() {
  return NO_LEAK_SOURCES.map((source) => ({ source, headers: NO_LEAK_HEADERS }));
}
