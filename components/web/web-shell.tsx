import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebShellProps extends React.HTMLAttributes<HTMLDivElement> {
  wide?: boolean;
}

export function WebShell({
  children,
  className,
  wide = false,
  ...props
}: WebShellProps) {
  return (
    <div className={cn("web-shell", className)} {...props}>
      <div className="web-page">
        <div className={wide ? "web-container-wide" : "web-container"}>
          {children}
        </div>
      </div>
    </div>
  );
}
