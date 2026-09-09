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
      sizes="(min-width: 1024px) 174px, 138px"
      src="/brand/mumeok-logo-horizontal.png"
      width={1040}
    />
  );
}
