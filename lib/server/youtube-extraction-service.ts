interface ExtractionServiceInput {
  jobId: string;
  videoId: string;
  options: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}

interface ExtractionRuntimeResult {
  identity: unknown;
  recipe: unknown;
  meta: unknown;
}

interface YoutubeExtractionServiceDependencies {
  extractor: {
    extract(input: { videoId: string; signal?: AbortSignal }): Promise<ExtractionRuntimeResult>;
  };
  resolveDraft(input: {
    jobId: string;
    videoId: string;
    runtimeResult: ExtractionRuntimeResult;
    signal: AbortSignal;
  }): Promise<unknown>;
}

/**
 * Provider execution boundary shared by background and sync_wait jobs.
 * Authentication, queue state and persistence remain outside this service;
 * only the normalized video ID and immutable job snapshot enter the runtime.
 */
export function createYoutubeExtractionService({
  extractor,
  resolveDraft,
}: YoutubeExtractionServiceDependencies) {
  return {
    async extract(input: ExtractionServiceInput) {
      if (
        input.options.singleRecipeOnly !== true
        || input.options.sourceMode !== "source-text"
        || input.options.frameMode !== "hybrid"
      ) {
        throw new Error("YOUTUBE_EXTRACTION_POLICY_MISMATCH");
      }
      const runtimeResult = await extractor.extract({
        videoId: input.videoId,
        signal: input.signal,
      });
      const draft = await resolveDraft({
        jobId: input.jobId,
        videoId: input.videoId,
        runtimeResult,
        signal: input.signal,
      });
      return { draft };
    },
  };
}
