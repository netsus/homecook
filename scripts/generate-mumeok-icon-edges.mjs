#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const root = process.cwd();
const baselineRoot = path.join(
  root,
  "tests/fixtures/brand/mumeok-icon-edge-baseline",
);
const exportRoot = path.join(root, "ui/designs/brand/mumeok/exports");
const evidenceRoot = path.join(
  root,
  "ui/designs/evidence/service-brand-icon-edge-treatment",
);

const faviconSizes = [16, 32, 48, 64];
const installIcons = [
  { fileName: "apple-touch-icon-180.png", size: 180 },
  { fileName: "app-icon-192.png", size: 192 },
  { fileName: "app-icon-256.png", size: 256 },
  { fileName: "app-icon-512.png", size: 512 },
  { fileName: "app-icon-1024.png", size: 1024 },
];
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

function assertBaselineFixtures() {
  for (const [relativePath, expectedHash] of baselineFixtureHashes) {
    const filePath = path.join(baselineRoot, relativePath);
    const actualHash = createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(
        `Baseline fixture changed: ${relativePath} (expected ${expectedHash}, received ${actualHash})`,
      );
    }
  }
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Expected a PNG file");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

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
      if (chunk[12] !== 0) throw new Error("Interlaced PNG is not supported");
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: depth=${bitDepth} type=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const decoded = new Uint8Array(stride * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const target = y * stride + x;
      const raw = inflated[sourceOffset + x];
      const left = x >= channels ? decoded[target - channels] : 0;
      const up = y > 0 ? decoded[target - stride] : 0;
      const upLeft = y > 0 && x >= channels ? decoded[target - stride - channels] : 0;
      let value = raw;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paethPredictor(left, up, upLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
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

function paethPredictor(a, b, c) {
  const prediction = a + b - c;
  const distanceA = Math.abs(prediction - a);
  const distanceB = Math.abs(prediction - b);
  const distanceC = Math.abs(prediction - c);
  if (distanceA <= distanceB && distanceA <= distanceC) return a;
  if (distanceB <= distanceC) return b;
  return c;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(image, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const stride = image.width * channels;
  const raw = Buffer.alloc((stride + 1) * image.height);

  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4;
      const target = rowOffset + 1 + x * channels;
      raw[target] = image.data[source];
      raw[target + 1] = image.data[source + 1];
      raw[target + 2] = image.data[source + 2];
      if (alpha) raw[target + 3] = image.data[source + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function isNearWhite(data, pixel) {
  const offset = pixel * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return (
    red >= 220 &&
    green >= 220 &&
    blue >= 220 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) <= 24
  );
}

function exteriorMatteMask(image) {
  const size = image.width * image.height;
  const mask = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  const enqueue = (pixel) => {
    if (mask[pixel] === 1 || !isNearWhite(image.data, pixel)) return;
    mask[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x);
    enqueue((image.height - 1) * image.width + x);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(y * image.width);
    enqueue(y * image.width + image.width - 1);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < image.width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - image.width);
    if (y + 1 < image.height) enqueue(pixel + image.width);
  }

  return mask;
}

function dilate(mask, width, height, iterations) {
  let result = mask;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = result.slice();
    for (let pixel = 0; pixel < result.length; pixel += 1) {
      if (result[pixel] === 0) continue;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x > 0) next[pixel - 1] = 1;
      if (x + 1 < width) next[pixel + 1] = 1;
      if (y > 0) next[pixel - width] = 1;
      if (y + 1 < height) next[pixel + width] = 1;
    }
    result = next;
  }
  return result;
}

function findCorePixel(mask, width, height, x, y) {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(centerX - x), Math.abs(centerY - y))),
  );

  for (let step = 1; step <= steps; step += 1) {
    const nextX = Math.round(x + ((centerX - x) * step) / steps);
    const nextY = Math.round(y + ((centerY - y) * step) / steps);
    const pixel = nextY * width + nextX;
    if (mask[pixel] === 0) return pixel;
  }

  throw new Error(`Unable to find protected core from ${x},${y}`);
}

function makeTransparentFavicon(baseline) {
  const image = { ...baseline, data: baseline.data.slice() };
  const exterior = exteriorMatteMask(baseline);
  const allowed = dilate(exterior, baseline.width, baseline.height, 2);

  for (let pixel = 0; pixel < allowed.length; pixel += 1) {
    if (allowed[pixel] === 0) continue;
    const x = pixel % baseline.width;
    const y = Math.floor(pixel / baseline.width);
    const corePixel = findCorePixel(allowed, baseline.width, baseline.height, x, y);
    const source = pixel * 4;
    const core = corePixel * 4;

    image.data[source] = baseline.data[core];
    image.data[source + 1] = baseline.data[core + 1];
    image.data[source + 2] = baseline.data[core + 2];

    if (exterior[pixel] === 1) {
      image.data[source + 3] = 0;
      continue;
    }

    const alphaSamples = [];
    for (let channel = 0; channel < 3; channel += 1) {
      const foreground = baseline.data[core + channel];
      if (foreground >= 250) continue;
      alphaSamples.push(
        Math.max(
          0,
          Math.min(1, (255 - baseline.data[source + channel]) / (255 - foreground)),
        ),
      );
    }
    const alpha =
      alphaSamples.length === 0
        ? 1
        : alphaSamples.reduce((sum, value) => sum + value, 0) / alphaSamples.length;
    image.data[source + 3] = alpha <= 0.02 ? 0 : alpha >= 0.98 ? 255 : Math.round(alpha * 255);
  }

  return image;
}

