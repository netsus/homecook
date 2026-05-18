import * as React from "react";

import { cn } from "@/components/web/utils";

export function WebTabs({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-tabs", className)} {...props} />;
}

export interface WebTabButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function WebTabButton({
  active = false,
  className,
  type = "button",
  ...props
}: WebTabButtonProps) {
  return (
    <button
      aria-selected={active}
      className={cn("web-tab", active && "web-tab-active", className)}
      role="tab"
      type={type}
      {...props}
    />
  );
}
