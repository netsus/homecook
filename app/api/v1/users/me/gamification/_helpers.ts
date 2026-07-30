import { fail } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";
import type { UserProgressDbClient } from "@/lib/server/user-progress";
import {
  createGamificationProjectionInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

export async function createAuthedGamificationClient(fallbackMessage: string) {
  let routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>;
  try {
    routeClient = await createRouteHandlerClient();
  } catch {
    return {
      response: fail("INTERNAL_ERROR", fallbackMessage, 500),
      dbClient: null,
      user: null,
    };
  }
  let authResult;
  try {
    authResult = await routeClient.auth.getUser();
  } catch {
    return {
      response: fail("INTERNAL_ERROR", fallbackMessage, 500),
      dbClient: null,
      user: null,
    };
  }
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      dbClient: null,
      user: null,
    };
  }

  const bootstrapClient = routeClient as unknown as UserBootstrapDbClient;
  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, fallbackMessage),
        500,
      ),
      dbClient: null,
      user: null,
    };
  }

  let dbClient: UserGamificationDbClient & UserProgressDbClient;
  try {
    const internalClient = createGamificationProjectionInternalClient();
    if (!internalClient) {
      throw new Error("gamification projection client is unavailable");
    }
    dbClient = internalClient as unknown as
      UserGamificationDbClient & UserProgressDbClient;
  } catch {
    return {
      response: fail("INTERNAL_ERROR", fallbackMessage, 500),
      dbClient: null,
      user: null,
    };
  }

  return {
    response: null,
    dbClient,
    user,
  };
}
