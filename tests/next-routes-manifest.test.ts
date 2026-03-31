import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeNextRoutesManifest } from "../scripts/lib/next-routes-manifest.mjs";

const tempDirs: string[] = [];

async function createTempProject() {
  const projectDir = await mkdtemp(join(tmpdir(), "homecook-routes-manifest-"));
  tempDirs.push(projectDir);
  await mkdir(join(projectDir, ".next"));

  return projectDir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("normalizeNextRoutesManifest", () => {
  it("is a no-op when the build manifest is missing", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "homecook-routes-manifest-"));
    tempDirs.push(projectDir);

    expect(normalizeNextRoutesManifest(projectDir)).toMatchObject({
      updated: false,
    });
  });

  it("adds missing array fields expected by next start", async () => {
    const projectDir = await createTempProject();
    const manifestPath = join(projectDir, ".next", "routes-manifest.json");

    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 3,
        rewrites: {
          beforeFiles: [],
        },
      }),
    );

    const result = normalizeNextRoutesManifest(projectDir);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    expect(result).toMatchObject({
      manifestPath,
      updated: true,
    });
    expect(manifest).toMatchObject({
      dataRoutes: [],
      dynamicRoutes: [],
      staticRoutes: [],
      redirects: [],
      headers: [],
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
    });
  });
});
