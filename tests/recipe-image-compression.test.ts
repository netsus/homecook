// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressRecipeImageFile,
  RECIPE_IMAGE_COMPRESSION_MAX_DIMENSION,
} from "@/lib/recipe-image-compression";

describe("recipe image compression", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "createImageBitmap");
  });

  it("downscales large recipe images before upload", async () => {
    const close = vi.fn();
    const bitmap = { close, height: 2000, width: 4000 };
    const drawImage = vi.fn();
    let capturedCanvas: HTMLCanvasElement | undefined;

    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => bitmap),
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        tagName,
      ) as HTMLElement;

      if (tagName !== "canvas") {
        return element;
      }

      const canvas = element as HTMLCanvasElement;
      capturedCanvas = canvas;
      Object.defineProperty(canvas, "getContext", {
        configurable: true,
        value: vi.fn(() => ({ drawImage })),
      });
      Object.defineProperty(canvas, "toBlob", {
        configurable: true,
        value: vi.fn((callback: BlobCallback, type?: string) => {
          callback(new Blob([new Uint8Array(128 * 1024)], { type }));
        }),
      });

      return canvas;
    });

    const original = new File(
      [new Uint8Array(3 * 1024 * 1024)],
      "recipe-photo.jpg",
      { type: "image/jpeg" },
    );

    const compressed = await compressRecipeImageFile(original);

    expect(compressed).not.toBe(original);
    expect(compressed.name).toBe("recipe-photo-compressed.jpg");
    expect(compressed.type).toBe("image/jpeg");
    expect(compressed.size).toBeLessThan(original.size);
    expect(capturedCanvas).toBeDefined();
    expect(capturedCanvas?.width).toBe(RECIPE_IMAGE_COMPRESSION_MAX_DIMENSION);
    expect(capturedCanvas?.height).toBe(800);
    expect(drawImage).toHaveBeenCalledWith(
      bitmap,
      0,
      0,
      RECIPE_IMAGE_COMPRESSION_MAX_DIMENSION,
      800,
    );
    expect(close).toHaveBeenCalled();
  });

  it("keeps the original file when browser image APIs are unavailable", async () => {
    const original = new File(["small"], "recipe-photo.jpg", {
      type: "image/jpeg",
    });

    await expect(compressRecipeImageFile(original)).resolves.toBe(original);
  });
});
