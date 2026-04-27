"use client";

import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "article" | "section";
  interactive?: boolean;
  loading?: boolean;
}

export function Card({
  as: Tag = "div",
  interactive = false,
  loading = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={[
        "rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-2)]",
        interactive
          ? "transition-all hover:shadow-[var(--shadow-3)] hover:-translate-y-0.5 active:scale-[0.98]"
          : "",
        loading ? "animate-pulse" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  );
}
