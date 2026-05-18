import * as React from "react";

import { cn } from "@/components/web/utils";

export interface WebSkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  height?: number | string;
  width?: number | string;
}

export function WebSkeleton({
  className,
  height,
  style,
  width,
  ...props
}: WebSkeletonProps) {
  return (
    <div
      className={cn("web-skeleton", className)}
      style={{ height, width, ...style }}
      {...props}
    />
  );
}
