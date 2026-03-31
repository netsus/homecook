import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function normalizeRewrites(rewrites) {
  if (!rewrites || typeof rewrites !== "object" || Array.isArray(rewrites)) {
    return {
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      updated: true,
    };
  }

  let updated = false;
  const normalized = { ...rewrites };

  for (const key of ["beforeFiles", "afterFiles", "fallback"]) {
    if (!Array.isArray(normalized[key])) {
      normalized[key] = [];
      updated = true;
    }
  }

  return {
    rewrites: normalized,
    updated,
  };
}

export function normalizeNextRoutesManifest(projectDir = process.cwd()) {
  const manifestPath = join(projectDir, ".next", "routes-manifest.json");

  if (!existsSync(manifestPath)) {
    return {
      manifestPath,
      updated: false,
    };
  }

  const routesManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let updated = false;

  for (const key of ["dataRoutes", "dynamicRoutes", "staticRoutes"]) {
    if (!Array.isArray(routesManifest[key])) {
      routesManifest[key] = [];
      updated = true;
    }
  }

  for (const key of ["redirects", "headers"]) {
    if (!Array.isArray(routesManifest[key])) {
      routesManifest[key] = [];
      updated = true;
    }
  }

  const normalizedRewrites = normalizeRewrites(routesManifest.rewrites);
  routesManifest.rewrites = normalizedRewrites.rewrites;
  updated ||= normalizedRewrites.updated;

  if (updated) {
    writeFileSync(manifestPath, `${JSON.stringify(routesManifest)}\n`);
  }

  return {
    manifestPath,
    updated,
  };
}
