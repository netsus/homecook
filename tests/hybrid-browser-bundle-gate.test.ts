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
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';if(flag){method='DELETE'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';if(flag)method='GET';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';if(flag){method='DELETE'}else{method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';while(flag)method='GET';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',method=flag?'DELETE':'GET';fetch(storageUrl,{method})",
    "const base='/storage/v1/object/',objectPath='recipe-images/unsafe.png',storageUrl=`${base}${objectPath}`;fetch(storageUrl,{method:'DELETE'})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';switch(kind){case 'delete':method='DELETE';break;default:method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';switch(kind){default:method='GET';break;case 'delete':method='DELETE';break}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png',send=fetch,options={method:'GET'};switch(kind){case 'delete':options.method='DELETE';case 'end':break;default:options.method='GET'}send(storageUrl,options)",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';switch(kind){case 'safe':method='GET';break}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';switch(kind){case 'delete':method='DELETE';if(flag)break;method='GET';break;default:method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE'}catch(error){method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE'}catch{method='GET'}finally{ready&&(method='GET')}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';ready&&(method='GET');fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';ready||(method='GET');fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';ready??(method='GET');fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';do{method='GET';ready&&(method='DELETE')}while(flag);fetch(storageUrl,{method})",
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
        "let m='DELETE';if(f)m='GET';const b='/storage/v1/object/',p='recipe-images/unsafe.png',u=`${b}${p}`,s=fetch;s(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "switch.min.js"),
        "let m='GET';switch(k){case 1:m='DELETE';break;default:m='GET'}const u='/storage/v1/object/recipe-images/unsafe.png',s=fetch;s(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "try.min.js"),
        "let m='GET';try{m='DELETE'}catch(e){m='GET'}const u='/storage/v1/object/recipe-images/unsafe.png';window.fetch(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "short.min.js"),
        "let m='DELETE';r&&(m='GET');const u='/storage/v1/object/recipe-images/unsafe.png';globalThis.fetch(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "do-positive.min.js"),
        "let m='GET';do{m='GET';r&&(m='DELETE')}while(f);const u='/storage/v1/object/recipe-images/unsafe.png';fetch(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "safe.min.js"),
        "let m='DELETE';m='GET';const b='/storage/v1/object/',p='recipe-images/safe.png',u=`${b}${p}`;globalThis.fetch(u,{method:m});",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "do-safe.min.js"),
        "let m='DELETE';do{m='GET'}while(false);const u='/storage/v1/object/recipe-images/safe.png';fetch(u,{method:m});",
      );

      expect(inspectBrowserBundle(bundleRoot)).toEqual(
        expect.arrayContaining(
          [
            "app.min.js",
            "do-positive.min.js",
            "short.min.js",
            "switch.min.js",
            "try.min.js",
          ].map((file) => expect.objectContaining({
            file,
            kind: "supabase-storage-rest",
          })),
        ),
      );
      expect(inspectBrowserBundle(bundleRoot)).toHaveLength(5);
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
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';if(flag){method='GET'}else{method='HEAD'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png',method=flag?'GET':'HEAD';fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';while(flag)method='HEAD';fetch(storageUrl,{method})",
    "const base='/api/v1/',path='recipes/images',url=`${base}${path}`;fetch(url,{method:'POST'})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='DELETE';do{method='GET'}while(false);fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';switch(kind){case 'head':method='HEAD';break;default:method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';try{method='GET'}catch{method='HEAD'}finally{method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='DELETE';try{method='DELETE'}catch{method='POST'}finally{method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';ready&&(method='HEAD');fetch(storageUrl,{method})",
    "/** example: client.storage.from('avatars').upload('avatar.png', file) */",
  ])("does not flag a non-mutation canary: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toEqual([]);
  });
});
