import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const AUTH_MARKER = /(?:serviceKey|apiKey|api_key|access_token|authorization)/i;

function decodePercentEscapes(value) {
  return value.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });
}

function textRepresentations(value) {
  const values = new Set([String(value)]);
  let decoded = String(value);
  for (let depth = 0; depth < 3; depth += 1) {
    const next = decodePercentEscapes(decoded);
    values.add(next);
    if (next === decoded) break;
    decoded = next;
  }
  return [...values];
}

export function expandSecretValues(secretValues = []) {
  const values = new Set();
  for (const secret of secretValues) {
    if (typeof secret !== "string" || secret.length === 0) continue;
    for (const representation of textRepresentations(secret)) {
      values.add(representation);
      let encoded = representation;
      for (let depth = 0; depth < 2; depth += 1) {
        encoded = encodeURIComponent(encoded);
        values.add(encoded);
      }
    }
  }
  return [...values].filter((value) => value.length > 0);
}

export function containsAuthLeak(content, { secretValues = [] } = {}) {
  const secrets = expandSecretValues(secretValues);
  return textRepresentations(content).some((text) =>
    AUTH_MARKER.test(text) || secrets.some((secret) => text.includes(secret))
  );
}

export class ArtifactPublishError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "ArtifactPublishError";
    this.code = code;
    this.details = details;
  }
}

export function assertArtifactSetSafe(files, { secretValues = [] } = {}) {
  for (const [name, content] of Object.entries(files)) {
    if (containsAuthLeak(content, { secretValues })) {
      throw new ArtifactPublishError("SECRET_EXPOSURE_DETECTED", { artifact: name });
    }
  }
}

async function isIdenticalBundle(outputDir, files) {
  if (!existsSync(outputDir)) return false;
  const expected = Object.keys(files).toSorted();
  const actual = (await readdir(outputDir)).toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) return false;
  for (const name of expected) {
    if ((await readFile(path.join(outputDir, name), "utf8")) !== String(files[name])) return false;
  }
  return true;
}

export async function publishArtifactBundle(
  outputDir,
  files,
  { secretValues = [], writeFileImpl = writeFile, publishPointerImpl = symlink } = {},
) {
  const normalizedFiles = Object.fromEntries(
    Object.entries(files).map(([name, content]) => {
      if (path.isAbsolute(name) || path.basename(name) !== name) {
        throw new ArtifactPublishError("ARTIFACT_PATH_INVALID", { artifact: name });
      }
      return [name, String(content)];
    }),
  );
  assertArtifactSetSafe(normalizedFiles, { secretValues });

  if (existsSync(outputDir)) {
    if (await isIdenticalBundle(outputDir, normalizedFiles)) return "reused";
    throw new ArtifactPublishError("ARTIFACT_IMMUTABLE", { artifact: path.basename(outputDir) });
  }

  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  const tempDir = await mkdtemp(path.join(parent, `.${path.basename(outputDir)}.tmp-`));
  try {
    for (const [name, content] of Object.entries(normalizedFiles)) {
      const target = path.join(tempDir, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileImpl(target, content, { flag: "wx" });
    }
    await publishPointerImpl(path.basename(tempDir), outputDir, "dir");
    return "created";
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}
