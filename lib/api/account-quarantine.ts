import { fetchJson } from "@/lib/api/fetch-json";

export type AccountQuarantineAction = "activate" | "delete";

export interface AccountQuarantineIntent {
  action: AccountQuarantineAction;
  idempotencyKey: string;
}

export type AccountQuarantineResolutionData =
  | {
      resolution_status: "active";
      account_generation: number;
    }
  | {
      deletion_status: "cleanup_pending";
    };

export function createAccountQuarantineIntent(
  action: AccountQuarantineAction,
): AccountQuarantineIntent {
  return {
    action,
    idempotencyKey: crypto.randomUUID(),
  };
}

export async function resolveAccountQuarantine(input: {
  action: AccountQuarantineAction;
  idempotencyKey: string;
  nickname?: string;
}) {
  const body = input.action === "activate"
    ? {
        action: input.action,
        profile: { nickname: input.nickname?.trim() ?? "" },
      }
    : { action: input.action };

  return fetchJson<AccountQuarantineResolutionData>(
    "/api/v1/users/me/cutover-quarantine-resolution",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
}
