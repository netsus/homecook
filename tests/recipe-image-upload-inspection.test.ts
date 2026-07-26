import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";
import { inspectRecipeImageUpload } from "@/lib/server/recipe-image-upload";

const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
  "base64",
);
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const WEBP_1X1 = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==",
  "base64",
).subarray(0, 42);

function file(bytes: Uint8Array | number[], type: string) {
  return new File([new Uint8Array(bytes)], "recipe.bin", { type });
}

describe("recipe image upload byte inspection", () => {
  it.each([
    {
      bytes: JPEG_1X1,
      declaredType: "image/jpeg",
      extension: "jpg",
    },
    {
      bytes: PNG_1X1,
      declaredType: "image/png",
      extension: "png",
    },
    {
      bytes: WEBP_1X1,
      declaredType: "image/webp",
      extension: "webp",
    },
  ])(
    "derives $declaredType and raw hash from bytes",
    async ({ bytes, declaredType, extension }) => {
      const image = file(bytes, declaredType);

      const result = await inspectRecipeImageUpload(image);

      expect(result).toEqual({
        ok: true,
        value: {
          actualMimeType: declaredType,
          byteSize: bytes.length,
          extension,
          rawSha256: createHash("sha256")
            .update(new Uint8Array(bytes))
            .digest("hex"),
        },
      });
    },
  );

  it("rejects a declared MIME that does not match the bytes", async () => {
    const result = await inspectRecipeImageUpload(file(
      PNG_1X1,
      "image/jpeg",
    ));

    expect(result).toEqual({
      ok: false,
      reason: "declared_type_mismatch",
    });
  });

  it("rejects unsupported or truncated byte signatures", async () => {
    await expect(inspectRecipeImageUpload(
      file([0xff, 0xd8, 0xff, 0xd9], "image/jpeg"),
    )).resolves.toEqual({
      ok: false,
      reason: "unsupported_actual_type",
    });
    await expect(inspectRecipeImageUpload(
      file(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "image/png",
      ),
    )).resolves.toEqual({
      ok: false,
      reason: "unsupported_actual_type",
    });
    await expect(inspectRecipeImageUpload(
      file(
        [
          0x52, 0x49, 0x46, 0x46,
          0x04, 0x00, 0x00, 0x00,
          0x57, 0x45, 0x42, 0x50,
        ],
        "image/webp",
      ),
    )).resolves.toEqual({
      ok: false,
      reason: "unsupported_actual_type",
    });
  });

  it("rejects an oversized file before reading its bytes", async () => {
    const image = file(
      new Uint8Array(RECIPE_IMAGE_MAX_BYTES + 1),
      "image/png",
    );
    const arrayBuffer = vi.spyOn(image, "arrayBuffer");

    await expect(inspectRecipeImageUpload(image)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
