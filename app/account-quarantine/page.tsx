import { redirect } from "next/navigation";

import { AccountQuarantineScreen } from
  "@/components/auth/account-quarantine-screen";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
import { readAccountQuarantineGate } from
  "@/lib/server/account-generation/quarantine-gate";

export const metadata = {
  description: "계정 전환 중 복구 또는 삭제를 안전하게 선택하는 보호 화면",
  title: "계정 보호",
};

interface AccountQuarantinePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readNextPath(value: string | string[] | undefined) {
  return sanitizeInternalPath(
    Array.isArray(value) ? value[0] : value,
    "/mypage",
  );
}

export default async function AccountQuarantinePage({
  searchParams,
}: AccountQuarantinePageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = readNextPath(resolvedSearchParams.next);
  const gate = await readAccountQuarantineGate();

  if (gate.state === "not-applicable") {
    redirect(nextPath);
  }

  return (
    <AccountQuarantineScreen
      gateState={gate.state}
      nextPath={nextPath}
    />
  );
}
