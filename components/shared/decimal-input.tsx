"use client";

import React, { forwardRef, useLayoutEffect, useState } from "react";
import { parseQuantityInput } from "@/lib/quantity-input";

type DecimalInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Consumers opt in only when their server can preserve the raw quantity. */
  allowFractions?: boolean;
  rawValue?: string;
  onRawValueChange?: (value: string) => void;
};

function parseDecimal(value: string): number | null {
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseEditingQuantity(value: string, allowFractions: boolean) {
  return allowFractions ? parseQuantityInput(value)?.amount ?? null : parseDecimal(value);
}

/** Keep editing text such as an empty value or `12.` out of persisted numbers. */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onValueChange, onBlur, inputMode = "decimal", allowFractions = false, rawValue, onRawValueChange, ...props }, ref,
) {
  const [text, setText] = useState(rawValue ?? (value === null ? "" : String(value)));
  useLayoutEffect(() => {
    setText((current) => rawValue !== undefined && parseEditingQuantity(rawValue, allowFractions) === value ? rawValue
      : parseEditingQuantity(current, allowFractions) === value ? current : value === null ? "" : String(value));
  }, [value, rawValue, allowFractions]);

  return <input {...props} inputMode={inputMode} ref={ref} type="text" value={text}
    onChange={(event) => {
      const next = event.target.value;
      if (!(allowFractions ? /^-?\d*(?:\.\d*)?(?:\s*\/\s*\d*)?$/u : /^-?\d*(?:\.\d*)?$/u).test(next)) return;
      setText(next);
      onValueChange(parseEditingQuantity(next, allowFractions));
      onRawValueChange?.(next);
    }}
    onBlur={(event) => {
      const parsed = parseEditingQuantity(text, allowFractions);
      if (parsed !== null && !allowFractions) setText(String(parsed));
      onBlur?.(event);
    }} />;
});
