"use client";

import Image from "next/image";
import React from "react";

import { getPantryEmoji, getPantryStickerSrc } from "@/components/pantry/pantry-mobile-visuals";

interface PantryIngredientVisualProps {
  category?: string;
  className: string;
  imageClassName?: string;
  name: string;
  sizes?: string;
}

export function PantryIngredientVisual({
  category,
  className,
  imageClassName = "pantry-sticker-image",
  name,
  sizes = "112px",
}: PantryIngredientVisualProps) {
  const stickerSrc = getPantryStickerSrc(name);

  return (
    <span aria-hidden="true" className={className}>
      {stickerSrc ? (
        <Image
          alt=""
          className={imageClassName}
          draggable={false}
          height={512}
          loading="lazy"
          quality={95}
          sizes={sizes}
          src={stickerSrc}
          width={512}
        />
      ) : (
        getPantryEmoji(name, category)
      )}
    </span>
  );
}
