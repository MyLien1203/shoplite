"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import {
  SUGGEST_MAX_LENGTH,
  SUGGEST_MIN_LENGTH,
  type Suggestion,
} from "@/features/catalog/suggest-service";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";

export const SUGGEST_DEBOUNCE_MS = 300;

/**
 * Ô tìm kiếm có gợi ý (combobox). Vẫn là input `name="q"` của form lọc nên nút
 * "Tìm kiếm" và trang /products?q= giữ nguyên hành vi; chỉ thêm danh sách gợi ý.
 */
export function SearchSuggestions({
  defaultValue,
  className,
}: {
  defaultValue?: string;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const keyword = value.trim();
  const eligible =
    [...keyword].length >= SUGGEST_MIN_LENGTH && [...keyword].length <= SUGGEST_MAX_LENGTH;

  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products/suggest?q=${encodeURIComponent(keyword)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(body.suggestions);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setSuggestions(null);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [keyword, eligible]);

  const visible = open && eligible && suggestions !== null;
  const items = visible ? suggestions : [];

  function choose(suggestion: Suggestion) {
    setOpen(false);
    router.push(`/products/${suggestion.slug}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (visible) event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!visible) {
        setOpen(true);
        return;
      }
      if (items.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + items.length) % items.length);
      return;
    }
    if (event.key === "Enter" && visible && items[active]) {
      event.preventDefault();
      choose(items[active]);
    }
  }

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Tìm sản phẩm, thương hiệu... (VD: tai nghe, ban phim)"
        aria-label="Từ khóa tìm kiếm"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={visible && items[active] ? optionId(active) : undefined}
        autoComplete="off"
        className={cn(className, "pl-9")}
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Gợi ý sản phẩm"
          className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">Không tìm thấy sản phẩm phù hợp</li>
          ) : (
            items.map((suggestion, index) => (
              <li
                key={suggestion.slug}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown thay vì click để chọn trước khi input mất focus (blur đóng danh sách).
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(suggestion);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3 py-2",
                  index === active && "bg-indigo-50",
                )}
              >
                <span className="truncate text-slate-800">{suggestion.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {!suggestion.inStock && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                      Hết hàng
                    </span>
                  )}
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(suggestion.price)}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
