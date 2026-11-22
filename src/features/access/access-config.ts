export type AccessConfig =
  | { configured: false }
  | {
      configured: true;
      staffPassword: string;
      sessionSecret: string;
      trustedProxyHops: number;
      /** undefined = suy từ giao thức của request. */
      cookieSecure: boolean | undefined;
    };

export const MIN_SESSION_SECRET_LENGTH = 32;

/** Đọc cấu hình truy cập từ `env` truyền vào. Thiếu/không hợp lệ thì trả { configured: false }. */
export function readAccessConfig(
  env: Record<string, string | undefined>,
): AccessConfig {
  const staffPassword = env.STAFF_PASSWORD;
  const sessionSecret = env.SESSION_SECRET;
  if (
    !staffPassword ||
    !sessionSecret ||
    sessionSecret.length < MIN_SESSION_SECRET_LENGTH
  ) {
    return { configured: false };
  }

  const hopsRaw = (env.TRUSTED_PROXY_HOPS ?? "").trim();
  const trustedProxyHops = /^\d{1,2}$/.test(hopsRaw) ? Number(hopsRaw) : 0;

  const secure = env.COOKIE_SECURE?.trim().toLowerCase();
  const cookieSecure =
    secure === "true" ? true : secure === "false" ? false : undefined;

  return {
    configured: true,
    staffPassword,
    sessionSecret,
    trustedProxyHops,
    cookieSecure,
  };
}
