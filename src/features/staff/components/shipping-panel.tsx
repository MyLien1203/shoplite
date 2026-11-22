"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { validateShippingForm, vnDateOf, type ShippingFormResult } from "../shipping-form";

type Errors = ShippingFormResult["errors"];
type FieldKey = "trackingCode" | "expectedDeliveryDate";

export interface ShippingPanelProps {
  orderId: string;
  createdAt: string;
  /** Đang chờ server: khóa ô, nút đổi nhãn, bỏ qua Esc. */
  pending: boolean;
  /** Lỗi từng ô do server trả (đổi đối tượng mỗi lần có lỗi mới). */
  serverErrors: Errors | null;
  /** Lỗi chung (mạng, 5xx). */
  generalError: string | null;
  onSubmit: (values: ShippingFormResult["values"]) => void;
  onClose: () => void;
}

const FIELD_ORDER: FieldKey[] = ["trackingCode", "expectedDeliveryDate"];

function withPeriod(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function ShippingPanel({
  orderId,
  createdAt,
  pending,
  serverErrors,
  generalError,
  onSubmit,
  onClose,
}: ShippingPanelProps) {
  const [trackingCode, setTrackingCode] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const codeRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const ids = {
    panel: `shipping-panel-${orderId}`,
    code: `shipping-code-${orderId}`,
    codeError: `shipping-code-error-${orderId}`,
    date: `shipping-date-${orderId}`,
    dateError: `shipping-date-error-${orderId}`,
  };
  const min = vnDateOf(createdAt);

  function focusFirst(next: Errors) {
    const first = FIELD_ORDER.find((key) => next[key] !== undefined);
    if (first === "trackingCode") codeRef.current?.focus();
    else if (first === "expectedDeliveryDate") dateRef.current?.focus();
  }

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  // Nhận lỗi từng ô từ server: đặt state ngay lúc render khi prop đổi (không setState trong effect).
  const [seenServerErrors, setSeenServerErrors] = useState<Errors | null>(null);
  if (serverErrors !== seenServerErrors) {
    setSeenServerErrors(serverErrors);
    if (serverErrors) {
      const next: Errors = {};
      if (serverErrors.trackingCode) next.trackingCode = withPeriod(serverErrors.trackingCode);
      if (serverErrors.expectedDeliveryDate) {
        next.expectedDeliveryDate = withPeriod(serverErrors.expectedDeliveryDate);
      }
      setErrors(next);
    }
  }

  useEffect(() => {
    if (!serverErrors) return;
    if (serverErrors.trackingCode) codeRef.current?.focus();
    else if (serverErrors.expectedDeliveryDate) dateRef.current?.focus();
  }, [serverErrors]);

  useEffect(() => {
    if (generalError) formRef.current?.querySelector<HTMLElement>("button[type=submit]")?.focus();
  }, [generalError]);

  function clearError(key: FieldKey) {
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const result = validateShippingForm({ trackingCode, expectedDeliveryDate }, createdAt);
    setErrors(result.errors);
    if (Object.keys(result.errors).length > 0) {
      focusFirst(result.errors);
      return;
    }
    onSubmit(result.values);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !pending) onClose();
  }

  const ring = (key: FieldKey) => (errors[key] ? "ring-rose-400" : "ring-slate-300");

  return (
    <form
      ref={formRef}
      id={ids.panel}
      noValidate
      aria-label={`Giao hàng đơn ${orderId}`}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="rounded-xl bg-slate-50 p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={ids.code} className="text-sm font-medium text-slate-700">
            Mã vận đơn
          </label>
          <input
            ref={codeRef}
            id={ids.code}
            type="text"
            autoComplete="off"
            value={trackingCode}
            readOnly={pending}
            aria-invalid={errors.trackingCode ? "true" : undefined}
            aria-describedby={errors.trackingCode ? ids.codeError : undefined}
            onChange={(e) => {
              setTrackingCode(e.target.value);
              clearError("trackingCode");
            }}
            className={`${inputClass} ${ring("trackingCode")}`}
          />
          {errors.trackingCode && (
            <p id={ids.codeError} role="alert" className="text-sm break-words text-rose-700">
              {errors.trackingCode}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={ids.date} className="text-sm font-medium text-slate-700">
            Ngày giao dự kiến
          </label>
          <input
            ref={dateRef}
            id={ids.date}
            type="date"
            min={min ?? undefined}
            value={expectedDeliveryDate}
            readOnly={pending}
            aria-invalid={errors.expectedDeliveryDate ? "true" : undefined}
            aria-describedby={errors.expectedDeliveryDate ? ids.dateError : undefined}
            onChange={(e) => {
              setExpectedDeliveryDate(e.target.value);
              clearError("expectedDeliveryDate");
            }}
            className={`${inputClass} ${ring("expectedDeliveryDate")}`}
          />
          {errors.expectedDeliveryDate && (
            <p id={ids.dateError} role="alert" className="text-sm break-words text-rose-700">
              {errors.expectedDeliveryDate}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          className="max-sm:h-12 max-sm:w-full"
          disabled={pending}
        >
          {pending ? "Đang chuyển…" : "Bắt đầu giao"}
        </Button>
      </div>
      {generalError && (
        <p role="alert" className="mt-2 text-sm break-words text-rose-700">
          {generalError}
        </p>
      )}
    </form>
  );
}
