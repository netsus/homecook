# APP_SHELL_YOUTUBE_NOTIFICATIONS Final Product Design Authority

> 대상 slice: `youtube-async-extraction-notification`
> 검토 역할: fresh independent final design authority
> reviewer task: `/root/youtube_focus_design_rereview`
> 검토일: 2026-08-14
> reviewed publication head: `a76df8f8e3d342968cf920cedb9289b8546018f0`
> reviewed implementation head/tree: `3c1e0d422b0849f7f086d1b7fefc55bac41eee60` / `ee5e40de5c9de3e5bbbda766d233c7f118a2df3f`
>
> evidence:
> - `ui/designs/evidence/34c-growth-notification-ui/mobile-390.png`
> - `ui/designs/evidence/34c-growth-notification-ui/mobile-320.png`
> - `ui/designs/evidence/34c-growth-notification-ui/desktop-1440.png`
> - `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-390-success-toast.png`
> - `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-320-failure-panel.png`
> - `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-320-global-toast-handoff.png`
> - `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/desktop-1440-archive.png`
> - `ui/designs/evidence/youtube-async-extraction-notification/manifest.json`
> - `ui/designs/evidence/youtube-async-extraction-notification/exploratory-qa.json`

## Verdict

- verdict: `FINAL_AUTHORITY_APPROVED`
- blocker_count: `0`
- major_count: `0`
- minor_count: `0`
- confirmed_allowed: `true`
- reviewed_screen_ids: `APP_SHELL_YOUTUBE_NOTIFICATIONS`
- 한 줄 요약: success/failure/expired/consumed 결과가 toast, badge, durable list로 복구되고 좁은 화면에서는 YouTube와 Growth 알림을 한 카드씩 직렬화하며 focus·scroll·CTA ownership을 안전하게 유지한다.

## Scorecard

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| Mobile UX | Pass | 320px 단일-card handoff와 390px toast/list에서 CTA 가림, page overflow, panel footer 가림이 없다. |
| Interaction clarity | Pass | draft/consumed/retryable/non-retryable/expired가 각각 정확한 destination과 `can_retry` 기준 행동만 노출한다. |
| Visual hierarchy | Pass | badge→toast→durable list의 중요도와 unseen/archive 구분이 명확하고 기존 Growth presentation slot과 충돌하지 않는다. |
| Accessibility | Pass | `aria-live="polite"`, icon+text, 44px controls, dialog focus trap/Escape/return과 non-forced initial focus가 유지된다. |
| Recovery | Pass | app 재실행·재로그인·foreground 뒤 unseen 결과를 복구하며 private title/count/thumbnail은 unauthorized 상태에 노출하지 않는다. |
| Familiar pattern fit | Pass | desktop drawer/stack과 mobile panel/toast가 기존 app shell navigation과 notification 패턴을 재사용한다. |

## Focus Finding Resolution

- 최초 authority finding은 center가 닫힌 상태로 처음 mount될 때 기존 page focus를 header trigger로 옮기는 문제였다.
- `triggerBeforeOpenRef.current`가 없으면 close-focus effect가 즉시 끝나도록 수리해 최초 mount는 focus를 건드리지 않는다.
- 실제 open→close는 invoker로 한 번 복귀하고, invoker가 DOM에서 제거된 경우에만 stable header/global trigger fallback을 사용한다.
- 최초 mount, Escape close, disconnected opener의 세 회귀가 테스트로 유지된다.

## Evidence Integrity

Automation-spec visual mapping:

- `before:ui/designs/evidence/34c-growth-notification-ui/mobile-390.png`
- `before:ui/designs/evidence/34c-growth-notification-ui/mobile-320.png`
- `before:ui/designs/evidence/34c-growth-notification-ui/desktop-1440.png`
- `after:ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-390-success-toast.png`
- `after:ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-320-failure-panel.png`
- `after:ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/desktop-1440-archive.png`
- `ui/designs/evidence/youtube-async-extraction-notification/manifest.json`
- manifest: `ui/designs/evidence/youtube-async-extraction-notification/manifest.json`

- screenshot capture source는 `2113dacdbb464f6422424324a38823e8c3d6933a` / tree `ed823a064774dee538df8cde47c483af08efa7dc`다.
- focus-only guard는 markup/style/copy/geometry와 screenshot generator를 바꾸지 않는다. 320px 6장, 390px 20장, desktop 4장의 PNG 30개 존재와 대표 캡처를 독립 재검토했다.
- current implementation 관련 5-file Vitest `89 passed`; 전체 Vitest `6,160 passed / 459 skipped`, product `2,741 passed / 175 skipped`다.

## Findings

- Blocker: 없음.
- Major: 없음.
- Minor: 없음.

## Honest Remaining Gates

- physical device VoiceOver/TalkBack, 실제 safe-area·가상 키보드는 Manual Only다.
- production full-local migration, credential 발급, worker 설치·start·rollout은 이 판정에서 실행하지 않았다.
- Supabase Cloud/linked/remote target은 Manual Only가 아니라 forbidden/N/A다.
