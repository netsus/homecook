import Image from "next/image";
import React from "react";

interface MumeokHorizontalLogoProps {
  className?: string;
  variant?: "default" | "dark";
}

export function MumeokHorizontalLogo({ className, variant = "default" }: MumeokHorizontalLogoProps) {
  if (variant === "dark") {
    return (
      <Image
        alt=""
        aria-hidden="true"
        className={["mumeok-horizontal-logo", "mumeok-horizontal-logo-dark", className].filter(Boolean).join(" ")}
        draggable={false}
        height={480}
        priority
        src="/brand/mumeok-logo-horizontal-dark.webp"
        unoptimized
        width={1600}
      />
    );
  }

  return (
    <Image
      alt=""
      aria-hidden="true"
      className={["mumeok-horizontal-logo", className].filter(Boolean).join(" ")}
      draggable={false}
      height={400}
      priority
      src="/brand/mumeok-logo-horizontal.png"
      unoptimized
      width={1040}
    />
  );
}
