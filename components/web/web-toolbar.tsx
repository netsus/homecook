import * as React from "react";

import { cn } from "@/components/web/utils";

export function WebToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-toolbar", className)} {...props} />;
}
