import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const baselineRoot = "tests/fixtures/brand/mumeok-icon-edge-baseline";
const baselineFixtureHashes = new Map([
  ["favicon/favicon-16.png", "13bb6653da1bacf4684e3b785f7352b744cf27cd4bf4e827d2966a20056aeafd"],
  ["favicon/favicon-32.png", "618eb3cc720481d17df87471052fa76c244ae6d55b81b67d2c88bb16e0f64c55"],
  ["favicon/favicon-48.png", "dec734695ee64d540c6970216a3648012b47f0c2d497632b36cfa07f47bcdbe2"],
  ["favicon/favicon-64.png", "5bae47736c2abfd048fae6ef521b4bb1b815573277278ac4bb06453ee8100bb7"],
  ["icons/apple-touch-icon-180.png", "604e13d7722edb3c7f69a466291e3d88c849e5e53afa88a1cff402959fb5c21d"],
  ["icons/app-icon-192.png", "694f523a5505c6ce2384d4b393f0ca7761597318c7f3e8bf44777b6efe3f6fac"],
  ["icons/app-icon-256.png", "55d58b881dd7445dd605e9297c6b83315006c6a9b3a87444f7cbe98849b7008d"],
  ["icons/app-icon-512.png", "c459d3141363d4e28ceaaf17a71423b1c76555e9f039aadbeb9476dde80afa7d"],
  ["icons/app-icon-1024.png", "3a527b0542835fa96f021b3e4009c5e119a5bd4a064383f4b7d9e2feacb46568"],
]);

type RgbaImage = {
  data: Uint8Array;
  height: number;
  width: number;
};

function read(path: string) {
  return readFileSync(resolve(root, path));
}

function sha256(path: string) {
  return createHash("sha256").update(read(path)).digest("hex");
}

function paethPredictor(a: number, b: number, c: number) {
  const prediction = a + b - c;
  const distanceA = Math.abs(prediction - a);
  const distanceB = Math.abs(prediction - b);
  const distanceC = Math.abs(prediction - c);

  if (distanceA <= distanceB && distanceA <= distanceC) return a;
  if (distanceB <= distanceC) return b;
  return c;
}

function decodePng(buffer: Buffer): RgbaImage {
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      expect(chunk[12]).toBe(0);
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  expect(bitDepth).toBe(8);
  expect([2, 6]).toContain(colorType);

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  expect(inflated.length).toBe((stride + 1) * height);

  const decoded = new Uint8Array(stride * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const target = y * stride + x;
      const left = x >= channels ? decoded[target - channels] : 0;
      const up = y > 0 ? decoded[target - stride] : 0;
      const upLeft = y > 0 && x >= channels ? decoded[target - stride - channels] : 0;
      let value = raw;

      if (filter === 0) value = raw;
      else if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paethPredictor(left, up, upLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);

      decoded[target] = value & 0xff;
    }

    sourceOffset += stride;
  }

  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4] = decoded[pixel * channels];
    data[pixel * 4 + 1] = decoded[pixel * channels + 1];
    data[pixel * 4 + 2] = decoded[pixel * channels + 2];
    data[pixel * 4 + 3] = channels === 4 ? decoded[pixel * channels + 3] : 255;
  }

  return { data, height, width };
}

function image(path: string) {
  return decodePng(read(path));
}

function rgbaAt(value: RgbaImage, x: number, y: number) {
  const offset = (y * value.width + x) * 4;
  return Array.from(value.data.subarray(offset, offset + 4));
}

function isNearWhite([red, green, blue]: number[]) {
  return (
    red >= 220 &&
    green >= 220 &&
    blue >= 220 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) <= 24
  );
}

