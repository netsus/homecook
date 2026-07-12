import * as React from "react";

import { WebFooter } from "@/components/web/web-footer";
import { cn } from "@/components/web/utils";

export interface WebShellProps extends React.HTMLAttributes<HTMLDivElement> {
  footer?: boolean;
  wide?: boolean;
}

export function WebShell({
  children,
  className,
  footer = true,
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
      {footer ? <WebFooter /> : null}
    </div>
  );
}
