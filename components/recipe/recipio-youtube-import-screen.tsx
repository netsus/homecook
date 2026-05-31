"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { checkRecipioYoutubeDuplicate } from "@/lib/api/recipio-youtube-import";
import {
  extractYoutubeRecipe,
  registerYoutubeRecipe,
  validateYoutubeUrl,
} from "@/lib/api/youtube-import";
import {
  buildCanonicalRecipioYoutubeUrl,
  buildRecipioYoutubeRegisterBody,
  getRecipioAutoRegisterBlockers,
  getRecipioYoutubeProgress,
  normalizeRecipioYoutubeUrl,
  RECIPIO_RECOMMENDED_YOUTUBE_VIDEOS,
  type RecipioYoutubeImportPhase,
  type RecipioYoutubeUrl,
} from "@/lib/recipio-youtube-import";
import type {
  RecipioYoutubeDuplicateRecipe,
  YoutubeRecipeExtractData,
  YoutubeVideoInfo,
} from "@/types/recipe";

interface RecipioYoutubeImportScreenProps {
  initialYoutubeUrl?: string;
}

type ImportStatus =
  | "idle"
  | "checking"
  | "preview"
  | "duplicate"
  | "importing"
  | "review-required"
  | "complete"
  | "error";

const CAPABILITY_ITEMS = ["영양성분·칼로리", "예상 원가 분석", "조리 타이머", "인분수 변환"] as const;

function getThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function getApiMessage(fallback: string, message?: string | null) {
  return message?.trim() || fallback;
}

function DuplicateRecipeCard({ recipe }: { recipe: RecipioYoutubeDuplicateRecipe }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
      <div className="relative aspect-video bg-[var(--surface-fill)]">
        {recipe.thumbnail_url ? (
          <Image
            src={recipe.thumbnail_url}
            alt={recipe.title}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-3)]">
            저장된 레시피
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold text-[var(--brand)]">레시피가 이미 존재해요</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold text-[var(--foreground)]">
          {recipe.title}
        </h3>
        <p className="mt-2 text-sm text-[var(--text-2)]">
          새로 추출하지 않고 저장된 레시피로 이동할 수 있어요.
        </p>
        <Link
          href={`/recipes/${recipe.recipe_id}`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 text-base font-semibold text-[var(--text-inverse)]"
        >
          레시피 보러가기
        </Link>
      </div>
    </div>
  );
}

function VideoPreviewCard({
  videoInfo,
  onImport,
}: {
  videoInfo: YoutubeVideoInfo;
  onImport: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
      <div className="relative aspect-video bg-[var(--surface-fill)]">
        <Image
          src={videoInfo.thumbnail_url}
          alt={videoInfo.title}
          fill
          unoptimized
          className="object-cover"
        />
      </div>
      <div className="p-4">
        <p className="text-sm text-[var(--text-3)]">{videoInfo.channel}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold text-[var(--foreground)]">
          {videoInfo.title}
        </h3>
        <button
          className="mt-4 h-11 w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 text-base font-semibold text-[var(--text-inverse)] hover:bg-[var(--brand-deep)]"
          onClick={onImport}
          type="button"
        >
          이 영상으로 레시피 가져오기
        </button>
      </div>
    </div>
  );
}

