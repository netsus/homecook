// Collect public YouTube metadata and subtitles for public-source-gpt.

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { hashKey, hashText, videoIdFromUrl } from "./codex-vision-client.mjs";

const PROJECT_ROOT = process.cwd();
const DEFAULT_CACHE_DIR = path.join(PROJECT_ROOT, "notebooks/recipe_loop_data/cache/public-source-gpt/source");
const COLLECTOR_VERSION = "public-source-collector-v1";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_SUB_LANGS = "en,ko-en,ja-en,ko,ko.*,en.*,ja.*";

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function parseVttTimestamp(value) {
  const match = /^(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1].slice(0, -1)) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return (((hours * 60) + minutes) * 60 + seconds) * 1000 + millis;
}

export function parseVttSegments(text, { language = null, sourceFile = null } = {}) {
  const segments = [];
  const lines = String(text ?? "").split(/\r?\n/u);
  let pendingTiming = null;
  let pendingText = [];

  const flush = () => {
    const textValue = compact(pendingText.join(" ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/&amp;/gu, "&")
      .replace(/&lt;/gu, "<")
      .replace(/&gt;/gu, ">"));
    if (pendingTiming && textValue) {
      const startMs = parseVttTimestamp(pendingTiming.start);
      const endMs = parseVttTimestamp(pendingTiming.end);
      segments.push({
        lineIndex: segments.length,
        text: textValue,
        startMs,
        durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : null,
        language,
        sourceFile,
      });
    }
    pendingTiming = null;
    pendingText = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:") || line.startsWith("NOTE")) {
      if (!line) flush();
      continue;
    }
    const timing = line.match(/^([0-9:.]+)\s+-->\s+([0-9:.]+)/u);
    if (timing) {
      flush();
      pendingTiming = { start: timing[1], end: timing[2] };
      continue;
    }
    if (/^\d+$/u.test(line)) continue;
    if (pendingTiming) pendingText.push(line);
  }
  flush();

  return segments.filter((segment, index, all) => index === 0 || segment.text !== all[index - 1]?.text);
}

function languageFromVttFile(fileName) {
  const match = /\.([a-z]{2}(?:-[a-z]{2,})?)\.vtt$/iu.exec(fileName);
  return match?.[1] ?? null;
}

