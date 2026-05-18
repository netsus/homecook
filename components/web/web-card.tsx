import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function WebCard({
  className,
  interactive = false,
  ...props
}: WebCardProps) {
  return (
    <div
      className={cn("web-card", interactive && "web-card-interactive", className)}
      {...props}
    />
  );
}

export function WebCardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-card-body", className)} {...props} />;
}
