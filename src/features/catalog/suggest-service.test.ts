import { describe, expect, it } from "vitest";
import { products } from "@/data/products";
import { formatCurrency } from "@/lib/format";
import { getSuggestions, validateSuggestQuery, type Suggestion } from "./suggest-service";

function suggest(q: string): Suggestion[] {
  const result = getSuggestions(q, products);
  if (!result.ok) throw new Error(result.message);
  return result.suggestions;
}

const names = (q: string) => suggest(q).map((s) => s.name);

describe("getSuggestions (I/O Matrix story 7.1)", () => {
  it("khớp không dấu: 'ban phim' ra đúng Bàn phím cơ KeyPro 75% kèm giá", () => {
    const result = suggest("ban phim");
    expect(result).toEqual([
      { slug: "ban-phim-co-keypro-75", name: "Bàn phím cơ KeyPro 75%", price: 1_890_000, inStock: true },
    ]);
    expect(formatCurrency(result[0].price).replace(/\s/g, " ")).toBe("1.890.000 ₫");
  });

  it("còn hàng trước: 'usb' cho Cáp USB-C trước Micro (hết hàng) dù Micro điểm cao hơn", () => {
    expect(suggest("usb")).toEqual([
      { slug: "cap-usb-c-ben-du-2m", name: "Cáp USB-C bện dù 2m", price: 150_000, inStock: true },
      {
        slug: "micro-thu-am-podcast-usb",
        name: "Micro thu âm PodCast USB",
        price: 1_150_000,
        inStock: false,
      },
    ]);
  });

  it("cùng điểm, khác tồn kho: 'po' cho PowerGo (còn) trước PodCast (hết)", () => {
    const result = suggest("po");
    expect(result.map((s) => [s.name, s.inStock])).toEqual([
      ["Pin dự phòng PowerGo 20.000mAh", true],
      ["Micro thu âm PodCast USB", false],
    ]);
  });

  it("nhiều hơn 5 sản phẩm: 'on' (8 khớp) trả đúng 5 theo thứ tự", () => {
    expect(names("on")).toEqual([
      "Tai nghe chụp tai StudioOne",
      "Đồng hồ thông minh FitWatch S2",
      "Tai nghe không dây SoundMax Pro",
      "Pin dự phòng PowerGo 20.000mAh",
      "Chuột không dây SwiftClick",
    ]);
  });

  it("khớp cả thương hiệu, không phân biệt hoa thường", () => {
    expect(names("VOLTUP")).toEqual(["Sạc nhanh GaN 65W", "Cáp USB-C bện dù 2m"]);
  });

  it("không có kết quả: 'xyz' trả mảng rỗng", () => {
    expect(getSuggestions("xyz", products)).toEqual({ ok: true, suggestions: [] });
  });

  it.each(["tai(", "(.*.*)*!", "a+b", "[[", "\\d", "$^", "a".repeat(25) + "!"])(
    "ký tự đặc biệt '%s' là chữ thường: rỗng, không ném lỗi, trả về ngay",
    (q) => {
      const start = performance.now();
      expect(getSuggestions(q, products)).toEqual({ ok: true, suggestions: [] });
      expect(performance.now() - start).toBeLessThan(100);
    },
  );

  it("quá ngắn: 'a' và chuỗi chỉ có khoảng trắng bị từ chối", () => {
    expect(getSuggestions("a", products).ok).toBe(false);
    expect(getSuggestions("   a  ", products).ok).toBe(false);
    expect(getSuggestions(null, products).ok).toBe(false);
  });

  it("quá dài: 51 ký tự bị từ chối, 50 ký tự được nhận", () => {
    expect(getSuggestions("a".repeat(51), products).ok).toBe(false);
    expect(getSuggestions("a".repeat(50), products)).toEqual({ ok: true, suggestions: [] });
    expect(validateSuggestQuery("ab")).toBeNull();
  });
});