function exteriorMatteMask(value: RgbaImage) {
  const size = value.width * value.height;
  const mask = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  const enqueue = (index: number) => {
    if (mask[index] === 1) return;
    const pixel = Array.from(value.data.subarray(index * 4, index * 4 + 4));
    if (!isNearWhite(pixel)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < value.width; x += 1) {
    enqueue(x);
    enqueue((value.height - 1) * value.width + x);
  }
  for (let y = 0; y < value.height; y += 1) {
    enqueue(y * value.width);
    enqueue(y * value.width + value.width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % value.width;
    const y = Math.floor(index / value.width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < value.width) enqueue(index + 1);
    if (y > 0) enqueue(index - value.width);
    if (y + 1 < value.height) enqueue(index + value.width);
  }

  return mask;
}

function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number,
) {
  let dilated = mask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = dilated.slice();
    for (let index = 0; index < mask.length; index += 1) {
      if (dilated[index] === 0) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) next[index - 1] = 1;
      if (x + 1 < width) next[index + 1] = 1;
      if (y > 0) next[index - width] = 1;
      if (y + 1 < height) next[index + width] = 1;
    }
    dilated = next;
  }

  return dilated;
}

function expectProtectedCoreUnchanged(baselinePath: string, candidatePath: string) {
  const baseline = image(baselinePath);
  const candidate = image(candidatePath);
  expect({ height: candidate.height, width: candidate.width }).toEqual({
    height: baseline.height,
    width: baseline.width,
  });

  const allowed = dilateMask(
    exteriorMatteMask(baseline),
    baseline.width,
    baseline.height,
    2,
  );
  let firstChangedPixel = -1;
  for (let pixel = 0; pixel < baseline.width * baseline.height; pixel += 1) {
    if (allowed[pixel] === 1) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      if (candidate.data[offset + channel] !== baseline.data[offset + channel]) {
        firstChangedPixel = pixel;
        break;
      }
    }
    if (firstChangedPixel !== -1) break;
  }
  expect(firstChangedPixel, `protected core changed in ${candidatePath}`).toBe(-1);
}

function icoFrames(path: string) {
  const buffer = read(path);
  expect(buffer.readUInt16LE(0)).toBe(0);
  expect(buffer.readUInt16LE(2)).toBe(1);
  const count = buffer.readUInt16LE(4);

  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + index * 16;
    const width = buffer[entry] === 0 ? 256 : buffer[entry];
    const height = buffer[entry + 1] === 0 ? 256 : buffer[entry + 1];
    const byteLength = buffer.readUInt32LE(entry + 8);
    const imageOffset = buffer.readUInt32LE(entry + 12);
    return {
      image: decodePng(buffer.subarray(imageOffset, imageOffset + byteLength)),
      size: `${width}x${height}`,
    };
  });
}

