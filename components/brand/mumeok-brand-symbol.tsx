import Image from "next/image";
import React from "react";

interface MumeokBrandSymbolProps {
  className?: string;
  size?: number;
}

export function MumeokBrandSymbol({
  className,
  size = 32,
}: MumeokBrandSymbolProps) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={["mumeok-brand-symbol", className].filter(Boolean).join(" ")}
      draggable={false}
      height={size}
      priority
      src="/brand/mumeok-symbol-192.png"
      unoptimized
      width={size}
    />
  );
}
