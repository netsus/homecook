#!/usr/bin/env node
/* eslint-disable no-console */
// M1 후보 영상 탐색 유틸. YouTube Data API search로 후보를 찾고
// 설명란 신호·자막 플래그·길이 등 가벼운 지표를 JSONL로 출력한다.
//
// 사용법:
//   node scripts/recipe-loop/discover-candidates.mjs --query "백종원 김치찌개" [--max 8] [--duration any|short|medium|long]

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = nextToken;
    index += 1;
  }
  return args;
}

function parseDotEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;
    env[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return env;
}

async function loadEnv() {
  const merged = {};
  for (const filename of [".env.local", ".env.development.local"]) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!existsSync(filePath)) continue;
    Object.assign(merged, parseDotEnv(await readFile(filePath, "utf8")));
  }
  return { ...merged, ...process.env };
}

function parseIsoDurationToSeconds(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? "");
  if (!match) return null;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const query = args.query;
  const max = Math.min(Number(args.max ?? 8), 25);
  const duration = typeof args.duration === "string" ? args.duration : "any";

  if (!query) {
    console.error("--query 가 필요합니다.");
    process.exit(1);
  }

  const env = await loadEnv();
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY가 없습니다 (.env.local 확인).");
    process.exit(1);
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(max));
  if (duration !== "any") {
    searchUrl.searchParams.set("videoDuration", duration);
  }
  searchUrl.searchParams.set("key", apiKey);

  const search = await fetchJson(searchUrl.toString());
  if (search.status !== 200) {
    console.error(`search.list 실패 (status ${search.status}): ${JSON.stringify(search.payload?.error?.message)}`);
    process.exit(1);
  }

  const videoIds = (search.payload?.items ?? [])
    .map((item) => item?.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    console.error("검색 결과가 없습니다.");
    process.exit(0);
  }

  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  videosUrl.searchParams.set("id", videoIds.join(","));
  videosUrl.searchParams.set("key", apiKey);

  const videos = await fetchJson(videosUrl.toString());
  if (videos.status !== 200) {
    console.error(`videos.list 실패 (status ${videos.status})`);
    process.exit(1);
  }

  for (const item of videos.payload?.items ?? []) {
    const snippet = item.snippet ?? {};
    const description = snippet.description ?? "";
    console.log(JSON.stringify({
      videoId: item.id,
      title: snippet.title,
      channelTitle: snippet.channelTitle,
      durationSeconds: parseIsoDurationToSeconds(item.contentDetails?.duration),
      manualCaptionFlag: item.contentDetails?.caption === "true",
      viewCount: Number(item.statistics?.viewCount ?? 0),
      descLength: description.length,
      descIngredientSignal: /재료|계량|ingredients?/i.test(description),
      descQuantitySignal: /\d+\s*(?:g|kg|ml|L|개|큰술|작은술|스푼|컵|티스푼|T|t)\b/iu.test(description),
      url: `https://www.youtube.com/watch?v=${item.id}`,
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
