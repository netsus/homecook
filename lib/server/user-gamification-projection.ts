import type { AccountGenerationBootstrapSessionAuthority } from "@/lib/server/account-generation/session-authority";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";

type ProjectionOperation = "achievement" | "badge" | "quest" | "summary";
interface ProjectionResult<T> {
  data: T | null;
  error: { code?: string; message: string } | null;
}

export interface UserGamificationProjectionWriter {
  write<T>(operation: ProjectionOperation, payload: object): PromiseLike<ProjectionResult<T>>;
}

interface ProjectionRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<ProjectionResult<unknown>>;
}

/** Server-computed reconciliation only; the user client remains read-only. */
export function createUserGamificationProjectionWriter(
  client: ProjectionRpcClient,
  authority: AccountGenerationBootstrapSessionAuthority,
): UserGamificationProjectionWriter {
  const authorityArgs = buildSessionAuthorityRpcArgs(authority);
  return {
    async write<T>(operation: ProjectionOperation, payload: object) {
      const result = await client.rpc("write_user_gamification_projection", {
        ...authorityArgs,
        p_operation: operation,
        p_payload: payload,
      });
      return { data: result.data as T | null, error: result.error };
    },
  };
}
