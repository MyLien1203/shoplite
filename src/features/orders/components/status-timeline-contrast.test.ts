// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
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

// Màu phải khớp với CIRCLE_CLASSES / LABEL_CLASSES / đường nối trong status-timeline.tsx.
describe("tương phản StatusTimeline (WCAG 2.2 AA)", () => {
  it.each([
    ["đã qua: trắng trên emerald-700", "white", "emerald-700"],
    ["hiện tại: trắng trên indigo-600", "white", "indigo-600"],
    ["chưa tới: slate-600 trên slate-100", "slate-600", "slate-100"],
    ["hủy: rose-700 trên rose-50", "rose-700", "rose-50"],
    ["nhãn chưa tới: slate-500 trên trắng", "slate-500", "white"],
    ["thời điểm: slate-600 trên trắng", "slate-600", "white"],
  ])("chữ/biểu tượng %s ≥ 4.5:1", (name, fg, bg) => {
    const ratio = contrast(themeColor(fg), themeColor(bg));
    console.info(`${name}: ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("đoạn nối đã qua: emerald-700 trên trắng ≥ 3:1", () => {
    const ratio = contrast(themeColor("emerald-700"), themeColor("white"));
    console.info(`đoạn nối đã qua emerald-700/trắng: ${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("đoạn nối chưa tới: slate-500 trên trắng ≥ 3:1 và là bậc nhạt nhất đạt ngưỡng", () => {
    const white = themeColor("white");
    const ratio = contrast(themeColor("slate-500"), white);
    const lighter = contrast(themeColor("slate-400"), white);
    console.info(
      `đoạn nối chưa tới slate-500/trắng: ${ratio.toFixed(2)}; slate-400: ${lighter.toFixed(2)}`,
    );
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(lighter).toBeLessThan(3);
  });

  it("màu trong test khớp lớp thật của status-timeline.tsx", () => {
    const source = readFileSync(join(__dirname, "status-timeline.tsx"), "utf8");
    for (const cls of [
      "bg-emerald-700 text-white",
      "bg-indigo-600 text-white",
      "bg-slate-100 text-slate-600",
      "bg-rose-50 text-rose-700",
      '"text-slate-500"',
      "text-xs text-slate-600",
      '"bg-slate-500" : "bg-emerald-700"',
    ]) {
      expect(source).toContain(cls);
    }
  });
});
