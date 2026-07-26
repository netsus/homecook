import { createHash } from "node:crypto";

import {
  RECIPE_IMAGE_MAX_BYTES,
  type RecipeImageMimeType,
} from "@/lib/server/recipe-media";

type RecipeImageExtension = "jpg" | "png" | "webp";

interface RecipeImageInspection {
  actualMimeType: RecipeImageMimeType;
  byteSize: number;
  extension: RecipeImageExtension;
  rawSha256: string;
}

export type RecipeImageInspectionResult =
  | { ok: true; value: RecipeImageInspection }
  | {
    ok: false;
    reason:
      | "declared_type_mismatch"
      | "too_large"
      | "unsupported_actual_type";
  };

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function readBigEndian16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) * 0x100 + (bytes[offset + 1] ?? 0);
}

function readLittleEndian16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 0x100;
}

function readBigEndian32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readLittleEndian32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] ?? 0)
    + ((bytes[offset + 1] ?? 0) << 8)
    + ((bytes[offset + 2] ?? 0) << 16)
    + ((bytes[offset + 3] ?? 0) * 0x1000000)
  ) >>> 0;
}

function isJpegStartOfFrame(marker: number) {
  return [
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ].includes(marker);
}

function isStructuredJpeg(bytes: Uint8Array) {
  if (!hasPrefix(bytes, [0xff, 0xd8])) {
    return false;
  }

  let hasStartOfFrame = false;
  let hasScan = false;
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return false;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === undefined || marker === 0x00) {
      return false;
    }
    if (marker === 0xd9) {
      return hasStartOfFrame && hasScan && offset === bytes.length;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      return false;
    }
    if (offset + 2 > bytes.length) {
      return false;
    }

    const segmentLength = readBigEndian16(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }

    if (isJpegStartOfFrame(marker)) {
      if (
        segmentLength < 8
        || readBigEndian16(bytes, offset + 3) === 0
        || readBigEndian16(bytes, offset + 5) === 0
      ) {
        return false;
      }
      hasStartOfFrame = true;
    }

    const segmentEnd = offset + segmentLength;
    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    if (!hasStartOfFrame) {
      return false;
    }
    hasScan = true;
    offset = segmentEnd;

    while (offset + 1 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const next = bytes[offset + 1];
      if (next === 0x00 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) {
        offset += 2;
        continue;
      }
      break;
    }
  }

  return false;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isStructuredPng(bytes: Uint8Array) {
  if (!hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return false;
  }

  let hasHeader = false;
  let hasImageData = false;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readBigEndian32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      return false;
    }

    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, dataEnd)) !== readBigEndian32(bytes, dataEnd)) {
      return false;
    }

    if (!hasHeader) {
      if (
        type !== "IHDR"
        || length !== 13
        || readBigEndian32(bytes, dataStart) === 0
        || readBigEndian32(bytes, dataStart + 4) === 0
      ) {
        return false;
      }
      hasHeader = true;
    } else if (type === "IDAT") {
      hasImageData = true;
    } else if (type === "IEND") {
      return length === 0 && hasImageData && chunkEnd === bytes.length;
    }

    offset = chunkEnd;
  }

  return false;
}

function webpChunkType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function isStructuredWebp(bytes: Uint8Array) {
  if (
    !hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46])
    || bytes.length < 20
    || !hasPrefix(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
    || readLittleEndian32(bytes, 4) + 8 !== bytes.length
  ) {
    return false;
  }

  let hasImageChunk = false;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const type = webpChunkType(bytes, offset);
    const length = readLittleEndian32(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + (length % 2);
    if (dataEnd < dataStart || chunkEnd > bytes.length) {
      return false;
    }

    if (type === "VP8 ") {
      if (
        length < 10
        || !hasPrefix(bytes.subarray(dataStart + 3), [0x9d, 0x01, 0x2a])
        || (readLittleEndian16(bytes, dataStart + 6) & 0x3fff) === 0
        || (readLittleEndian16(bytes, dataStart + 8) & 0x3fff) === 0
      ) {
        return false;
      }
      hasImageChunk = true;
    } else if (type === "VP8L") {
      if (length < 5 || bytes[dataStart] !== 0x2f) {
        return false;
      }
      hasImageChunk = true;
    } else if (type === "VP8X" && length !== 10) {
      return false;
    }

    offset = chunkEnd;
  }

  return hasImageChunk && offset === bytes.length;
}

function detectRecipeImageType(bytes: Uint8Array): {
  mimeType: RecipeImageMimeType;
  extension: RecipeImageExtension;
} | null {
  if (isStructuredJpeg(bytes)) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }

  if (isStructuredPng(bytes)) {
    return { mimeType: "image/png", extension: "png" };
  }

  if (isStructuredWebp(bytes)) {
    return { mimeType: "image/webp", extension: "webp" };
  }

  return null;
}

export async function inspectRecipeImageUpload(
  image: File,
): Promise<RecipeImageInspectionResult> {
  if (image.size > RECIPE_IMAGE_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const detected = detectRecipeImageType(bytes);

  if (!detected) {
    return { ok: false, reason: "unsupported_actual_type" };
  }

  if (image.type !== detected.mimeType) {
    return { ok: false, reason: "declared_type_mismatch" };
  }

  return {
    ok: true,
    value: {
      actualMimeType: detected.mimeType,
      byteSize: bytes.byteLength,
      extension: detected.extension,
      rawSha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
