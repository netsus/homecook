# APP_SHELL_YOUTUBE_NOTIFICATIONS — Stage 1 Design Decision Record

## Decision

app shell에 YouTube 추출 작업 전용 toast, badge, durable list/panel을 추가한다. toast는 일시적 안내이고 서버의 unseen list가 복구 authority다. 기존 growth notification은 배치·밀도 참고만 하며 데이터, delivered/seen, badge authority를 합치지 않는다. 이 문서는 design-generator 산출물이자 구현 계약이고 final authority 승인이 아니다.

- UI risk: `high-risk`
- Design Status: `temporary`
- Anchor dependency: 없음. 전역 shell을 확장하지만 `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` anchor screen의 정보 구조는 바꾸지 않는다.
- Primary CTA: 성공 draft `레시피 확인`, consumed success `레시피 보기`, retryable failure/expired `다시 시도`
- Mobile baseline: `390px`; narrow 검증: `320px`; desktop 검증: `1440px`
- Scroll containment: toast stack은 viewport에 고정하되 content/하단 탭을 가리지 않고, panel/list 내부만 스크롤하며 page-level double scroll을 만들지 않는다.

## Information Architecture

```text
App shell
├─ YouTube 작업 버튼 + unseen badge
├─ foreground terminal toast (ephemeral, delivered)
└─ YouTube 작업 panel/list (durable authority)
   ├─ 진행 중
   ├─ 완료/실패/만료 unseen 우선
   └─ 30일 archive
```

growth toast와 시각 계층은 가까워도 source collection, delivery key, delivered/seen mutation은 분리한다. private count/title/thumbnail은 로그인 세션에서만 렌더한다.

## Mobile 390 Wireframe

```text
┌──────────────────────────────────────┐
│ 집밥                    [작업 🔔 2]  │ unseen badge
├──────────────────────────────────────┤
│                                      │
│ page content                         │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ✓ YouTube 레시피 추출 완료       │ │ aria-live=polite
│ │ 김치찌개                          │ │
│ │ [레시피 확인]                    │ │ primary CTA
│ └──────────────────────────────────┘ │
│                                      │
├──────────────────────────────────────┤
│ 홈  장보기  플래너  마이             │
└──────────────────────────────────────┘

작업 panel
┌──────────────────────────────────────┐
│ YouTube 작업                    [×] │
│ 진행 중 1 · 새 소식 2               │
│ ┌──────────────────────────────────┐ │
│ │ 완료 · 김치찌개                  │ │
│ │ [레시피 확인]                    │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 실패 · YouTube 레시피            │ │
│ │ 다시 시도할 수 없어요            │ │ no retry CTA
│ └──────────────────────────────────┘ │
│ [지난 작업 보기]                    │
└──────────────────────────────────────┘
```

## Narrow 320 Adaptation

- toast는 한 번에 최대 1개만 완전 표시하고 나머지는 badge/list에서 회복한다.
- title은 최대 2줄, null 또는 정제 실패는 `YouTube 레시피` fallback을 쓴다.
- CTA는 card 아래 full-width로 내려 44px tap target과 safe-area를 보존한다.
- panel header/footer를 고정할 경우 body만 스크롤하고 primary CTA가 footer에 가리지 않게 한다.

## Desktop Adaptation

- toast는 우상단의 제한 폭 stack, panel은 우측 drawer 또는 동일 정보 구조의 popover를 사용한다.
- 최대 visible toast 수와 간격은 shell token을 따르며 content primary CTA를 덮지 않는다.
- panel focus trap, Escape close, trigger focus return을 제공한다.

## State And Destination Matrix

| 서버 projection | 표현 | primary CTA |
| --- | --- | --- |
| queued/processing | 진행 중, unseen terminal count와 분리 | 작업 상세/목록 |
| succeeded + draft | 완료 + title/thumbnail | `레시피 확인` → review path |
| succeeded + consumed recipe | 등록 완료 | `레시피 보기` → recipe path |
| failed + `can_retry=true` | safe failure copy | `다시 시도` |
| failed + `can_retry=false` | safe failure copy | retry CTA 없음 |
| expired + `can_retry=true` | 보관 기간 만료 | `다시 시도` |
| consumed-after-TTL | succeeded destination | `레시피 보기`; retry 없음 |
| empty | 완료된 작업 없음 | panel close/navigation |
| list error/offline | cached private detail 추측 금지 | 안전 재시도 |
| unauthorized | badge/title/thumbnail 0 노출 | LOGIN + return-to-action |

## Delivered, Seen, Archive

- 실제 toast가 렌더된 delivery key만 delivered batch에 포함한다.
- delivered 성공은 seen이 아니다. badge는 사용자가 list/card/CTA를 확인해 seen mutation이 성공한 뒤 줄어든다.
- already-delivered/seen, 없는 값, 타인 값은 UI에서 존재 차이를 드러내지 않는다.
- archive는 terminal 30일 범위의 durable list이고 infinite cursor order를 바꾸지 않는다.
- exhaustive public failure code 외 내부 정보, provider payload, policy/HMAC/worker 정보를 렌더하지 않는다.

## Interaction And Accessibility

- toast region은 `aria-live="polite"`, `aria-atomic`을 필요한 카드 단위로 사용하고 focus를 강제로 이동하지 않는다.
- 상태는 icon+text로 표현한다. 색만으로 성공/실패/만료를 구분하지 않는다.
- keyboard order는 shell trigger → panel close → list items → CTA → archive다.
- reduced motion에서는 toast slide를 제거하고 즉시 나타남/사라짐을 사용한다.
- 200% text와 narrow 320에서 badge, toast, panel footer, bottom tab이 겹치지 않아야 한다.

## Evidence Plan

| viewport/state | before layout reference | Stage 4 after target |
| --- | --- | --- |
| mobile 390 | `ui/designs/evidence/34c-growth-notification-ui/mobile-390.png` | `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-390-success-toast.png` |
| narrow 320 | `ui/designs/evidence/34c-growth-notification-ui/mobile-320.png` | `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/mobile-320-failure-panel.png` |
| desktop 1440 | `ui/designs/evidence/34c-growth-notification-ui/desktop-1440.png` | `ui/designs/evidence/youtube-async-extraction-notification/APP_SHELL_YOUTUBE_NOTIFICATIONS/desktop-1440-archive.png` |

Stage 4는 success draft/consumed/failure retryable/non-retryable/expired/empty/offline/unauthorized, delivered-vs-seen, keyboard focus를 캡처하고 exact frontend head SHA를 manifest에 남긴다.

## Generator Handoff

- owner: Stage 4 frontend implementer
- required review: 독립 authority precheck → Stage 5 design/quality → 별도 final product-design-authority
- authority report: `ui/designs/authority/APP_SHELL_YOUTUBE_NOTIFICATIONS-authority.md`
- blocker: durable list recovery, 390/320/desktop, primary CTA/retry gate, scroll containment, a11y가 모두 증명되기 전 `confirmed` 금지
