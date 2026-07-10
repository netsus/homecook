# AUTH_PROVIDER_MEMORY_LINKING Stage 5 public design review

> verdict: pass (public Stage 5; independent final authority gate pending)
>
> evidence:
> - `ui/designs/evidence/auth-provider-memory-linking/before/LOGIN-390.png`
> - `ui/designs/evidence/auth-provider-memory-linking/before/LOGIN-320.png`
> - `ui/designs/evidence/auth-provider-memory-linking/before/LOGIN-1440.png`
> - `ui/designs/evidence/auth-provider-memory-linking/before/MYPAGE-390.png`
> - `ui/designs/evidence/auth-provider-memory-linking/before/MYPAGE-320.png`
> - `ui/designs/evidence/auth-provider-memory-linking/before/MYPAGE-1440.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-dialog-390.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-dialog-320.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-dialog-1440.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-safe-error-390.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-safe-error-320.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/LOGIN-safe-error-1440.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/MYPAGE-linked-error-390.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/MYPAGE-linked-error-320.png`
> - `ui/designs/evidence/auth-provider-memory-linking/after/MYPAGE-linked-error-1440.png`

## Review 범위

이 문서는 구현 세션과 분리된 Codex 세션의 public Stage 5 디자인 리뷰다. PR #968 current head의 fixture 화면을 320px, 390px, 1440px에서 다시 캡처하고 코드·접근성·상태 UI를 검토했다. 이 verdict는 `confirmed`, `final_authority_gate`, Stage 6, Ready for Review 또는 merge 승인이 아니다.

## Scorecard

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| Mobile UX | 통과 | 320px dialog와 account surface에서 가로 넘침·CTA 잘림 없음 |
| Interaction clarity | 통과 | 최근 provider와 다른 계정 계속의 선택이 OAuth 전에 분리됨 |
| Visual hierarchy | 통과 | remembered provider가 강조되지만 계정 소유를 암시하지 않음 |
| Color/material fit | 통과 | 기존 Homecook surface/token과 provider 고유 버튼 스타일 유지 |
| Familiar app pattern fit | 통과 | 중앙 dialog, ESC/backdrop/cancel, focus 복귀와 focus trap 제공 |

## Findings

- Blocker: 0
- Major: 0
- Minor: 0

## Stage 5 findings와 조치

| Severity | Finding | 근거 | 조치 |
| --- | --- | --- | --- |
| Major | 연결 진행 중 모든 미연결 provider action이 비활성화되어 해당 action만 pending이어야 하는 계약과 불일치 | `components/auth/linked-auth-providers.tsx` | 선택 provider만 disabled하도록 수정하고 Vitest 회귀 테스트 추가 |
| Major | `MYPAGE-linked-error-*` evidence가 실제로 `/settings`만 캡처했고 390/1440 파일은 current-head 실행에서 갱신되지 않음 | `tests/e2e/slice-auth-provider-memory-linking.spec.ts` | exact 320/390/1440 viewport를 강제하고 desktop은 `/mypage` 환경설정 탭, mobile은 실제 `/settings` 계정 surface에서 재캡처 |
| Major | PR quality gate가 금지 문구와 raw color class 때문에 실패 | `components/auth/linked-auth-providers.tsx`, `components/auth/social-login-buttons.tsx` | 친근한 복구 문구와 `--overlay-40` / `--text-inverse` 토큰으로 교체 |

## Public Stage 5 확인 결과

- 320px dialog의 세 action이 viewport 안에 표시되고 각 action은 44px 이상이다.
- ESC 취소 후 원래 선택 provider 버튼으로 focus가 복귀하는 Playwright 검증이 통과했다.
- recent provider copy는 브라우저 사용 기록임을 명시하고 이메일·사용자 식별자를 표시하지 않는다.
- link pending은 provider action만 disabled하며 account page 전체를 막지 않는다.
- 연결된 provider는 `연결됨`과 `읽기 전용` 텍스트로 표시되고 unlink/primary 변경 UI가 없다.
- safe auth/link error는 provider/email/user id/raw payload 없이 복구 문구만 표시한다.
- exact 320px, 390px, 1440px fixture에서 document-level horizontal overflow가 없다.
- dialog의 모든 action은 44px 이상이며 ESC, 취소, backdrop에서 OAuth 이동 없이 원래 provider button으로 focus가 복귀한다.
- Shift+Tab/Tab이 dialog action 내부에서 순환한다.
- 연결 pending은 선택 provider action만 disabled하며 다른 provider action은 보이거나 비활성화되지 않는다. 중복 호출은 pending guard로 차단한다.
- desktop MYPAGE 환경설정 탭과 mobile SETTINGS의 기존 계정 삭제 정보 구조·CTA에는 시각 회귀가 없다.

## Visual verdict

- LOGIN dialog: 94 / pass
- LOGIN safe error: 93 / pass
- MYPAGE/SETTINGS linked-provider surface: 92 / pass
- category match: true
- blocker / major / minor unresolved: 0 / 0 / 0

## 다음 행동

public Stage 5는 approve한다. Design Status는 `pending-review`로 유지하고, 독립 `final_authority_gate`가 blocker 0과 이 report를 확인한 뒤에만 `confirmed`로 바꿀 수 있다. Stage 6, Draft 해제, Ready for Review, merge는 이 세션의 범위가 아니다. hosted manual linking과 live OAuth E1/E3/E4/E5는 이 verdict의 통과 근거가 아니다.