function ProgressPanel({
  phase,
  elapsedMs,
}: {
  phase: RecipioYoutubeImportPhase;
  elapsedMs: number;
}) {
  const progress = getRecipioYoutubeProgress({ phase, elapsedMs });

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--brand)]">{progress.label}</p>
          <p className="mt-1 text-sm text-[var(--text-2)]">{progress.detail}</p>
        </div>
        <span className="text-2xl font-bold text-[var(--foreground)]">{progress.percent}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-fill)]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-all duration-500"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[11px] font-semibold text-[var(--text-3)]">
        {["중복 확인", "영상 분석", "레시피 구성", "저장"].map((label) => (
          <span key={label} className="rounded-[var(--radius-sm)] bg-[var(--surface-fill)] px-1 py-2">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RecommendedVideoButton({
  video,
  onSelect,
}: {
  video: (typeof RECIPIO_RECOMMENDED_YOUTUBE_VIDEOS)[number];
  onSelect: (url: string) => void;
}) {
  return (
    <button
      className="group grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-2 text-left shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
      onClick={() => onSelect(buildCanonicalRecipioYoutubeUrl(video.videoId))}
      type="button"
    >
      <span className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-fill)]">
        <Image
          src={getThumbnailUrl(video.videoId)}
          alt={video.title}
          fill
          unoptimized
          className="object-cover transition group-hover:scale-105"
        />
      </span>
      <span className="min-w-0 py-1">
        <span className="line-clamp-2 text-sm font-bold leading-snug text-[var(--foreground)]">
          {video.title}
        </span>
        <span className="mt-1 block truncate text-xs text-[var(--text-2)]">{video.channel}</span>
        <span className="mt-1 block text-xs text-[var(--text-3)]">{video.viewLabel}</span>
      </span>
    </button>
  );
}

export function RecipioYoutubeImportScreen({
  initialYoutubeUrl = "",
}: RecipioYoutubeImportScreenProps) {
  const router = useRouter();
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl);
  const [normalizedUrl, setNormalizedUrl] = useState<RecipioYoutubeUrl | null>(
    () => normalizeRecipioYoutubeUrl(initialYoutubeUrl),
  );
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [phase, setPhase] = useState<RecipioYoutubeImportPhase>("idle");
  const [phaseStartedAt, setPhaseStartedAt] = useState(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [videoInfo, setVideoInfo] = useState<YoutubeVideoInfo | null>(null);
  const [duplicateRecipe, setDuplicateRecipe] = useState<RecipioYoutubeDuplicateRecipe | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<YoutubeRecipeExtractData | null>(null);
  const [reviewBlockers, setReviewBlockers] = useState<string[]>([]);
  const [registeredRecipeId, setRegisteredRecipeId] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const canSubmit = useMemo(
    () => Boolean(normalizeRecipioYoutubeUrl(youtubeUrl)),
    [youtubeUrl],
  );

  const setTimedPhase = useCallback((nextPhase: RecipioYoutubeImportPhase) => {
    setPhase(nextPhase);
    setPhaseStartedAt(Date.now());
    setElapsedMs(0);
  }, []);

  const syncNormalizedUrl = useCallback((nextUrl: RecipioYoutubeUrl | null) => {
    setNormalizedUrl((previousUrl) =>
      previousUrl?.videoId === nextUrl?.videoId &&
      previousUrl?.youtubeUrl === nextUrl?.youtubeUrl
        ? previousUrl
        : nextUrl,
    );
  }, []);

  const startImport = useCallback(async (targetUrl = normalizedUrl) => {
    if (!targetUrl) return;

    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setStatus("importing");
    setErrorMessage(null);
    setReviewDraft(null);
    setReviewBlockers([]);
    setTimedPhase("extracting");

    const duplicate = await checkRecipioYoutubeDuplicate(targetUrl.youtubeUrl);
    if (seq !== requestSeqRef.current) return;

    if (duplicate.success && duplicate.data?.is_duplicate && duplicate.data.recipe) {
      setDuplicateRecipe(duplicate.data.recipe);
      setStatus("duplicate");
      setTimedPhase("complete");
      return;
    }

    const extracted = await extractYoutubeRecipe({ youtube_url: targetUrl.youtubeUrl });
    if (seq !== requestSeqRef.current) return;

    if (!extracted.success || !extracted.data) {
      setStatus("error");
      setTimedPhase("idle");
      setErrorMessage(getApiMessage("레시피를 추출하지 못했어요.", extracted.error?.message));
      return;
    }

    const blockers = getRecipioAutoRegisterBlockers(extracted.data);
    if (blockers.length > 0) {
      setReviewDraft(extracted.data);
      setReviewBlockers(blockers);
      setStatus("review-required");
      setTimedPhase("idle");
      return;
    }

    setTimedPhase("registering");
    const registered = await registerYoutubeRecipe(
      buildRecipioYoutubeRegisterBody(extracted.data, targetUrl.youtubeUrl),
    );
    if (seq !== requestSeqRef.current) return;

    if (!registered.success || !registered.data) {
      setStatus("error");
      setTimedPhase("idle");
      setErrorMessage(getApiMessage("레시피를 등록하지 못했어요.", registered.error?.message));
      return;
    }

    setRegisteredRecipeId(registered.data.recipe_id);
    setStatus("complete");
    setTimedPhase("complete");
    window.setTimeout(() => {
      router.push(`/recipes/${registered.data?.recipe_id}`);
    }, 800);
  }, [normalizedUrl, router, setTimedPhase]);

  const inspectUrl = useCallback(async (targetUrl: string, options: { autoStart?: boolean } = {}) => {
    const parsed = normalizeRecipioYoutubeUrl(targetUrl);
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    syncNormalizedUrl(parsed);
    setDuplicateRecipe(null);
    setVideoInfo(null);
    setReviewDraft(null);
    setReviewBlockers([]);
    setRegisteredRecipeId(null);
    setErrorMessage(null);

    if (!parsed) {
      setStatus(targetUrl.trim() ? "error" : "idle");
      setTimedPhase("idle");
      setErrorMessage(targetUrl.trim() ? "올바른 유튜브 링크를 입력해주세요." : null);
      return;
    }

    setStatus("checking");
    setTimedPhase("checking");

    const duplicate = await checkRecipioYoutubeDuplicate(parsed.youtubeUrl);
    if (seq !== requestSeqRef.current) return;

    if (duplicate.success && duplicate.data?.is_duplicate && duplicate.data.recipe) {
      setDuplicateRecipe(duplicate.data.recipe);
      setStatus("duplicate");
      setTimedPhase("complete");
      return;
    }

    const preview = await validateYoutubeUrl({ youtube_url: parsed.youtubeUrl });
    if (seq !== requestSeqRef.current) return;

    if (!preview.success || !preview.data) {
      setStatus("error");
      setTimedPhase("idle");
      setErrorMessage(getApiMessage("영상을 확인하지 못했어요.", preview.error?.message));
      return;
    }

    setVideoInfo(preview.data.video_info);
    setStatus("preview");
    setTimedPhase("preview");

    if (options.autoStart) {
      await startImport(parsed);
    }
  }, [setTimedPhase, startImport, syncNormalizedUrl]);

  const inspectUrlRef = useRef(inspectUrl);

  useEffect(() => {
    inspectUrlRef.current = inspectUrl;
  }, [inspectUrl]);

  useEffect(() => {
    const parsed = normalizeRecipioYoutubeUrl(youtubeUrl);
    syncNormalizedUrl(parsed);

    if (!youtubeUrl.trim()) {
      requestSeqRef.current += 1;
      setStatus("idle");
      setTimedPhase("idle");
      setDuplicateRecipe(null);
      setVideoInfo(null);
      setErrorMessage(null);
      return;
    }

    if (!parsed) return;

    const timer = window.setTimeout(() => {
      void inspectUrlRef.current(youtubeUrl);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [setTimedPhase, syncNormalizedUrl, youtubeUrl]);

  useEffect(() => {
    if (phase !== "extracting" && phase !== "registering") return;

    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - phaseStartedAt);
    }, 700);

    return () => window.clearInterval(interval);
  }, [phase, phaseStartedAt]);

  const handleSubmit = useCallback(() => {
    const parsed = normalizeRecipioYoutubeUrl(youtubeUrl);
    if (!parsed) {
      setStatus("error");
      setErrorMessage("올바른 유튜브 링크를 입력해주세요.");
      return;
    }
    syncNormalizedUrl(parsed);
    void startImport(parsed);
  }, [startImport, syncNormalizedUrl, youtubeUrl]);

  const handleRecommendedSelect = useCallback((url: string) => {
    setYoutubeUrl(url);
    const parsed = normalizeRecipioYoutubeUrl(url);
    if (parsed) {
      syncNormalizedUrl(parsed);
      void inspectUrl(url, { autoStart: true });
    }
  }, [inspectUrl, syncNormalizedUrl]);

  const reviewHref = normalizedUrl
    ? `/menu/add/youtube?youtubeUrl=${encodeURIComponent(normalizedUrl.youtubeUrl)}`
    : "/menu/add/youtube";

  return (
    <main className="min-h-dvh bg-[var(--background)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 md:grid-cols-[minmax(0,1fr)_22rem] md:px-6 md:py-10">
        <section className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-12 w-12 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
              <Image
                src="https://haemeok-s3-bucket.s3.ap-northeast-2.amazonaws.com/images/icons/youtube.webp"
                alt=""
                fill
                unoptimized
                className="object-cover"
              />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-[var(--foreground)] md:text-3xl">
                유튜브 레시피 가져오기
              </h1>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                링크만 넣으면 영상 정보를 확인하고 레시피로 저장해요.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            {CAPABILITY_ITEMS.map((item) => (
              <span
                key={item}
                className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold text-[var(--text-2)]"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
            <label
              htmlFor="recipio-youtube-url"
              className="text-sm font-semibold text-[var(--foreground)]"
            >
              유튜브 링크
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="recipio-youtube-url"
                type="url"
                inputMode="url"
                placeholder="유튜브 링크를 붙여넣으세요"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit) {
                    handleSubmit();
                  }
                }}
                className="h-12 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 text-base text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || status === "checking" || status === "importing"}
                className={[
                  "h-12 rounded-[var(--radius-sm)] px-5 text-base font-bold",
                  canSubmit && status !== "checking" && status !== "importing"
                    ? "bg-[var(--brand)] text-[var(--text-inverse)] hover:bg-[var(--brand-deep)]"
                    : "cursor-not-allowed bg-[var(--line-strong)] text-[var(--text-4)]",
                ].join(" ")}
              >
                가져오기
              </button>
            </div>
            {status === "checking" ? (
              <p className="mt-2 text-sm text-[var(--brand)]">영상 정보를 확인하고 있어요.</p>
            ) : null}
            {status === "error" && errorMessage ? (
              <p className="mt-2 text-sm font-semibold text-[var(--danger)]">{errorMessage}</p>
            ) : null}
          </div>

          <div className="mt-6">
            {status === "duplicate" && duplicateRecipe ? (
              <DuplicateRecipeCard recipe={duplicateRecipe} />
            ) : null}

            {status === "preview" && videoInfo ? (
              <VideoPreviewCard videoInfo={videoInfo} onImport={() => void startImport()} />
            ) : null}

            {status === "importing" ? (
              <ProgressPanel phase={phase} elapsedMs={elapsedMs} />
            ) : null}

            {status === "review-required" ? (
              <div className="rounded-[var(--radius-lg)] border border-[color:var(--warning-border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
                <p className="text-sm font-semibold text-[var(--brand)]">검수가 필요해요</p>
                <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">
                  자동 저장 전에 확인할 항목이 있어요.
                </h2>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
                  {reviewBlockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
                {reviewDraft ? (
                  <p className="mt-3 text-sm text-[var(--text-3)]">
                    {reviewDraft.ingredients.length}개 재료, {reviewDraft.steps.length}개 단계를 찾았어요.
                  </p>
                ) : null}
                <Link
                  href={reviewHref}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 text-base font-semibold text-[var(--text-inverse)]"
                >
                  검수 화면에서 마무리
                </Link>
              </div>
            ) : null}

            {status === "complete" && registeredRecipeId ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 text-center shadow-[var(--shadow-1)]">
                <p className="text-sm font-semibold text-[var(--brand)]">레시피 저장 완료</p>
                <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">
                  레시피 상세로 이동하고 있어요.
                </h2>
                <Link
                  href={`/recipes/${registeredRecipeId}`}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] px-5 text-base font-semibold text-[var(--text-inverse)]"
                >
                  지금 보기
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="min-w-0">
          <div className="sticky top-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--foreground)]">요즘 뜨는 레시피</h2>
            </div>
            <div className="mt-3 grid gap-3">
              {RECIPIO_RECOMMENDED_YOUTUBE_VIDEOS.map((video) => (
                <RecommendedVideoButton
                  key={video.videoId}
                  video={video}
                  onSelect={handleRecommendedSelect}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
