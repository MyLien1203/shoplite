"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OrderLookupForm } from "@/features/orders/components/order-lookup-form";
import { hasLookupKeys, parseLookupFragment } from "@/features/orders/parse-lookup-fragment";
import type { ApiErrorBody } from "@/lib/http";

// Lặp lại lời của `LOOKUP_NOT_FOUND_MESSAGE`: lookup-order.ts import node:crypto nên không dùng ở client.
const LOOKUP_NOT_FOUND_MESSAGE = "Không tìm thấy đơn hàng. Kiểm tra lại Mã đơn và số điện thoại.";

const NETWORK_MESSAGE = "Không kết nối được máy chủ, vui lòng thử lại.";

type Phase = "checking" | "opening" | "form";

interface FormSeed {
  defaultOrderId: string;
  initialError?: string;
}

/**
 * Cổng vào `/orders`: nếu địa chỉ có Liên kết tra cứu (`#code=…&phone=…`) thì xóa fragment
 * khỏi thanh địa chỉ ngay, tra cứu rồi chuyển tới đơn; ngược lại hiện form tra cứu.
 */
export function OrderLookupEntry() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [seed, setSeed] = useState<FormSeed>({ defaultOrderId: "" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const hash = window.location.hash;
    // Xóa trước mọi fetch: fragment có thể chứa SĐT, dù hợp lệ hay không.
    if (hasLookupKeys(hash)) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }

    const link = parseLookupFragment(hash);
    void (async () => {
      if (!link) {
        setPhase("form");
        return;
      }
      setPhase("opening");
      try {
        const response = await fetch("/api/orders/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: link.orderId, phone: link.phone }),
        });
        if (response.ok) {
          const data = (await response.json().catch(() => null)) as { orderId?: unknown } | null;
          if (typeof data?.orderId === "string" && data.orderId) {
            router.replace(`/orders/${data.orderId}`);
            return;
          }
          setSeed({ defaultOrderId: link.orderId, initialError: LOOKUP_NOT_FOUND_MESSAGE });
          setPhase("form");
          return;
        }
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setSeed({
          defaultOrderId: link.orderId,
          initialError:
            typeof body?.error?.message === "string"
              ? body.error.message
              : response.status >= 500
                ? NETWORK_MESSAGE
                : LOOKUP_NOT_FOUND_MESSAGE,
        });
      } catch {
        setSeed({
          defaultOrderId: link.orderId,
          initialError: NETWORK_MESSAGE,
        });
      }
      setPhase("form");
    })();
  }, [router]);

  if (phase === "checking") return null;
  if (phase === "opening") {
    return (
      <p role="status" className="text-slate-600">
        Đang mở đơn hàng của bạn…
      </p>
    );
  }
  return <OrderLookupForm defaultOrderId={seed.defaultOrderId} initialError={seed.initialError} />;
}
