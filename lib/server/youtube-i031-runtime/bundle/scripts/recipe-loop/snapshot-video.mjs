#!/usr/bin/env node
/* eslint-disable no-console */
// 유튜브 레시피 추출 강화 루프(M1)용 1회 수집 스크립트.
// 영상 메타 + 설명 + 공개 자막 + 작성자 댓글을 source.json으로 스냅샷한다.
//
// 사용법:
//   node scripts/recipe-loop/snapshot-video.mjs <urlOrId> [<urlOrId> ...] [--out-dir notebooks/recipe_loop_data/candidates]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DEFAULT_OUT_DIR = "notebooks/recipe_loop_data/candidates";
const YOUTUBE_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function parseCliArgs(argv) {
  const args = { positional: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      args.positional.push(token);
      continue;
    }

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
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    env[key] = value;
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

export function parseVideoId(value) {
  const trimmed = value.trim();

  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com") {
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) {
      return fromQuery;
    }

    const shortsMatch = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (shortsMatch) {
      return shortsMatch[1];
    }
  }

  return null;
}

function parseIsoDurationToSeconds(value) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? "");
  if (!match) return null;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // 호출자가 status로 판단한다.
  }
  return { status: response.status, payload, text };
}

async function fetchVideoMeta(apiKey, videoId) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const { status, payload } = await fetchJson(url.toString());
  if (status !== 200) {
    throw new Error(`videos.list 실패 (status ${status}): ${JSON.stringify(payload?.error?.message ?? payload)}`);
  }

  const item = payload?.items?.[0];
  if (!item) {
    throw new Error(`영상을 찾을 수 없습니다: ${videoId}`);
  }

  const snippet = item.snippet ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  const bestThumb = thumbnails.maxres ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default ?? null;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title ?? "",
    description: snippet.description ?? "",
    channelId: snippet.channelId ?? null,
    channelTitle: snippet.channelTitle ?? null,
    publishedAt: snippet.publishedAt ?? null,
    tags: Array.isArray(snippet.tags) ? snippet.tags : [],
    defaultLanguage: snippet.defaultLanguage ?? snippet.defaultAudioLanguage ?? null,
    durationSeconds: parseIsoDurationToSeconds(item.contentDetails?.duration),
    hasManualCaptionFlag: item.contentDetails?.caption === "true",
    thumbnailUrl: bestThumb?.url ?? null,
    stats: {
      viewCount: Number(item.statistics?.viewCount ?? 0),
      likeCount: Number(item.statistics?.likeCount ?? 0),
      commentCount: Number(item.statistics?.commentCount ?? 0),
    },
  };
}

async function fetchAuthorComments(apiKey, videoId, channelId) {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", "100");
  url.searchParams.set("order", "relevance");
  url.searchParams.set("textFormat", "plainText");
  url.searchParams.set("key", apiKey);

  const { status, payload } = await fetchJson(url.toString());
  if (status === 403) {
    return { available: false, reason: "comments_disabled_or_forbidden", comments: [] };
  }
  if (status !== 200) {
    return { available: false, reason: `comment_threads_status_${status}`, comments: [] };
  }

  const comments = (payload?.items ?? [])
    .map((item) => item?.snippet?.topLevelComment?.snippet)
    .filter((snippet) => snippet && snippet.authorChannelId?.value === channelId)
    .map((snippet) => ({
      text: snippet.textOriginal ?? snippet.textDisplay ?? "",
      likeCount: Number(snippet.likeCount ?? 0),
      publishedAt: snippet.publishedAt ?? null,
    }))
    .filter((comment) => comment.text.trim());

  return { available: true, reason: null, comments };
}

