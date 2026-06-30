import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getPantryEmoji, getPantryStickerSrc } from "@/components/pantry/pantry-mobile-visuals";
import stickerManifest from "@/public/assets/ingredients/plush-v2/manifest.json";

type PantryStickerManifestItem = {
  src: string;
};

function readVp8Size(src: string) {
  const file = readFileSync(join(process.cwd(), "public", src.replace(/^\/+/, "")));
  const chunkOffset = file.indexOf("VP8 ");

  expect(file.toString("ascii", 0, 4)).toBe("RIFF");
  expect(file.toString("ascii", 8, 12)).toBe("WEBP");
  expect(chunkOffset).toBeGreaterThan(0);

  const frameStart = chunkOffset + 8;

  return {
    height: file.readUInt16LE(frameStart + 8) & 0x3fff,
    width: file.readUInt16LE(frameStart + 6) & 0x3fff,
  };
}

describe("pantry mobile visuals", () => {
  it("uses the shared category emoji for canonical fruit", () => {
    expect(getPantryEmoji("제철과일", "과일")).toBe("🍓");
  });

  it("keeps Wave1-only display group fallbacks separate from canonical categories", () => {
    expect(getPantryEmoji("렌틸콩", "단백질")).toBe("🥚");
    expect(getPantryEmoji("잡곡밥", "주식")).toBe("🍚");
  });

  it("returns approved sticker assets only for manifest-backed ingredients", () => {
    expect(getPantryStickerSrc("소금")).toBe("/assets/ingredients/plush-v2/salt.webp");
    expect(getPantryStickerSrc("렌틸콩")).toBeNull();
  });

  it("keeps plush-v2 sticker sources as 512px WebP assets for crisp pantry rendering", () => {
    const items = stickerManifest.items as Record<string, PantryStickerManifestItem>;

    expect(Object.keys(items)).toHaveLength(21);

    for (const item of Object.values(items)) {
      expect(item.src).toMatch(/^\/assets\/ingredients\/plush-v2\/.+\.webp$/);
      expect(readVp8Size(item.src)).toEqual({ width: 512, height: 512 });
    }
  });
});
