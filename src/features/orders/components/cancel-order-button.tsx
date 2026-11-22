"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiErrorBody } from "@/lib/http";

const NOT_FOUND_MESSAGE = "Không thể hủy đơn. Vui lòng tra cứu lại đơn hàng.";
const GENERIC_MESSAGE = "Không thể hủy đơn hàng";

interface CancelFailure {
  message: string;
  notFound: boolean;
}

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<CancelFailure | null>(null);

  async function cancelOrder() {
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          setFailure({ message: NOT_FOUND_MESSAGE, notFound: true });
          return;
        }
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setFailure({ message: body?.error?.message ?? GENERIC_MESSAGE, notFound: false });
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setFailure({ message: GENERIC_MESSAGE, notFound: false });
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Hủy đơn hàng
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-rose-50 p-4 text-sm">
      <p className="font-medium text-rose-900">Bạn chắc chắn muốn hủy đơn hàng này?</p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={cancelOrder} disabled={pending}>
          {pending ? "Đang hủy…" : "Xác nhận hủy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Không
        </Button>
      </div>
      {failure && (
        <p role="alert" className="text-rose-700">
          {failure.message}
          {failure.notFound && (
            <>
              {" "}
              <Link href="/orders" className="font-medium underline">
                Tra cứu đơn hàng
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