function extractJsonObjectAfterMarker(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const objectStart = source.indexOf("{", markerIndex + marker.length);
  if (objectStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

function normalizeCaptionTrackName(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.simpleText === "string") return value.simpleText;
  if (!Array.isArray(value.runs)) return null;
  const text = value.runs.map((run) => (typeof run?.text === "string" ? run.text : "")).join("").trim();
  return text || null;
}

function parseCaptionTracksFromWatchHtml(html) {
  const jsonText = extractJsonObjectAfterMarker(html, "ytInitialPlayerResponse");
  if (!jsonText) return [];

  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const tracks = payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];

  return tracks
    .filter((track) => typeof track?.baseUrl === "string")
    .map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: typeof track.languageCode === "string" ? track.languageCode : null,
      name: normalizeCaptionTrackName(track.name),
      trackKind: track.kind === "asr" ? "auto" : track.kind ? "unknown" : "manual",
    }));
}

function selectCaptionTrack(tracks, preferredLanguages = ["ko", "en"]) {
  if (tracks.length === 0) return null;

  const languageRank = (track) => {
    const code = (track.languageCode ?? "").toLowerCase();
    const exactRank = preferredLanguages.indexOf(code);
    if (exactRank >= 0) return exactRank;
    const prefixRank = preferredLanguages.findIndex((language) => code.startsWith(`${language}-`) || code.startsWith(language));
    return prefixRank >= 0 ? prefixRank + 10 : 100;
  };
  const kindRank = (track) => (track.trackKind === "manual" ? 0 : track.trackKind === "auto" ? 1 : 2);

  return [...tracks].sort((left, right) => {
    const languageDiff = languageRank(left) - languageRank(right);
    if (languageDiff !== 0) return languageDiff;
    return kindRank(left) - kindRank(right);
  })[0];
}

function withTimedTextJsonFormat(baseUrl) {
  try {
    const url = new URL(baseUrl, "https://www.youtube.com");
    url.searchParams.set("fmt", "json3");
    return url.toString();
  } catch {
    return baseUrl.includes("fmt=") ? baseUrl : `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
  }
}

function parseJson3Segments(payload) {
  if (!payload || !Array.isArray(payload.events)) return [];

  const segments = [];
  payload.events.forEach((event, lineIndex) => {
    if (!Array.isArray(event?.segs)) return;
    const text = event.segs
      .map((segment) => (typeof segment?.utf8 === "string" ? segment.utf8 : ""))
      .join("")
      .replace(/\s+/gu, " ")
      .trim();
    if (!text) return;
    segments.push({
      lineIndex,
      text,
      startMs: typeof event.tStartMs === "number" ? event.tStartMs : null,
      durationMs: typeof event.dDurationMs === "number" ? event.dDurationMs : null,
    });
  });

  return segments;
}

async function fetchCaptions(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=ko`;
  const watchResponse = await fetch(watchUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko,en;q=0.8",
      "user-agent": YOUTUBE_BROWSER_USER_AGENT,
    },
  });

  if (!watchResponse.ok) {
    return { available: false, reason: `watch_page_status_${watchResponse.status}`, tracks: [], segments: [] };
  }

  const html = await watchResponse.text();
  const tracks = parseCaptionTracksFromWatchHtml(html);
  const trackSummaries = tracks.map(({ languageCode, name, trackKind }) => ({ languageCode, name, trackKind }));

  if (tracks.length === 0) {
    return { available: false, reason: "no_public_caption_tracks", tracks: trackSummaries, segments: [] };
  }

  const selected = selectCaptionTrack(tracks);
  const timedTextUrl = withTimedTextJsonFormat(selected.baseUrl);
  const { status, payload, text } = await fetchJson(timedTextUrl, {
    accept: "application/json,text/xml,application/xml,text/plain,*/*;q=0.8",
    "accept-language": "ko,en;q=0.8",
    referer: watchUrl,
    "user-agent": YOUTUBE_BROWSER_USER_AGENT,
  });

  if (status !== 200 || (!payload && !text)) {
    return {
      available: false,
      reason: `timedtext_status_${status}`,
      tracks: trackSummaries,
      selectedTrack: { languageCode: selected.languageCode, name: selected.name, trackKind: selected.trackKind },
      segments: [],
    };
  }

  const segments = parseJson3Segments(payload);

  return {
    available: segments.length > 0,
    reason: segments.length > 0 ? null : "timedtext_empty",
    tracks: trackSummaries,
    selectedTrack: { languageCode: selected.languageCode, name: selected.name, trackKind: selected.trackKind },
    segments,
  };
}

