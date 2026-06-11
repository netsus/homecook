import { fail, ok } from "@/lib/api/response";
import {
  decodeArchiveCursor,
  readUserGamificationArchive,
} from "@/lib/server/user-gamification";
import type { UserGamificationArchiveData } from "@/types/user-gamification";

import { createAuthedGamificationClient } from "../_helpers";

function parseArchiveQuery(request: Request) {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const rawCursor = url.searchParams.get("cursor");
  const fields: Array<{ field: string; reason: string }> = [];
  let limit = 20;

  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) {
      fields.push({ field: "limit", reason: "invalid_integer" });
    } else {
      limit = Number(rawLimit);
      if (limit < 1 || limit > 50) {
        fields.push({ field: "limit", reason: "range" });
      }
    }
  }

  if (rawCursor !== null && !decodeArchiveCursor(rawCursor)) {
    fields.push({ field: "cursor", reason: "invalid_cursor" });
  }

  return {
    fields,
    limit,
    cursor: rawCursor,
  };
}

export async function GET(request: Request) {
  const parsed = parseArchiveQuery(request);

  if (parsed.fields.length > 0) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  const { response, dbClient, user } =
    await createAuthedGamificationClient("성장 기록을 불러오지 못했어요.");

  if (response) {
    return response;
  }

  const archiveResult = await readUserGamificationArchive(dbClient, user.id, {
    limit: parsed.limit,
    cursor: parsed.cursor,
  });

  if (archiveResult.error || !archiveResult.data) {
    return fail("INTERNAL_ERROR", "성장 기록을 불러오지 못했어요.", 500);
  }

  return ok<UserGamificationArchiveData>(archiveResult.data);
}
