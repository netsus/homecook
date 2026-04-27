"use client";

import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

const roundedMap: Record<string, string> = {
  sm: "rounded-[var(--radius-sm)]",
  md: "rounded-[var(--radius-md)]",
  lg: "rounded-[var(--radius-lg)]",
  full: "rounded-[var(--radius-full)]",
};

export function Skeleton({
  width,
  height,
  rounded = "md",
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={[
        "animate-pulse bg-[var(--surface-fill)]",
        roundedMap[rounded],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
      {...rest}
    />
  );
}
