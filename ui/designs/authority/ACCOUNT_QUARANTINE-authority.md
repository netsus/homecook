# ACCOUNT_QUARANTINE Authority Review

> 대상 slice: `account-session-generation-foundation`
> 검토 범위: `ACCOUNT_QUARANTINE`, auth callback return, MYPAGE lifecycle gate
> evidence:
> - mobile 390: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-mobile-390.png`
> - mobile 320: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-mobile-320.png`
> - desktop: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-desktop.png`
> - auth-present delete review 390: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-auth-present-activate-delete/default.png`
> - auth-present delete review 320: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-auth-present-activate-delete/delete-sheet-320.png`
> - auth-absent support-only: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-auth-absent-support-only/default.png`
> - error: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-error-pending-conflict/error.png`
> - pending: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-error-pending-conflict/pending.png`
> - conflict: `ui/designs/evidence/account-session-generation-foundation/ACCOUNT_QUARANTINE-error-pending-conflict/conflict.png`
> 검토일: 2026-07-23
> 검토자: product-design-authority (independent Codex review and two repair re-reviews)

## Verdict

- PASS / FAIL: **PASS**
- verdict: `pass`
- Blocker / Major / Minor: **0 / 0 / 0**
- P0 / P1 / P2 / P3: **0 / 0 / 0 / 0**
- unresolved: **0**
- 한 줄 요약: auth-present 복구·삭제 위계, auth-absent support-only, 320/390/desktop 반응형, 상태별 피드백, 대비·포커스·스크롤 격리를 모두 닫아 `confirmed` 진행이 가능하다.

## Scorecard

| 항목 | 점수 | 메모 |
|---|---:|---|
| Mobile UX | 5/5 | 320×568 첫 viewport에서 복구 CTA가 완전히 보이고 delete sheet의 safe area와 action이 유지된다. |
| Interaction Clarity | 5/5 | 복구 primary와 삭제 review/confirm이 분리되며 auth-absent에는 mutation CTA가 없다. |
| Visual Hierarchy | 4/5 | 보호 상태, 복구, 삭제, 안전 안내의 순서가 320/390/desktop에서 일관된다. |
| Color / Material Fit | 4/5 | 기존 역할 토큰을 재사용하고 모든 작은 CTA·badge까지 4.5:1 대비를 자동 검증한다. |
| Familiar App Pattern Fit | 5/5 | 모바일 bottom sheet, desktop modal, fail-closed 상태 안내가 익숙한 패턴을 유지한다. |

## Closed Review Findings

- 320×568 복구 CTA 하단을 `window.innerHeight` 이내로 고정하고 page horizontal overflow와 44px touch target을 검증한다.
- primary CTA는 `brand-primary-text`, destructive confirm은 `danger-strong`을 사용해 흰 텍스트와 4.5:1 이상 대비를 유지한다.
- error/conflict의 유일 복구 CTA와 warning badge도 반투명 배경 alpha 합성 뒤 4.5:1 이상인지 Playwright가 검증한다.
- 사용자 화면에서 `ACCOUNT_QUARANTINE`, `현재 계정 세대` 같은 기술 식별자를 제거하고 계정 연결 중심의 문구를 사용한다.
- delete review가 열리면 body scroll을 잠그고 배경을 `inert`/`aria-hidden` 처리하며, sheet는 `overscroll-contain`, focus trap, ESC/backdrop close, trigger focus return을 유지한다.
- 320×568 delete sheet evidence가 취소·삭제 시작 CTA와 bottom safe area를 함께 보여준다.
- 닉네임 예시는 현재 브랜드 표현인 `무먹러`를 사용한다.

## State And Contract Findings

- auth-present는 복구와 삭제만 제공하고 삭제는 별도 검토 단계 뒤에 실행한다.
- auth-absent는 지원·Manual Only 안내만 제공하며 activate/delete intent를 만들지 않는다.
- loading, empty/not-applicable, error, maintenance, pending, replay, cleanup-pending, conflict, unauthorized가 서로 다른 fail-closed 상태로 보인다.
- quarantined MYPAGE는 일반 profile/content보다 먼저 차단되고, production `legacy`와 일반 signed-out 사용자는 quarantine에 잘못 노출되지 않는다.
- stale session은 같은 quarantine return context를 가진 login path로 연결된다.

## Evidence Limits

- 자동화 증거는 desktop Chrome, mobile Chrome과 320/390/1440 viewport를 포함한다.
- 실제 iOS/Android 물리 기기와 실제 screen reader 조작은 이 authority가 완료로 주장하지 않는다.
- production은 의도대로 `legacy` dark ship이므로 실제 `generation_active` provider 흐름과 auth-absent 운영 복구는 Manual Only로 남는다.

## Decision

- Stage 4 진행 가능 여부: **가능**
- Stage 5 `confirmed` 가능 여부: **가능**
- blocker: **0**
- 다음 행동: current implementation tree의 독립 internal 1.5, security/auth, 5축 리뷰와 local/PR current-head gate를 통과한 뒤 merge한다.
