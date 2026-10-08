import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { I031_EXACT_IDENTITY } from "@/lib/server/youtube-i031-runtime";
import { YOUTUBE_ASYNC_POLICY } from "@/lib/server/youtube-async-extraction";
import { YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES } from "../scripts/lib/youtube-extraction-worker-artifact.mjs";

const bundleRoot = path.join(process.cwd(), "lib/server/youtube-i031-runtime/bundle");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("v63 source-anchored runtime integration", () => {
  it("activates Luna low with the exact source-anchored identity and bounded options", async () => {
    const worker = await import(/* @vite-ignore */ `${pathToFileURL(path.join(bundleRoot, "worker.mjs")).href}?v63-test=1`);
    expect(worker.ACTIVE_ANALYSIS_MODE).toBe("source-anchored");
    const options = worker.createExtractionClientOptions(() => undefined, worker.ACTIVE_ANALYSIS_MODE, { ocrStrategy: "auto" });
    expect(options).toMatchObject({
      model: "gpt-5.6-luna",
      selectorModel: "gpt-5.6-sol",
      codexEffort: "low",
      selectorEffort: "low",
      keyframeTotalLimit: 8,
      keyframesPerRecipe: 8,
      screenOcrMode: "auto",
      ocrStrategy: "auto",
    });
    expect(worker.createExtractionIdentity(options)).toEqual({ ...I031_EXACT_IDENTITY, codexCliVersion: "0.154.0-alpha.6.2" });
    expect(YOUTUBE_ASYNC_POLICY.pipelineIdentity).toBe("1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935");
    expect(YOUTUBE_ASYNC_POLICY.policyVersion).toBe(3);
  });

  it("seals every declared runtime byte and keeps the global owner cache disabled", async () => {
    const manifest = JSON.parse(await readFile(path.join(bundleRoot, "manifest.json"), "utf8")) as {
      schemaVersion: number;
      files: Record<string, string>;
    };
    expect(manifest.schemaVersion).toBe(1);
    for (const [relativePath, digest] of Object.entries(manifest.files)) {
      expect(sha256(await readFile(path.join(bundleRoot, relativePath)))).toBe(digest);
    }
    for (const relativePath of YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES) {
      expect(manifest.files).toHaveProperty(relativePath);
    }
    expect(Object.keys(manifest.files).sort()).toEqual([
      ...YOUTUBE_EXTRACTION_RUNTIME_BUNDLE_REQUIRED_FILES,
      "scripts/recipe-loop/prebuilt/darwin-arm64/macos-vision-ocr",
      "scripts/recipe-loop/prebuilt/darwin-arm64/manifest.json",
    ].sort());
    const workerSource = await readFile(path.join(bundleRoot, "worker.mjs"), "utf8");
    expect(workerSource).toContain("const ownerCacheEnabled = false;");
    expect(workerSource).not.toMatch(/const ownerCacheEnabled = ACTIVE_ANALYSIS_MODE !== null/u);
  });

  it("does not issue legacy result-cache reads or writes for source-anchored execution", async () => {
    const worker = await import(/* @vite-ignore */ `${pathToFileURL(path.join(bundleRoot, "worker.mjs")).href}?v63-test=cache`);
    const accessCache = vi.fn(async () => { throw new Error("cache RPC must not run"); });
    const runtimeIdentity = I031_EXACT_IDENTITY;
    const read = await worker.readRuntimeResultCaches({
      enabled: false,
      workerRpcClient: { accessCache },
      sourceHash: "a".repeat(64),
      visualRequestHash: "b".repeat(64),
      runtimeIdentity,
    });
    expect(read).toEqual({ llmCache: { cacheHit: false }, visualCache: { cacheHit: false } });
    await worker.writeRuntimeResultCaches({
      llmEnabled: false,
      visualEnabled: false,
      workerRpcClient: { accessCache },
      sourceHash: "a".repeat(64),
      visualRequestHash: "b".repeat(64),
      runtimeIdentity,
      output: {},
    });
    expect(accessCache).not.toHaveBeenCalled();
  });
});
