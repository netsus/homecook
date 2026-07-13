import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path));
}

function source(path: string) {
  return read(path).toString("utf8");
}

function sha256(path: string) {
  return createHash("sha256").update(read(path)).digest("hex");
}

function pngSize(path: string) {
  const buffer = read(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

describe("service brand image assets", () => {
  it("locks the selected source and exact runtime copies", () => {
    expect(
      sha256(
        "ui/designs/brand/mumeok/exports/source/mumeok-symbol-selected-source-1254.png",
      ),
    ).toBe("7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4");

    expect(sha256("public/brand/mumeok-symbol-192.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/icons/app-icon-192.png"),
    );
    expect(sha256("public/brand/app-icon-512.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/icons/app-icon-512.png"),
    );
    expect(sha256("public/brand/apple-touch-icon-180.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/icons/apple-touch-icon-180.png"),
    );
    expect(sha256("public/brand/favicon-32.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/favicon/favicon-32.png"),
    );
    expect(sha256("public/brand/og-image-1200x630.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/social/og-image-1200x630.png"),
    );
    expect(sha256("public/brand/twitter-image-1200x630.png")).toBe(
      sha256("ui/designs/brand/mumeok/exports/social/twitter-image-1200x630.png"),
    );
    expect(sha256("app/favicon.ico")).toBe(
      sha256("ui/designs/brand/mumeok/exports/favicon/favicon.ico"),
    );
  });

  it("keeps runtime image dimensions aligned with metadata contracts", () => {
    expect(pngSize("public/brand/mumeok-symbol-192.png")).toEqual({
      height: 192,
      width: 192,
    });
    expect(pngSize("public/brand/app-icon-512.png")).toEqual({
      height: 512,
      width: 512,
    });
    expect(pngSize("public/brand/apple-touch-icon-180.png")).toEqual({
      height: 180,
      width: 180,
    });
    expect(pngSize("public/brand/favicon-32.png")).toEqual({
      height: 32,
      width: 32,
    });
    expect(pngSize("public/brand/og-image-1200x630.png")).toEqual({
      height: 630,
      width: 1200,
    });
    expect(pngSize("public/brand/twitter-image-1200x630.png")).toEqual({
      height: 630,
      width: 1200,
    });
  });

  it("wires canonical icon and social paths without the old image generator", () => {
    const layout = source("app/layout.tsx");
    const manifest = source("app/manifest.ts");
    const social = source("lib/seo/default-social-image.tsx");
    const home = source("components/home/home-screen.tsx");
    const brandSymbol = source("components/brand/mumeok-brand-symbol.tsx");

    expect(layout).toContain("url: defaultOpenGraphImagePath");
    expect(layout).toContain("images: [defaultTwitterImagePath]");
    expect(layout).toContain('url: "/brand/apple-touch-icon-180.png"');
    expect(manifest).toContain('src: "/brand/mumeok-symbol-192.png"');
    expect(manifest).toContain('src: "/brand/app-icon-512.png"');
    expect(social).not.toContain("ImageResponse");
    expect(social).not.toContain("linear-gradient");
    expect(social).toContain(
      'defaultOpenGraphImagePath = "/brand/og-image-1200x630.png"',
    );
    expect(social).toContain(
      'defaultTwitterImagePath = "/brand/twitter-image-1200x630.png"',
    );
    expect(brandSymbol).toContain('src="/brand/mumeok-symbol-192.png"');
    expect(brandSymbol).toContain('"mumeok-brand-symbol"');
    expect(home).toContain("<MumeokBrandSymbol size={32} />");
  });
});
