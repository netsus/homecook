import * as React from "react";

import { cn } from "@/components/web/utils";

type WebDialogSize = "narrow" | "default" | "wide";

export interface WebDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  "aria-labelledby": string;
  size?: WebDialogSize;
}

export const WebDialog = React.forwardRef<HTMLDivElement, WebDialogProps>(
function WebDialog(
  {
    className,
    size = "default",
    ...props
  },
  ref,
) {
  return (
    <div
      aria-modal="true"
      className={cn(
        "web-dialog",
        size !== "default" && `web-dialog-${size}`,
        className,
      )}
      ref={ref}
      role="dialog"
      {...props}
    />
  );
});

export function WebDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-header", className)} {...props} />;
}

export function WebDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("web-dialog-title", className)} {...props} />;
}

export function WebDialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-body", className)} {...props} />;
}

export function WebDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-dialog-footer", className)} {...props} />;
}