function collectApifySegments(value, language) {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, lineIndex) => ({ lineIndex, text: line, startMs: null, durationMs: null, language }));
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nestedLanguage = typeof value.languageCode === "string"
      ? value.languageCode
      : typeof value.language === "string"
        ? value.language
        : language;
    const nested = collectApifySegments(
      value.segments ?? value.items ?? value.transcript ?? value.captions ?? value.subtitles,
      nestedLanguage,
    );
    if (nested.length > 0) return nested;
    return collectApifySegments(
      value.transcriptText ?? value.transcript_text ?? value.text ?? value.content,
      nestedLanguage,
    );
  }

  if (!Array.isArray(value)) return [];

  return value.flatMap((item, lineIndex) => {
    if (typeof item === "string") {
      const text = item.trim();
      return text ? [{ lineIndex, text, startMs: null, durationMs: null, language }] : [];
    }
    if (!item || typeof item !== "object") return [];
    const textValue = item.text ?? item.utf8 ?? item.caption ?? item.content;
    if (typeof textValue !== "string" || !textValue.trim()) return [];
    const startSeconds = typeof item.start === "number" ? item.start : null;
    const durationSeconds = typeof item.duration === "number" ? item.duration : null;
    return [{
      lineIndex,
      text: textValue.trim(),
      startMs: typeof item.startMs === "number" ? Math.round(item.startMs) : startSeconds === null ? null : Math.round(startSeconds * 1000),
      durationMs: typeof item.durationMs === "number" ? Math.round(item.durationMs) : durationSeconds === null ? null : Math.round(durationSeconds * 1000),
      language,
    }];
  });
}

