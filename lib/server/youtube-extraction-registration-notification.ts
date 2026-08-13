interface RpcResult {
  data: unknown;
  error: unknown;
}

type Rpc = (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

interface JobProjectionRow {
  id?: unknown;
  completed_at?: unknown;
  extraction_session?: unknown;
}

function getExtractionSessionId(row: JobProjectionRow) {
  const session = row.extraction_session;
  if (!session || typeof session !== "object" || Array.isArray(session)) return null;
  const id = (session as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

export async function markRegisteredYoutubeExtractionSeen({
  extractionId,
  now = new Date(),
  rpc,
  userId,
}: {
  extractionId: string;
  now?: Date;
  rpc: Rpc;
  userId: string;
}) {
  let cursorCompletedAt: string | null = null;
  let cursorJobId: string | null = null;

  try {
    for (let page = 0; page < 100; page += 1) {
      const result = await rpc("list_youtube_extraction_job_projections", {
        list_view: "unseen-completed",
        retention_floor: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        cursor_completed_at: cursorCompletedAt,
        cursor_job_id: cursorJobId,
        row_limit: 51,
      });
      if (result.error || !Array.isArray(result.data)) return false;

      const rows = result.data as JobProjectionRow[];
      const job = rows.find((row) => getExtractionSessionId(row) === extractionId);
      if (job && typeof job.id === "string") {
        const seen = await rpc("mark_youtube_extraction_jobs_seen", {
          user_id: userId,
          job_ids: [job.id],
        });
        return !seen.error;
      }

      if (rows.length < 51) return false;
      const last = rows.at(-1);
      if (typeof last?.completed_at !== "string" || typeof last.id !== "string") return false;
      cursorCompletedAt = last.completed_at;
      cursorJobId = last.id;
    }
  } catch {
    return false;
  }

  return false;
}
