import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { AppShell } from "@/components/layout/app-shell";

export default function LoginPage() {
  return (
    <AppShell currentTab="home">
      <div className="mx-auto max-w-lg">
        <div className="glass-panel rounded-[32px] px-6 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            Login
          </p>
          <h2 className="display mt-2 text-4xl text-[var(--brand-deep)]">
            소셜 로그인으로 이어서 진행하세요
          </h2>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            첫 슬라이스에서는 카카오, 네이버, 구글 로그인과 로그인 후 복귀
            흐름까지 연결합니다.
          </p>
          <div className="mt-6">
            <SocialLoginButtons nextPath="/" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