async function fetchApifyCaptions(env, videoId) {
  const token = env.APIFY_TOKEN;
  const actorId = env.YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID ?? "tubelens~youtube-video-scraper";
  if (!token) {
    return { available: false, reason: "apify_token_missing", provider: "apify", segments: [] };
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const timeoutMs = Number(env.YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS ?? 60000);
  const params = new URLSearchParams({
    token,
    timeout: String(Math.ceil(timeoutMs / 1000)),
    format: "json",
    clean: "true",
    maxItems: "1",
  });
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId).replace(/%7E/gu, "~")}/run-sync-get-dataset-items?${params.toString()}`;
  const input = {
    url: youtubeUrl,
    videoUrl: youtubeUrl,
    videoUrls: [youtubeUrl],
    startUrls: [{ url: youtubeUrl }],
    languages: ["ko", "en"],
    includeMetadata: false,
    includeTranscript: true,
    transcriptLanguage: "ko",
    includeComments: false,
    includeChannel: false,
    maxCommentsPerVideo: 0,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return { available: false, reason: `apify_fetch_failed_${error.name}`, provider: "apify", segments: [] };
  }
  clearTimeout(timer);

  if (!response.ok) {
    return { available: false, reason: `apify_status_${response.status}`, provider: "apify", segments: [] };
  }

  const payload = await response.json().catch(() => null);
  const items = Array.isArray(payload) ? payload : [payload];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const language = typeof item.language === "string"
      ? item.language
      : typeof item.languageCode === "string"
        ? item.languageCode
        : null;
    const nested = item.transcript ?? item.captions ?? item.subtitles ?? item.segments;
    const direct = item.transcriptText ?? item.transcript_text ?? item.text ?? item.content;
    const segments = [
      ...collectApifySegments(nested, language),
      ...collectApifySegments(direct, language),
    ];
    if (segments.length > 0) {
      return {
        available: true,
        reason: null,
        provider: "apify",
        language: segments[0]?.language ?? language,
        segments,
      };
    }
  }

  return { available: false, reason: "apify_empty_transcript", provider: "apify", segments: [] };
}

function descriptionRecipeSignal(description) {
  return {
    hasIngredientKeyword: /재료|계량|ingredients?/i.test(description),
    hasStepKeyword: /만드는\s*법|만들기|조리법|레시피|recipe|순서/i.test(description),
    hasQuantityPattern: /\d+\s*(?:g|kg|ml|L|개|큰술|작은술|스푼|컵|티스푼|T|t)\b/iu.test(description),
    length: description.length,
  };
}

export async function snapshotVideo(env, videoId, outDir, { useApifyFallback = false } = {}) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY가 없습니다 (.env.local 확인).");
  }

  const video = await fetchVideoMeta(apiKey, videoId);
  let [captions, authorComments] = await Promise.all([
    fetchCaptions(videoId),
    fetchAuthorComments(apiKey, videoId, video.channelId),
  ]);

  // 공개 timedtext가 막힌 경우(빈 200 응답 등) 1회 수집 한정으로 Apify 폴백을 쓴다.
  // 프로덕션 transcript 폴백과 같은 actor라 스냅샷이 실서비스 입력과 동일해진다.
  if (!captions.available && useApifyFallback && captions.reason !== "no_public_caption_tracks") {
    const apifyCaptions = await fetchApifyCaptions(env, videoId);
    if (apifyCaptions.available) {
      captions = {
        ...apifyCaptions,
        tracks: captions.tracks,
        selectedTrack: {
          languageCode: apifyCaptions.language ?? null,
          name: null,
          trackKind: "unknown",
        },
        publicTimedTextReason: captions.reason,
      };
    } else {
      captions = { ...captions, apifyFallback: apifyCaptions.reason };
    }
  }

  const source = {
    schemaVersion: 1,
    snapshotAt: new Date().toISOString(),
    video: {
      videoId: video.videoId,
      url: video.url,
      title: video.title,
      description: video.description,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      tags: video.tags,
      defaultLanguage: video.defaultLanguage,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
    },
    stats: video.stats,
    descriptionSignal: descriptionRecipeSignal(video.description),
    captions,
    authorComments,
  };

  const targetDir = path.join(PROJECT_ROOT, outDir, videoId);
  await mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, "source.json");
  await writeFile(targetPath, `${JSON.stringify(source, null, 2)}\n`, "utf8");

  return { source, targetPath };
}

function summarizeSnapshot(source) {
  const caption = source.captions.available
    ? `${source.captions.selectedTrack?.languageCode}/${source.captions.selectedTrack?.trackKind}(${source.captions.segments.length}줄)`
    : `없음(${source.captions.reason})`;
  const signal = source.descriptionSignal;
  const descSignal = [
    signal.hasIngredientKeyword ? "재료어" : null,
    signal.hasQuantityPattern ? "수량" : null,
    signal.hasStepKeyword ? "조리어" : null,
  ].filter(Boolean).join("+") || "없음";

  return [
    `제목: ${source.video.title}`,
    `채널: ${source.video.channelTitle}`,
    `길이: ${source.video.durationSeconds}s`,
    `자막: ${caption}`,
    `설명신호: ${descSignal}(${signal.length}자)`,
    `작성자댓글: ${source.authorComments.comments.length}건`,
  ].join(" | ");
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const outDir = typeof args["out-dir"] === "string" ? args["out-dir"] : DEFAULT_OUT_DIR;

  if (args.positional.length === 0) {
    console.error("사용법: node scripts/recipe-loop/snapshot-video.mjs <urlOrId> [...] [--out-dir dir]");
    process.exit(1);
  }

  const env = await loadEnv();
  const useApifyFallback = args.apify === true;
  let failureCount = 0;

  for (const raw of args.positional) {
    const videoId = parseVideoId(raw);
    if (!videoId) {
      console.error(`[SKIP] 유효한 유튜브 URL/ID가 아닙니다: ${raw}`);
      failureCount += 1;
      continue;
    }

    try {
      const { source, targetPath } = await snapshotVideo(env, videoId, outDir, { useApifyFallback });
      console.log(`[OK] ${videoId} → ${path.relative(PROJECT_ROOT, targetPath)}`);
      console.log(`     ${summarizeSnapshot(source)}`);
    } catch (error) {
      failureCount += 1;
      console.error(`[FAIL] ${videoId}: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