async function runCommand(command, args, { cwd = PROJECT_ROOT, timeoutMs = DEFAULT_TIMEOUT_MS, logPath = null, allowFailure = false } = {}) {
  await mkdir(path.dirname(logPath ?? path.join(PROJECT_ROOT, ".tmp-public-source-log")), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error(`${command} timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (logPath) {
        await writeFile(logPath, [`$ ${command} ${args.join(" ")}`, "", stdout, stderr].join("\n"), "utf8").catch(() => {});
      }
      if (settled) return;
      settled = true;
      if (code !== 0 && !allowFailure) {
        reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
      } else {
        resolve({ stdout, stderr, code });
      }
    });
  });
}

function snapshotSubtitle(input = {}) {
  const transcript = input.transcript;
  if (!Array.isArray(transcript?.segments) || transcript.segments.length === 0) return [];
  return [{
    language: transcript.language ?? null,
    sourceFile: "source.json#captions",
    source: "source-json",
    segments: transcript.segments.map((segment, index) => ({
      lineIndex: Number.isInteger(segment.lineIndex) ? segment.lineIndex : index,
      text: compact(segment.text),
      startMs: Number.isFinite(segment.startMs) ? segment.startMs : null,
      durationMs: Number.isFinite(segment.durationMs) ? segment.durationMs : null,
      language: segment.language ?? transcript.language ?? null,
      sourceFile: "source.json#captions",
    })).filter((segment) => segment.text),
  }];
}

function sourceVideoFromInput(input = {}) {
  const video = input.video ?? {};
  return {
    videoId: video.videoId ?? null,
    url: input.youtubeUrl ?? (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : null),
    title: video.title ?? "",
    description: video.description ?? "",
    tags: Array.isArray(video.tags) ? video.tags : [],
  };
}

export function buildSnapshotPublicSource(input = {}, { reason = "collector_unavailable" } = {}) {
  const video = sourceVideoFromInput(input);
  return {
    version: COLLECTOR_VERSION,
    collector: "source-json-fallback",
    reason,
    video,
    subtitles: snapshotSubtitle(input),
    authorComments: Array.isArray(input.authorComments) ? input.authorComments : [],
    artifactDir: null,
    warnings: [reason],
  };
}

export async function collectPublicSource({ input = {}, videoUrl = null, cacheDir = DEFAULT_CACHE_DIR, noCache = false, refresh = false, timeoutMs = DEFAULT_TIMEOUT_MS, subLangs = DEFAULT_SUB_LANGS, runCommandImpl = runCommand } = {}) {
  const snapshotVideo = sourceVideoFromInput(input);
  const url = videoUrl ?? snapshotVideo.url;
  if (!url) return buildSnapshotPublicSource(input, { reason: "missing_video_url" });

  const videoId = videoIdFromUrl(url) ?? snapshotVideo.videoId ?? hashText(url, 12);
  const key = hashKey({ collector: COLLECTOR_VERSION, videoUrl: url, subLangs });
  const resultDir = path.join(cacheDir, key);
  const publicSourcePath = path.join(resultDir, "public-source.json");
  if (!noCache && !refresh && existsSync(publicSourcePath)) {
    return JSON.parse(await readFile(publicSourcePath, "utf8"));
  }

  await mkdir(resultDir, { recursive: true });
  const sourceDir = path.join(resultDir, "source");
  await mkdir(sourceDir, { recursive: true });

  let metadata = null;
  const warnings = [];
  try {
    const meta = await runCommandImpl("yt-dlp", [
      "--skip-download",
      "--ignore-no-formats-error",
      "--dump-json",
      url,
    ], {
      timeoutMs,
      logPath: path.join(resultDir, "yt-dlp-metadata.log"),
    });
    metadata = JSON.parse(meta.stdout);
    await writeFile(path.join(sourceDir, "video.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  } catch (error) {
    warnings.push(`metadata_failed:${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await runCommandImpl("yt-dlp", [
      "--skip-download",
      "--ignore-no-formats-error",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      subLangs,
      "--sub-format",
      "vtt/best",
      "--output",
      path.join(sourceDir, "%(id)s.%(ext)s"),
      url,
    ], {
      timeoutMs,
      logPath: path.join(resultDir, "yt-dlp-subtitles.log"),
      allowFailure: true,
    });
  } catch (error) {
    warnings.push(`subtitles_failed:${error instanceof Error ? error.message : String(error)}`);
  }

  const subtitles = [...snapshotSubtitle(input)];
  const fileNames = existsSync(sourceDir) ? await readdir(sourceDir) : [];
  for (const fileName of fileNames.filter((name) => name.endsWith(".vtt")).sort()) {
    const filePath = path.join(sourceDir, fileName);
    const text = await readFile(filePath, "utf8");
    const language = languageFromVttFile(fileName);
    const segments = parseVttSegments(text, { language, sourceFile: fileName });
    if (segments.length > 0) {
      subtitles.push({ language, sourceFile: fileName, source: "yt-dlp", segments });
    }
  }

  const video = {
    videoId,
    url,
    title: metadata?.title ?? snapshotVideo.title,
    description: metadata?.description ?? snapshotVideo.description,
    tags: Array.isArray(metadata?.tags) ? metadata.tags : snapshotVideo.tags,
  };
  const publicSource = {
    version: COLLECTOR_VERSION,
    collector: "yt-dlp",
    video,
    subtitles,
    authorComments: Array.isArray(input.authorComments) ? input.authorComments : [],
    artifactDir: resultDir,
    warnings,
  };
  await writeFile(publicSourcePath, `${JSON.stringify(publicSource, null, 2)}\n`, "utf8");
  await writeFile(path.join(resultDir, "public-source.txt"), formatPublicSourceText(publicSource), "utf8");
  return publicSource;
}

export function formatPublicSourceText(publicSource = {}) {
  const video = publicSource.video ?? {};
  const blocks = [
    `[PUBLIC_SOURCE: url]\n${video.url ?? ""}`,
    `[PUBLIC_SOURCE: title]\n${video.title ?? ""}`,
    `[PUBLIC_SOURCE: description]\n${video.description ?? ""}`,
  ];
  for (const subtitle of publicSource.subtitles ?? []) {
    const lines = (subtitle.segments ?? [])
      .map((segment) => `${Number.isFinite(segment.startMs) ? `[${Math.round(segment.startMs / 1000)}s] ` : ""}${segment.text}`)
      .filter(Boolean)
      .slice(0, 500)
      .join("\n");
    if (lines.trim()) {
      blocks.push(`[PUBLIC_SOURCE: subtitle(${subtitle.language ?? "unknown"}) ${subtitle.sourceFile ?? ""}]\n${lines}`);
    }
  }
  if (Array.isArray(publicSource.authorComments) && publicSource.authorComments.length > 0) {
    blocks.push(`[PUBLIC_SOURCE: author_comment]\n${publicSource.authorComments.join("\n---\n")}`);
  }
  return blocks.join("\n\n");
}
