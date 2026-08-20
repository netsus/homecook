# APP_SHELL_YOUTUBE_NOTIFICATIONS — Stage 1 Design Critic Record

## Verdict

🟢 **PASS — implementation-ready design contract, not product authority approval**

- blocker: 0
- major: 0
- minor: 0
- reviewed artifact: `ui/designs/APP_SHELL_YOUTUBE_NOTIFICATIONS.md`
- reviewed contract: official requirements `1.7.32`, screen `1.5.36`, Flow `1.3.34`, DB `1.3.34`, API `1.2.39`
- provenance: Stage 1 docs task; 독립 internal 1.5/Stage 5/final authority를 대신하지 않는다.

## Review Findings

1. toast를 ephemeral 안내, unseen list를 durable authority로 분리하고 delivered와 seen을 혼합하지 않았다.
2. growth notification은 layout reference만 허용하며 source collection과 mutation authority를 합치지 않는 경계가 분명하다.
3. 공식 화면 계약의 success draft CTA `결과 확인`을 포함해 consumed/retryable 상태별 CTA가 정해지고 `can_retry=false`에는 retry CTA가 없다.
4. 390 mobile baseline, 320 narrow, desktop 1440, panel 내부 scroll containment, bottom tab/safe-area, focus trap/return이 명시됐다.
5. private count/title/thumbnail nondisclosure, title fallback, icon+text, `aria-live=polite`, reduced motion이 포함됐다.
6. Stage 4 before/after evidence matrix와 두 번째 authority report 경로가 독립적으로 지정됐다.

## Decision

Stage 4 구현 입력으로 승인한다. 실제 list recovery, delivered/seen mutation, overflow와 a11y evidence는 아직 없으므로 Design Status는 `temporary`다. final authority는 current frontend head의 두 required screen을 함께 보고 blocker/major 0일 때만 PASS할 수 있다.

## Stage 4 implementation synchronization

- 확정 구현과 evidence에 맞춰 narrow CTA를 full-width가 아닌 최소 44px의 compact content-width control로 기록했다.
- desktop toast 위치를 실제 공통 shell presentation slot의 우하단으로 동기화했다.
- `320px` 동시 알림은 최대 한 채널만 완전 표시하고 YouTube → growth 순으로 넘기며, 대기 채널은 delivery/seen 타이머를 시작하지 않는 것으로 잠갔다.
- 이 동기화는 Stage 4 실제 구현 설명이며 Stage 5/final authority 승인이나 Design Status `confirmed`를 뜻하지 않는다.
