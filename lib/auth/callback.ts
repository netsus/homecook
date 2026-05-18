import { sanitizeInternalPath } from "@/lib/navigation/return-context";

export function resolveNextPath(raw: string | null) {
  return sanitizeInternalPath(raw, "/");
}