function makeFullBleed(baseline) {
  const image = { ...baseline, data: baseline.data.slice() };
  const allowed = dilate(
    exteriorMatteMask(baseline),
    baseline.width,
    baseline.height,
    2,
  );

  for (let pixel = 0; pixel < allowed.length; pixel += 1) {
    if (allowed[pixel] === 0) continue;
    const x = pixel % baseline.width;
    const y = Math.floor(pixel / baseline.width);
    const corePixel = findCorePixel(allowed, baseline.width, baseline.height, x, y);
    const target = pixel * 4;
    const source = corePixel * 4;
    image.data[target] = baseline.data[source];
    image.data[target + 1] = baseline.data[source + 1];
    image.data[target + 2] = baseline.data[source + 2];
    image.data[target + 3] = 255;
  }

  return image;
}

function encodeIco(pngFrames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngFrames.length, 4);
  const entries = Buffer.alloc(pngFrames.length * 16);
  let imageOffset = 6 + entries.length;

  pngFrames.forEach(({ png, size }, index) => {
    const offset = index * 16;
    entries[offset] = size === 256 ? 0 : size;
    entries[offset + 1] = size === 256 ? 0 : size;
    entries[offset + 2] = 0;
    entries[offset + 3] = 0;
    entries.writeUInt16LE(1, offset + 4);
    entries.writeUInt16LE(32, offset + 6);
    entries.writeUInt32LE(png.length, offset + 8);
    entries.writeUInt32LE(imageOffset, offset + 12);
    imageOffset += png.length;
  });

  return Buffer.concat([header, entries, ...pngFrames.map((frame) => frame.png)]);
}

function canvas(width, height, color) {
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data.set(color, pixel * 4);
  }
  return { data, height, width };
}

function blitScaled(target, source, targetX, targetY, targetWidth, targetHeight) {
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(
      source.height - 1,
      Math.floor((y * source.height) / targetHeight),
    );
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(
        source.width - 1,
        Math.floor((x * source.width) / targetWidth),
      );
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const targetOffset = ((targetY + y) * target.width + targetX + x) * 4;
      const alpha = source.data[sourceOffset + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        target.data[targetOffset + channel] = Math.round(
          source.data[sourceOffset + channel] * alpha +
            target.data[targetOffset + channel] * (1 - alpha),
        );
      }
      target.data[targetOffset + 3] = 255;
    }
  }
}

function writeDarkTabEvidence(fileName, icon) {
  const target = canvas(480, 160, [30, 41, 59, 255]);
  blitScaled(target, icon, 24, 64, 32, 32);
  blitScaled(target, icon, 96, 24, 112, 112);
  writeFileSync(path.join(evidenceRoot, fileName), encodePng(target));
}

assertBaselineFixtures();

mkdirSync(path.join(exportRoot, "favicon"), { recursive: true });
mkdirSync(path.join(exportRoot, "icons"), { recursive: true });
mkdirSync(path.join(root, "public/brand"), { recursive: true });
mkdirSync(evidenceRoot, { recursive: true });

const faviconFrames = [];
for (const size of faviconSizes) {
  const baseline = decodePng(
    readFileSync(path.join(baselineRoot, "favicon", `favicon-${size}.png`)),
  );
  const edited = makeTransparentFavicon(baseline);
  const png = encodePng(edited);
  writeFileSync(path.join(exportRoot, "favicon", `favicon-${size}.png`), png);
  faviconFrames.push({ png, size });
}

const ico = encodeIco(faviconFrames);
writeFileSync(path.join(exportRoot, "favicon/favicon.ico"), ico);
writeFileSync(path.join(root, "app/favicon.ico"), ico);
copyFileSync(
  path.join(exportRoot, "favicon/favicon-32.png"),
  path.join(root, "public/brand/favicon-32.png"),
);

const editedInstallIcons = [];
for (const icon of installIcons) {
  const baselinePath = path.join(baselineRoot, "icons", icon.fileName);
  const edited = makeFullBleed(decodePng(readFileSync(baselinePath)));
  writeFileSync(
    path.join(exportRoot, "icons", icon.fileName),
    encodePng(edited, { alpha: false }),
  );
  editedInstallIcons.push({ ...icon, image: edited });
}

copyFileSync(
  path.join(baselineRoot, "icons/app-icon-192.png"),
  path.join(exportRoot, "icons/header-symbol-192.png"),
);
copyFileSync(
  path.join(exportRoot, "icons/app-icon-192.png"),
  path.join(root, "public/brand/app-icon-192.png"),
);
copyFileSync(
  path.join(exportRoot, "icons/app-icon-512.png"),
  path.join(root, "public/brand/app-icon-512.png"),
);
copyFileSync(
  path.join(exportRoot, "icons/apple-touch-icon-180.png"),
  path.join(root, "public/brand/apple-touch-icon-180.png"),
);

const beforeFavicon = decodePng(
  readFileSync(path.join(baselineRoot, "favicon/favicon-32.png")),
);
const afterFavicon = decodePng(
  readFileSync(path.join(exportRoot, "favicon/favicon-32.png")),
);
writeDarkTabEvidence("favicon-dark-tab-before.png", beforeFavicon);
writeDarkTabEvidence("favicon-dark-tab-after.png", afterFavicon);

const contactSheet = canvas(1000, 220, [30, 41, 59, 255]);
editedInstallIcons.forEach((icon, index) => {
  blitScaled(contactSheet, icon.image, 20 + index * 196, 30, 160, 160);
});
writeFileSync(
  path.join(evidenceRoot, "icon-contact-sheet.png"),
  encodePng(contactSheet),
);

process.stdout.write(
  `Generated ${faviconFrames.length} favicon PNGs, one ICO, ${editedInstallIcons.length} install icons, runtime copies, and visual evidence.\n`,
);
