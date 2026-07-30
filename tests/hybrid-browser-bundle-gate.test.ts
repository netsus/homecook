import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findBrowserBundleStorageMutations,
  inspectBrowserBundle,
} from "../scripts/verify-hybrid-browser-bundle.mjs";

describe("hybrid built browser bundle auxiliary canary", () => {
  it("retains the former alias matrix as non-authoritative review evidence", () => {
    const corpus = JSON.parse(fs.readFileSync(
      "tests/fixtures/hybrid-static-bypasses/legacy-browser-alias-canaries.json",
      "utf8",
    )) as {
      authority: boolean;
      negative_cases: string[];
      positive_cases: string[];
    };

    expect(corpus.authority).toBe(false);
    expect(corpus.positive_cases).toHaveLength(97);
    expect(corpus.negative_cases).toHaveLength(51);
    expect(
      [...corpus.positive_cases, ...corpus.negative_cases]
        .every((source) => source.length > 0),
    ).toBe(true);
  });

  it.each([
    "client.storage.from('recipe-images').remove(['unsafe.png'])",
    "client['storage']['from']('recipe-images')['upload']('unsafe.png', file)",
    "fetch('/storage/v1/object/recipe-images/unsafe.png',{method:'DELETE'})",
    "globalThis.fetch('/storage/v1/object/recipe-images/unsafe.png',{method:'POST'})",
  ])("rejects a direct executable Storage mutation: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toHaveLength(1);
  });

  it.each([
    "fetch('/api/v1/recipes/images',{method:'POST'})",
    "fetch('/storage/v1/object/recipe-images/safe.png',{method:'GET'})",
    "const documentation=\"client.storage.from('avatars').upload('avatar.png', file)\"",
    "// fetch('/storage/v1/object/x',{method:'DELETE'})",
    "unrelated.remove('safe.png')",
  ])("does not flag a non-mutation canary: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toEqual([]);
  });

  it("scans every production JS/MJS file without a token prefilter", () => {
    const bundleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "homecook-hybrid-bundle-"),
    );
    try {
      fs.writeFileSync(
        path.join(bundleRoot, "direct.min.js"),
        "globalThis.fetch('/storage/v1/object/x',{method:'PUT'})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "direct.mjs"),
        "client.storage.from('x').remove(['x'])",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "safe.js"),
        "fetch('/api/v1/recipes/images',{method:'POST'})",
      );

      expect(inspectBrowserBundle(bundleRoot)).toEqual([
        expect.objectContaining({
          file: "direct.min.js",
          kind: "supabase-storage-rest",
        }),
        expect.objectContaining({
          file: "direct.mjs",
          kind: "supabase-storage-sdk",
        }),
      ]);
    } finally {
      fs.rmSync(bundleRoot, { recursive: true, force: true });
    }
  });
});
