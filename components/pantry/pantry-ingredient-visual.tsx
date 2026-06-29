"use client";

import Image from "next/image";
import React from "react";

import { getPantryEmoji, getPantryStickerSrc } from "@/components/pantry/pantry-mobile-visuals";

interface PantryIngredientVisualProps {
  category?: string;
  className: string;
  imageClassName?: string;
  name: string;
}

export function PantryIngredientVisual({
  category,
  className,
  imageClassName = "pantry-sticker-image",
  name,
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
          sizes="56px"
          src={stickerSrc}
          width={512}
        />
      ) : (
        getPantryEmoji(name, category)
      )}
    </span>
  );
}
