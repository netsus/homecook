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
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      dbClient: null,
      user: null,
    };
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    UserGamificationDbClient & UserProgressDbClient & UserBootstrapDbClient;

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
