// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Màu lấy trực tiếp từ theme của Tailwind v4 (oklch) trong node_modules.
const themePath = createRequire(import.meta.url).resolve("tailwindcss/theme.css");
const theme = readFileSync(themePath, "utf8");

type Rgb = [number, number, number];

function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

function parseColor(value: string): Rgb {
  if (value === "#fff") return [1, 1, 1];
  const m = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!m) throw new Error(`Không đọc được màu: ${value}`);
  return oklchToLinearRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
}

function themeColor(name: string): Rgb {
  const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(theme);
  if (!m) throw new Error(`Thiếu màu ${name} trong theme.css`);
  return parseColor(m[1].trim());
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("tương phản staff-nav (WCAG 2.2 AA, chữ thường ≥ 4.5:1)", () => {
  it.each([
    ["trắng trên slate-900 (staff-badge)", "white", "slate-900"],
    ["indigo-700 trên indigo-50 (nav-link-active)", "indigo-700", "indigo-50"],
    ["slate-600 trên trắng (liên kết chưa chọn, mô tả)", "slate-600", "white"],
    ["slate-700 trên trắng (nút Đăng xuất)", "slate-700", "white"],
  ])("%s", (name, fg, bg) => {
    const ratio = contrast(themeColor(fg), themeColor(bg));
    console.info(`${name}: ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
