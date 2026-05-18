import * as React from "react";

import { cn } from "@/components/web/utils";

export function WebCTA({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("web-cta", className)} {...props} />;
}
