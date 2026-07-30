import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findBrowserBundleStorageMutations,
  inspectBrowserBundle,
} from "../scripts/verify-hybrid-browser-bundle.mjs";

describe("hybrid built browser bundle canary", () => {
  it.each([
    "client.storage.from('recipe-images').remove(['unsafe.png'])",
    "client['storage']['from']('recipe-images')['upload']('unsafe.png', file)",
    "fetch('/storage/v1/object/recipe-images/unsafe.png',{method:'DELETE'})",
    "const base='/storage/v1/object/';fetch(base+'unsafe.png',{method:'DELETE'})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',method='DELETE';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',opts={method:'DELETE'};fetch(storageUrl,opts)",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';method='DELETE';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';window.fetch(storageUrl,{method:'DELETE'})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',send=fetch;send(storageUrl,{method:'DELETE'})",
    "let e='GET';e='DELETE';const u='/storage/v1/object/recipe-images/unsafe.png';globalThis.fetch(u,{method:e})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',method=readMethod();fetch(storageUrl,{method})",
  ])("rejects direct Storage mutation syntax: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).not.toEqual([]);
  });

  it("rejects a direct mutation in an actual minified browser bundle file", () => {
    const bundleRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "homecook-hybrid-bundle-"),
    );
    try {
      fs.writeFileSync(
        path.join(bundleRoot, "app.min.js"),
        "let e='GET';e='DELETE';const u='/storage/v1/object/recipe-images/unsafe.png',s=fetch;s(u,{method:e});",
      );

      expect(inspectBrowserBundle(bundleRoot)).toEqual([
        expect.objectContaining({
          file: "app.min.js",
          kind: "supabase-storage-rest",
        }),
      ]);
    } finally {
      fs.rmSync(bundleRoot, { recursive: true, force: true });
    }
  });

  it.each([
    "fetch('/api/v1/recipes/images',{method:'POST'})",
    "fetch('/storage/v1/object/recipe-images/safe.png',{method:'GET'})",
    "const documentation = '/storage/v1/object/';",
    "const documentation='/storage/v1/object/';fetch('/api/v1/recipes/images',{method:'POST'})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='DELETE';method='GET';fetch(storageUrl,{method})",
    "/** example: client.storage.from('avatars').upload('avatar.png', file) */",
  ])("does not flag a non-mutation canary: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toEqual([]);
  });
});
