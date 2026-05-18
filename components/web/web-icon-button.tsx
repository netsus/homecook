import * as React from "react";

import { cn } from "@/components/web/utils";

export type WebIconButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement>;

export const WebIconButton = React.forwardRef<
  HTMLButtonElement,
  WebIconButtonProps
>(function WebIconButton({ className, type = "button", ...props }, ref) {
  return (
    <button
      className={cn("web-icon-button", className)}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
