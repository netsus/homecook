import Image from "next/image";
import React from "react";

interface MumeokHorizontalLogoProps {
  className?: string;
}

export function MumeokHorizontalLogo({ className }: MumeokHorizontalLogoProps) {
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
