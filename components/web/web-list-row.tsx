import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function WebListRow({
  className,
  interactive = false,
  ...props
}: WebListRowProps) {
  return (
    <div
      className={cn(
        "web-list-row",
        interactive && "web-list-row-interactive",
        className,
      )}
      {...props}
    />
  );
}
