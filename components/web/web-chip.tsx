import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function WebChip({
  active = false,
  className,
  type = "button",
  ...props
}: WebChipProps) {
  return (
    <button
      aria-pressed={active}
      className={cn("web-chip", active && "web-chip-active", className)}
      type={type}
      {...props}
    />
  );
}
