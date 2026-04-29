import Link from "next/link";

interface CookModePageProps {
  params: Promise<{ session_id: string }>;
}

export default async function CookModePage({ params }: CookModePageProps) {
  const { session_id } = await params;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-lg font-bold text-[var(--foreground)]">
        요리모드 준비 중
      </p>
      <p className="text-sm text-[var(--text-3)]">
        이 화면은 15a 슬라이스에서 구현됩니다.
      </p>
      <p className="text-xs text-[var(--text-4)]">
        세션: {session_id}
      </p>
      <Link
        className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand)] px-6 py-3 text-sm font-bold text-[var(--brand)]"
        href="/cooking/ready"
      >
        요리 준비 리스트로 돌아가기
      </Link>
    </div>
  );
}