describe("service brand icon edge treatment", () => {
  it("locks every approved pre-edit baseline fixture by SHA-256", () => {
    for (const [relativePath, expectedHash] of baselineFixtureHashes) {
      const fixturePath = `${baselineRoot}/${relativePath}`;
      expect(existsSync(resolve(root, fixturePath)), fixturePath).toBe(true);
      expect(sha256(fixturePath), fixturePath).toBe(expectedHash);
    }
  });

  it("keeps the approved source, header, social, and auxiliary assets immutable", () => {
    const expected = new Map([
      [
        "ui/designs/brand/mumeok/exports/source/mumeok-symbol-selected-source-1254.png",
        "7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4",
      ],
      [
        "public/brand/mumeok-symbol-192.png",
        "694f523a5505c6ce2384d4b393f0ca7761597318c7f3e8bf44777b6efe3f6fac",
      ],
      [
        "ui/designs/brand/mumeok/exports/icons/header-symbol-192.png",
        "694f523a5505c6ce2384d4b393f0ca7761597318c7f3e8bf44777b6efe3f6fac",
      ],
      [
        "ui/designs/brand/mumeok/exports/social/og-image-1200x630.png",
        "cb1e6f45533df5906eda0ed72ca68bd4d1fd373964cc64d0f502e48d5b19eb27",
      ],
      [
        "ui/designs/brand/mumeok/exports/social/twitter-image-1200x630.png",
        "cb1e6f45533df5906eda0ed72ca68bd4d1fd373964cc64d0f502e48d5b19eb27",
      ],
      [
        "ui/designs/brand/mumeok/exports/logo/mumeok-logo-horizontal-light.png",
        "5b88934b27b9973ffd6da2a4f7602dc2472d4bec0c196299d7a6f5370efacaa8",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-logo-horizontal-black.png",
        "1eb753329271469220a954b8834d01958d56d4818aba2123c2e2dc652ca5b374",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-logo-horizontal-white.png",
        "06d2f943037d2e29b0a5b5f2d19ad86c44317455b290fb2df1af10205d15ad2d",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-symbol-black-on-white.png",
        "9cbb066ced2a54d6d925e4efb3216a8eb49fe0043e58228eb1eee8dd4a96d488",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-symbol-black-transparent.png",
        "4d9042ffba540e6554af7fbbc40754dd5f6ed85f850ced55c12d02a0986486df",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-symbol-white-on-dark.png",
        "9907d9be9c1bb74077d150fbf9645fffb5cdb450af91b2d12eed441d0fd1e764",
      ],
      [
        "ui/designs/brand/mumeok/exports/monochrome/mumeok-symbol-white-transparent.png",
        "abee931d6eca832cb13877737e3c5da6743f30898b3871e9ff25cb8b252ccd06",
      ],
    ]);

    for (const [path, hash] of expected) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
      expect(sha256(path), path).toBe(hash);
    }
  });

  it.each([16, 32, 48, 64])(
    "exports a %spx favicon with transparent corners and no white alpha halo",
    (size) => {
      const path = `ui/designs/brand/mumeok/exports/favicon/favicon-${size}.png`;
      const value = image(path);
      expect({ height: value.height, width: value.width }).toEqual({
        height: size,
        width: size,
      });

      const baseline = image(`${baselineRoot}/favicon/favicon-${size}.png`);
      const exterior = exteriorMatteMask(baseline);
      const transition = dilateMask(exterior, size, size, 2);
      let opaqueExteriorPixel = -1;
      let whiteTransitionPixel = -1;

      for (let pixel = 0; pixel < value.width * value.height; pixel += 1) {
        const rgba = Array.from(value.data.subarray(pixel * 4, pixel * 4 + 4));
        if (exterior[pixel] === 1 && rgba[3] !== 0) {
          opaqueExteriorPixel = pixel;
          break;
        }
        if (
          transition[pixel] === 1 &&
          exterior[pixel] === 0 &&
          rgba[3] > 0 &&
          isNearWhite(rgba)
        ) {
          whiteTransitionPixel = pixel;
          break;
        }
      }
      expect(opaqueExteriorPixel, `${path} has opaque exterior matte`).toBe(-1);
      expect(whiteTransitionPixel, `${path} has a white transition halo`).toBe(-1);

      for (const [x, y] of [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ]) {
        expect(rgbaAt(value, x, y)[3], `${path} corner ${x},${y}`).toBe(0);
      }

      for (let pixel = 0; pixel < value.width * value.height; pixel += 1) {
        const rgba = Array.from(value.data.subarray(pixel * 4, pixel * 4 + 4));
        if (rgba[3] > 0 && rgba[3] < 255) {
          expect(isNearWhite(rgba), `${path} white halo at pixel ${pixel}`).toBe(false);
        }
      }

      expectProtectedCoreUnchanged(
        `${baselineRoot}/favicon/favicon-${size}.png`,
        path,
      );
    },
  );

  it.each([
    ["apple-touch-icon", 180],
    ["app-icon", 192],
    ["app-icon", 256],
    ["app-icon", 512],
    ["app-icon", 1024],
  ] as const)("exports %s-%spx with full-bleed blue corners", (name, size) => {
    const fileName = `${name}-${size}.png`;
    const path = `ui/designs/brand/mumeok/exports/icons/${fileName}`;
    const value = image(path);
    expect({ height: value.height, width: value.width }).toEqual({
      height: size,
      width: size,
    });

    const baseline = image(`${baselineRoot}/icons/${fileName}`);
    const exterior = dilateMask(
      exteriorMatteMask(baseline),
      size,
      size,
      2,
    );
    let invalidExteriorPixel = -1;
    for (let pixel = 0; pixel < value.width * value.height; pixel += 1) {
      if (exterior[pixel] === 0) continue;
      const rgba = Array.from(value.data.subarray(pixel * 4, pixel * 4 + 4));
      if (rgba[3] !== 255 || isNearWhite(rgba) || rgba[2] <= rgba[0] + 24) {
        invalidExteriorPixel = pixel;
        break;
      }
    }
    expect(
      invalidExteriorPixel,
      `${path} has a transparent, white, or non-blue exterior pixel`,
    ).toBe(-1);

    for (const [x, y] of [
      [0, 0],
      [size - 1, 0],
      [0, size - 1],
      [size - 1, size - 1],
    ]) {
      const rgba = rgbaAt(value, x, y);
      expect(rgba[3], `${path} corner alpha`).toBe(255);
      expect(isNearWhite(rgba), `${path} white corner`).toBe(false);
      expect(rgba[2], `${path} blue corner`).toBeGreaterThan(rgba[0] + 24);
    }

    expectProtectedCoreUnchanged(`${baselineRoot}/icons/${fileName}`, path);
  });

  it("keeps four transparent favicon frames in the canonical ICO", () => {
    for (const path of [
      "ui/designs/brand/mumeok/exports/favicon/favicon.ico",
      "app/favicon.ico",
    ]) {
      const frames = icoFrames(path);
      expect(frames.map((frame) => frame.size)).toEqual([
        "16x16",
        "32x32",
        "48x48",
        "64x64",
      ]);
      for (const [index, frame] of frames.entries()) {
        const size = [16, 32, 48, 64][index];
        const png = image(
          `ui/designs/brand/mumeok/exports/favicon/favicon-${size}.png`,
        );
        expect(
          { height: frame.image.height, width: frame.image.width },
          `${path} ${frame.size} dimensions`,
        ).toEqual({ height: png.height, width: png.width });
        expect(
          Buffer.from(frame.image.data).equals(Buffer.from(png.data)),
          `${path} ${frame.size} pixels`,
        ).toBe(true);
      }
    }
  });

  it("separates transparent document icons from full-bleed install icons", async () => {
    const layout = read("app/layout.tsx").toString("utf8");
    expect(layout).toContain('url: "/brand/favicon-32.png"');
    expect(layout).not.toContain('url: "/brand/mumeok-symbol-192.png"');
    expect(layout).not.toContain('url: "/brand/app-icon-192.png"');

    const { default: manifest } = await import("@/app/manifest");
    expect(manifest().icons).toEqual([
      {
        sizes: "192x192",
        src: "/brand/app-icon-192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/brand/app-icon-512.png",
        type: "image/png",
      },
    ]);
  });

  it("keeps runtime copies aligned with their dedicated design exports", () => {
    for (const [runtime, design] of [
      ["public/brand/app-icon-192.png", "ui/designs/brand/mumeok/exports/icons/app-icon-192.png"],
      ["public/brand/app-icon-512.png", "ui/designs/brand/mumeok/exports/icons/app-icon-512.png"],
      ["public/brand/apple-touch-icon-180.png", "ui/designs/brand/mumeok/exports/icons/apple-touch-icon-180.png"],
      ["public/brand/favicon-32.png", "ui/designs/brand/mumeok/exports/favicon/favicon-32.png"],
      ["app/favicon.ico", "ui/designs/brand/mumeok/exports/favicon/favicon.ico"],
    ]) {
      expect(existsSync(resolve(root, runtime)), runtime).toBe(true);
      expect(existsSync(resolve(root, design)), design).toBe(true);
      expect(sha256(runtime), runtime).toBe(sha256(design));
    }
  });
});
