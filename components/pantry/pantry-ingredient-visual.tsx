"use client";

import Image from "next/image";
import React from "react";

import { getPantryEmoji, getPantryStickerSrc } from "@/components/pantry/pantry-mobile-visuals";

export const PANTRY_STICKER_UPGRADED_SIZES =
  "(min-resolution: 2.5dppx) 96px, (min-resolution: 2dppx) 128px, 192px";

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
  sizes = PANTRY_STICKER_UPGRADED_SIZES,
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
