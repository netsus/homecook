#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SDK_MUTATION_PATTERN =
  /(?:\.storage|\[\s*["']storage["']\s*\])[\s\S]{0,80}(?:\.from|\[\s*["']from["']\s*\])\s*\([^)]{0,160}\)[\s\S]{0,80}(?:\.(?:copy|delete|move|remove|update|upload|upsert|write)|\[\s*["'](?:copy|delete|move|remove|update|upload|upsert|write)["']\s*\])\s*\(/giu;
const STORAGE_REST_MUTATION_PATTERN =
  /fetch\s*\([\s\S]{0,700}\bmethod\s*:\s*["'](?:DELETE|PATCH|POST|PUT)["'][\s\S]{0,200}\)/giu;

function findPatternMatches(source, kind, pattern) {
  return [...source.matchAll(pattern)].map((match) => ({
    index: match.index ?? 0,
    kind,
    snippet: match[0].slice(0, 240),
  }));
}

export function findBrowserBundleStorageMutations(source) {
  const executableSource = source.replace(/\/\*\*[\s\S]*?\*\//gu, "");
  return [
    ...findPatternMatches(
      executableSource,
      "supabase-storage-sdk",
      SDK_MUTATION_PATTERN,
    ),
    ...(executableSource.includes("/storage/v1/object/")
      ? findPatternMatches(
          executableSource,
          "supabase-storage-rest",
          STORAGE_REST_MUTATION_PATTERN,
        )
      : []),
  ].sort((left, right) => left.index - right.index);
}

function listBundleFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (/\.(?:js|mjs)$/u.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };

  if (fs.existsSync(root)) {
    walk(root);
  }
  return files.sort();
}

export function inspectBrowserBundle(root) {
  return listBundleFiles(root).flatMap((file) => (
    findBrowserBundleStorageMutations(fs.readFileSync(file, "utf8")).map(
      (entry) => ({
        ...entry,
        file: path.relative(root, file).split(path.sep).join("/"),
      }),
    )
  ));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bundleRoot = path.resolve(process.argv[2] ?? ".next/static");
  if (!fs.existsSync(bundleRoot)) {
    process.stderr.write(`Browser bundle directory does not exist: ${bundleRoot}\n`);
    process.exitCode = 1;
  } else {
    const violations = inspectBrowserBundle(bundleRoot);
    if (violations.length > 0) {
      process.stderr.write(
        `Browser direct Storage mutations found:\n${JSON.stringify(violations, null, 2)}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Browser direct Storage mutation count: 0\n");
    }
  }
}
