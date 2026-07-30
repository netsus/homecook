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
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';candidate.value;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}catch{}finally{audit()}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}finally{fetch(storageUrl,{method})}",
    "let m='GET';try{m='DELETE';x();m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';1n+1;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';`${candidate}`;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';({...candidate});method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';[...candidate];method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';for(const value of candidate){}method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';const {value}=candidate;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';const [value]=candidate;method='GET'}catch{}fetch(storageUrl,{method})",
    "let m='GET';try{m='DELETE';1n+1;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';`${x}`;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';({...x});m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';[...x];m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';for(const v of x){}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';const {v}=x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';const [v]=x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';unresolvedCandidate;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='GET';try{method='DELETE';tdzCandidate;let tdzCandidate=1;method='GET'}catch{}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';async function run(candidate){let method='GET';try{method='DELETE';await candidate;method='GET'}catch{}fetch(storageUrl,{method})}",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';function run(candidate){let method='GET';try{method='DELETE';class RecipeImage extends candidate{}method='GET'}catch{}fetch(storageUrl,{method})}",
    "let m='GET';try{m='DELETE';x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';x;let x=1;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let x=1,m='GET';try{m='DELETE';{x;let x=2}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';{typeof x;let x=1}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';try{m='DELETE';{C;class C{}}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "function f(k){let x=1,m='GET';try{m='DELETE';switch(k){case 0:let x=2;break;case 1:x}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
    "async function f(x){let m='GET';try{m='DELETE';await x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
    "function f(x){let m='GET';try{m='DELETE';class C extends x{}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';outer:do{continue outer}while(false);fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/unsafe.png';let method='DELETE';outer:do{try{continue outer}finally{audit()}}while(false);fetch(storageUrl,{method})",
    "let m='DELETE';o:do{continue o}while(false);fetch('/storage/v1/object/x',{method:m})",
    "let m='DELETE';o:do{try{continue o}finally{a()}}while(false);fetch('/storage/v1/object/x',{method:m})",
    "let m='GET';o:for(let i=0;i<1;i++){m='DELETE';continue o;m='GET'}fetch('/storage/v1/object/x',{method:m})",
    "function remove(objectPath){const base='/storage/v1/object/',url=escapeValue(new URL(`${base}${objectPath}`,location.origin)),send=escapeValue(fetch);let method=readMethod();const methodAlias=method,defaults={headers:{accept:'application/json'}},options=escapeValue({...defaults,method:methodAlias});return send(url,options)}",
    "const holder={send:fetch};holder.send('/storage/v1/object/x',{method:'DELETE'})",
    "const {send}={send:fetch};send('/storage/v1/object/x',{method:'DELETE'})",
    "(0,fetch)('/storage/v1/object/x',{method:'DELETE'})",
    "globalThis['fe'+'tch']('/storage/v1/object/x',{method:'DELETE'})",
    "globalThis['fe'+'tch']('/sto'+'rage/v1/object/x',{method:'DELETE'})",
    "const {fetch:send}=globalThis;send('/storage/v1/object/x',{method:'DELETE'})",
    "const holder={};holder.send=fetch;holder.send('/storage/v1/object/x',{method:'DELETE'})",
    "const holder=getHolder();holder['se'+'nd']=fetch;const {send}=holder;send('/storage/v1/object/x',{method:'DELETE'})",
    "const holder={['se'+'nd']:fetch};holder.send('/storage/v1/object/x',{method:'DELETE'})",
    "escapeValue({send:fetch}).send('/storage/v1/object/x',{method:'DELETE'})",
    "client.storage.from('recipe-images').upload('unsafe.png', file)",
    "client['sto'+'rage']['fr'+'om']('recipe-images')['up'+'load']('unsafe.png',file)",
    "const storage=client['storage'],bucket=storage['from']('recipe-images'),destroy=bucket['remove'];destroy(['unsafe.png'])",
    "const {remove}=client.storage.from('recipe-images');remove(['unsafe.png'])",
    "const {storage}=client,{from}=storage,bucket=from('recipe-images'),{remove}=bucket;remove(['unsafe.png'])",
    "let remove;const bucket=client.storage.from('recipe-images');({remove}=bucket);remove(['unsafe.png'])",
    "let remove;const bucket=client.storage.from('recipe-images');[remove]=[bucket.remove];remove(['unsafe.png'])",
    "const bucket=client.storage.from('recipe-images');[bucket.remove][0](['unsafe.png'])",
    "const bucket=client.storage.from('recipe-images'),methods=[bucket.remove],remove=methods[0];remove(['unsafe.png'])",
    "async function run(specifier){const module=await import(specifier);module.remove(['unsafe.png'])}",
    "async function run(specifier){const {upload}=await import(specifier);upload('unsafe.png',file)}",
    "async function run(specifier){const module=await import(specifier),update=module.update;update('unsafe.png',file)}",
    "import('./storage-module.js').then(module=>module.createSignedUploadUrl('unsafe.png'))",
    "async function run(){const module=await import('../lib/sdk'),key='remove',mutate=module[key];mutate(['unsafe.png'])}",
    "async function run(){const module=await import('../lib/sdk'),key='remove',{[key]:mutate}=module;mutate(['unsafe.png'])}",
    "import('../lib/sdk').then(module=>{const key='remove',mutate=module[key];mutate(['unsafe.png'])})",
    "function safe(){}const bucket=client.storage.from('bucket'),namespace={tools:{remove:safe}};namespace.tools.remove=bucket.remove;namespace.tools.remove(['unsafe.png'])",
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
        path.join(bundleRoot, "try-intermediate.min.js"),
        "let m='GET';try{m='DELETE';x();m='GET'}catch{}finally{a()}fetch('/storage/v1/object/x',{method:m});",
      );
      for (const [file, throwingEvaluation] of [
        ["try-binary.min.js", "1n+1"],
        ["try-template.min.js", "`${x}`"],
        ["try-object-spread.min.js", "({...x})"],
        ["try-array-spread.min.js", "[...x]"],
        ["try-for-of.min.js", "for(const v of x){}"],
        ["try-object-destructure.min.js", "const {v}=x"],
        ["try-array-destructure.min.js", "const [v]=x"],
      ]) {
        fs.writeFileSync(
          path.join(bundleRoot, file),
          `let m='GET';try{m='DELETE';${throwingEvaluation};m='GET'}catch{}fetch('/storage/v1/object/x',{method:m});`,
        );
      }
      for (const [file, source] of [
        [
          "try-unresolved.min.js",
          "let m='GET';try{m='DELETE';x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "try-tdz.min.js",
          "let m='GET';try{m='DELETE';x;let x=1;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "try-await.min.js",
          "async function f(x){let m='GET';try{m='DELETE';await x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
        ],
        [
          "try-class.min.js",
          "function f(x){let m='GET';try{m='DELETE';class C extends x{}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
        ],
        [
          "try-shadow-tdz.min.js",
          "let x=1,m='GET';try{m='DELETE';{x;let x=2}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "try-typeof-tdz.min.js",
          "let m='GET';try{m='DELETE';{typeof x;let x=1}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "try-class-tdz.min.js",
          "let m='GET';try{m='DELETE';{C;class C{}}m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "labeled-continue.min.js",
          "let m='DELETE';o:do{continue o}while(false);fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "labeled-finally.min.js",
          "let m='DELETE';o:do{try{continue o}finally{a()}}while(false);fetch('/storage/v1/object/x',{method:m})",
        ],
        [
          "alias-rest.min.js",
          "function f(p){const b='/storage/v1/object/',u=e(new URL(`${b}${p}`,location.origin)),s=e(fetch);let m=x();const a=m,d={headers:{}},o=e({...d,method:a});return s(u,o)}",
        ],
        [
          "fetch-object-alias.min.js",
          "const o={s:fetch};o.s('/storage/v1/object/x',{method:'DELETE'})",
        ],
        [
          "fetch-destructure.min.js",
          "const{s}={s:fetch};s('/storage/v1/object/x',{method:'DELETE'})",
        ],
        [
          "fetch-comma.min.js",
          "(0,fetch)('/storage/v1/object/x',{method:'DELETE'})",
        ],
        [
          "fetch-computed.min.js",
          "globalThis['fe'+'tch']('/storage/v1/object/x',{method:'DELETE'})",
        ],
        [
          "sdk-alias.min.js",
          "const s=c.storage,b=s.from('x'),r=b.remove;r(['x'])",
        ],
      ]) {
        fs.writeFileSync(path.join(bundleRoot, file), source);
      }
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
      fs.writeFileSync(
        path.join(bundleRoot, "unknown-callee.min.js"),
        "const u='/storage/v1/object/x';mystery(u,{method:'DELETE'})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "unknown-method.min.js"),
        "const u='/storage/v1/object/x',o={method:readMethod()};mystery(u,o)",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "sdk-assignment.min.js"),
        "let r;const b=c.storage.from('x');({remove:r}=b);r(['x'])",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "sdk-array.min.js"),
        "const b=c.storage.from('x'),a=[b.remove];a[0](['x'])",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "local-helper-safe.min.js"),
        "function h(){}h('/storage/v1/object/x',{method:'DELETE'})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "unknown-get-safe.min.js"),
        "mystery('/storage/v1/object/x',{method:'GET'})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "unknown-head-safe.min.js"),
        "mystery('/storage/v1/object/x',{method:'HEAD'})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-namespace.min.js"),
        "async function f(x){const m=await import(x);m.remove(['x'])}",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-destructure.min.js"),
        "async function f(x){const{upload:u}=await import(x);u('x',b)}",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-then.min.js"),
        "import(x).then(m=>m.update('x',b))",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-literal.min.js"),
        "import('./x.js').then(m=>m.createSignedUploadUrl('x'))",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-computed.min.js"),
        "async function f(){const m=await import('./x'),k='remove',r=m[k];r(['x'])}",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-computed-destructure.min.js"),
        "async function f(){const m=await import('./x'),k='remove',{[k]:r}=m;r(['x'])}",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "dynamic-computed-then.min.js"),
        "import('./x').then(m=>{const k='remove',r=m[k];r(['x'])})",
      );
      fs.writeFileSync(
        path.join(bundleRoot, "sdk-nested-assignment.min.js"),
        "function s(){}const b=c.storage.from('x'),n={tools:{remove:s}};n.tools.remove=b.remove;n.tools.remove(['x'])",
      );

      expect(inspectBrowserBundle(bundleRoot)).toEqual(
        expect.arrayContaining(
          [
            "app.min.js",
            "alias-rest.min.js",
            "do-positive.min.js",
            "fetch-comma.min.js",
            "fetch-computed.min.js",
            "fetch-destructure.min.js",
            "fetch-object-alias.min.js",
            "labeled-continue.min.js",
            "labeled-finally.min.js",
            "short.min.js",
            "unknown-callee.min.js",
            "unknown-method.min.js",
            "switch.min.js",
            "try-array-destructure.min.js",
            "try-array-spread.min.js",
            "try-binary.min.js",
            "try-class.min.js",
            "try-class-tdz.min.js",
            "try-for-of.min.js",
            "try-intermediate.min.js",
            "try-object-destructure.min.js",
            "try-object-spread.min.js",
            "try-template.min.js",
            "try-shadow-tdz.min.js",
            "try-tdz.min.js",
            "try-typeof-tdz.min.js",
            "try-unresolved.min.js",
            "try-await.min.js",
            "try.min.js",
          ].map((file) => expect.objectContaining({
            file,
            kind: "supabase-storage-rest",
          })).concat([
            expect.objectContaining({
              file: "sdk-alias.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "sdk-assignment.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "sdk-array.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-destructure.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-computed-destructure.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-computed-then.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-computed.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-literal.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-namespace.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "dynamic-then.min.js",
              kind: "supabase-storage-sdk",
            }),
            expect.objectContaining({
              file: "sdk-nested-assignment.min.js",
              kind: "supabase-storage-sdk",
            }),
          ]),
        ),
      );
      expect(inspectBrowserBundle(bundleRoot)).toHaveLength(40);
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
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}catch{}finally{method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}finally{method='GET'}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';try{method='DELETE';mayThrow();method='GET'}finally{audit()}fetch(storageUrl,{method})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='DELETE';try{throw 0}finally{method='GET'}fetch(storageUrl,{method})",
    "let m='DELETE';try{throw 0}finally{m='GET'}fetch('/storage/v1/object/x',{method:m})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';function save(){let method='DELETE';try{return}finally{method='GET'}fetch(storageUrl,{method})}",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';while(flag){let method='DELETE';try{break}finally{method='GET'}fetch(storageUrl,{method})}",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';while(flag){let method='DELETE';try{continue}finally{method='GET'}fetch(storageUrl,{method})}",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='DELETE';outer:do{method='GET';switch(kind){case 'break':break outer;default:continue outer}method='DELETE'}while(false);fetch(storageUrl,{method})",
    "let m='DELETE';o:do{m='GET';switch(k){case 1:break o;default:continue o}m='DELETE'}while(false);fetch('/storage/v1/object/x',{method:m})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';const candidate={headers:{accept:'application/json'}};let method='DELETE';try{candidate;const options={headers:{accept:'application/json'}};method='GET'}catch{}fetch(storageUrl,{method})",
    "let x=1,m='DELETE';try{x;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "let m='DELETE';try{typeof unresolvedCandidate;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})",
    "function safeThis(){let m='DELETE';try{this;m='GET'}catch{}fetch('/storage/v1/object/x',{method:m})}",
    "let m='DELETE';try{hoistedFunction;m='GET'}catch{}function hoistedFunction(){}fetch('/storage/v1/object/x',{method:m})",
    "let m='DELETE';try{hoistedValue;m='GET'}catch{}var hoistedValue;fetch('/storage/v1/object/x',{method:m})",
    "const storageUrl='/storage/v1/object/recipe-images/safe.png';let method='GET';ready&&(method='HEAD');fetch(storageUrl,{method})",
    "/** example: client.storage.from('avatars').upload('avatar.png', file) */",
    "const documentation = \"client.storage.from('avatars').upload('avatar.png', file)\";",
    "// client.storage.from('avatars').remove(['avatar.png'])",
    "function helper(){return 'not fetch'}helper('/storage/v1/object/x',{method:'DELETE'})",
    "const helper=()=>null;helper('/storage/v1/object/x',{method:unknownMethod})",
    "const holder={send:function helper(){}};holder.send('/storage/v1/object/x',{method:'DELETE'})",
    "const holder={send:fetch};holder.send('/storage/v1/object/x',{method:'GET'})",
    "const {send}={send:fetch};send('/storage/v1/object/x',{method:'HEAD'})",
    "mystery('/storage/v1/object/x',{method:'GET'})",
    "mystery('/storage/v1/object/x',{method:'HEAD'})",
    "const bucket=client.storage.from('recipe-images'),methods=[function inspect(){}];methods[0](['safe.png'])",
    "const bundled={remove:function safeRemove(){}};bundled.remove(['safe.png'])",
    "const unrelated=getCollection();unrelated.remove('safe.png')",
    "function safe(){}const module={remove:safe},key='remove',mutate=module[key];mutate(['safe.png'])",
    "function safe(){}const module={remove:safe},key='remove',{[key]:mutate}=module;mutate(['safe.png'])",
    "function safe(){}const namespace={tools:{remove:safe}};namespace.tools.remove=safe;namespace.tools.remove(['safe.png'])",
  ])("does not flag a non-mutation canary: %s", (source) => {
    expect(findBrowserBundleStorageMutations(source)).toEqual([]);
  });
});
