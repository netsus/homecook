"use client";

import React, { forwardRef, useLayoutEffect, useState } from "react";

type DecimalInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
};

function parseDecimal(value: string): number | null {
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Keep editing text such as an empty value or `12.` out of persisted numbers. */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onValueChange, onBlur, inputMode = "decimal", ...props }, ref,
) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useLayoutEffect(() => {
    setText((current) => parseDecimal(current) === value ? current : value === null ? "" : String(value));
  }, [value]);

  return <input {...props} inputMode={inputMode} ref={ref} type="text" value={text}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^-?\d*(?:\.\d*)?$/u.test(next)) return;
      setText(next);
      onValueChange(parseDecimal(next));
    }}
    onBlur={(event) => {
      const parsed = parseDecimal(text);
      if (parsed !== null) setText(String(parsed));
      onBlur?.(event);
    }} />;
});
