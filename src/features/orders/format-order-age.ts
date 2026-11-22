const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Tuổi đơn dạng ngắn: "vừa xong", "N phút", "N giờ", "N ngày" (làm tròn xuống). Hàm thuần. */
export function formatOrderAge(createdAt: string, now: number | Date): string {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return "Không rõ";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const diff = nowMs - created;
  if (!(diff >= MINUTE)) return "vừa xong";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ`;
  return `${Math.floor(diff / DAY)} ngày`;
}
