export const RECIPE_IMAGE_COMPRESSION_MAX_DIMENSION = 1600;
export const RECIPE_IMAGE_COMPRESSION_QUALITY = 0.82;
export const RECIPE_IMAGE_COMPRESSION_MIN_BYTES = 700 * 1024;

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function canCompressImages() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof globalThis.createImageBitmap === "function"
  );
}

function getOutputType(inputType: string) {
  return inputType === "image/webp" ? "image/webp" : "image/jpeg";
}

function getOutputExtension(outputType: string) {
  return outputType === "image/webp" ? "webp" : "jpg";
}

function buildCompressedFileName(fileName: string, outputType: string) {
  const baseName = fileName.replace(/\.[^.]+$/u, "") || "recipe-image";

  return `${baseName}-compressed.${getOutputExtension(outputType)}`;
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export async function compressRecipeImageFile(file: File): Promise<File> {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type) || !canCompressImages()) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await globalThis.createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, RECIPE_IMAGE_COMPRESSION_MAX_DIMENSION / longestSide);
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
    const shouldResize = scale < 1;
    const shouldReencode = file.size > RECIPE_IMAGE_COMPRESSION_MIN_BYTES;

    if (!shouldResize && !shouldReencode) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const outputType = getOutputType(file.type);
    const compressedBlob = await toBlob(
      canvas,
      outputType,
      RECIPE_IMAGE_COMPRESSION_QUALITY,
    );

    if (!compressedBlob || compressedBlob.size >= file.size) {
      return file;
    }

    return new File(
      [compressedBlob],
      buildCompressedFileName(file.name, compressedBlob.type || outputType),
      {
        lastModified: file.lastModified,
        type: compressedBlob.type || outputType,
      },
    );
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
