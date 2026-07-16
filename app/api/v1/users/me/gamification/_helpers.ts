import { fail } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";
import type { UserProgressDbClient } from "@/lib/server/user-progress";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

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

  let dbClient: UserGamificationDbClient & UserProgressDbClient & UserBootstrapDbClient;
  try {
    dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
      UserGamificationDbClient & UserProgressDbClient & UserBootstrapDbClient;
  } catch {
    return {
      response: fail("INTERNAL_ERROR", fallbackMessage, 500),
      dbClient: null,
      user: null,
    };
  }

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
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

  return {
    response: null,
    dbClient,
    user,
  };
}
