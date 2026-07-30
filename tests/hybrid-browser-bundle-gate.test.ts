import { describe, expect, it } from "vitest";

import {
  findBrowserBundleStorageMutations,
} from "../scripts/verify-hybrid-browser-bundle.mjs";

describe("hybrid built browser bundle canary", () => {
  it.each([
    "client.storage.from('recipe-images').remove(['unsafe.png'])",
    "client['storage']['from']('recipe-images')['upload']('unsafe.png', file)",
    "fetch('/storage/v1/object/recipe-images/unsafe.png',{method:'DELETE'})",
    "const base='/storage/v1/object/';fetch(base+'unsafe.png',{method:'DELETE'})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',method='DELETE';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',opts={method:'DELETE'};fetch(storageUrl,opts)",
  ])("rejects direct Storage mutation syntax: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).not.toEqual([]);
  });

  it.each([
    "fetch('/api/v1/recipes/images',{method:'POST'})",
    "fetch('/storage/v1/object/recipe-images/safe.png',{method:'GET'})",
    "const documentation = '/storage/v1/object/';",
    "const documentation='/storage/v1/object/';fetch('/api/v1/recipes/images',{method:'POST'})",
    "/** example: client.storage.from('avatars').upload('avatar.png', file) */",
  ])("does not flag a non-mutation canary: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toEqual([]);
  });
});
