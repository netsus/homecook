import * as React from "react";

import { cn } from "@/components/web/utils";

type WebButtonVariant = "primary" | "secondary" | "tertiary" | "ghost";
type WebButtonSize = "sm" | "md" | "lg";

export interface WebButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  fullWidth?: boolean;
  size?: WebButtonSize;
  variant?: WebButtonVariant;
}

export function WebButton({
  className,
  fullWidth = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: WebButtonProps) {
  return (
    <button
      className={cn(
        "web-button",
        `web-button-${variant}`,
        size !== "md" && `web-button-${size}`,
        fullWidth && "web-button-full",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
