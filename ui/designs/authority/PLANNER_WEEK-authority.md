# PLANNER_WEEK Authority Review

## planner-shell #10 Stage 5 Independent Frontend / Design Review

> 검토 역할: fresh independent Codex `design-reviewer`
> reviewer task ID: `019fefc0-6775-7222-adb2-424bd0258a71`
> 검토일: 2026-08-11
> reviewed PR / branch: PR #1331 / `feature/fe-planner-shell` (Draft, OPEN, MERGEABLE)
> reviewed exact base: `2a32d20bc45279bebbcd2cf9f201898f2edc658b`
> reviewed exact head: `2d11ad27249d05de6d21397c8787ce6f470c4219`
> reviewed exact tree: `20582227840ad500734a7566bc964abc0b9aabd3`
> reviewed exact parent: `3556375f7d5a131c7a7ea9db333b5a6b05acb922`
> 공식 tuple: 요구사항 `v1.7.30` / 화면정의서 `v1.5.34` / 유저 Flow `v1.3.32` / DB `v1.3.32` / API `v1.2.37`

> evidence:
> - `ui/designs/evidence/planner-shell/README.md`
> - `ui/designs/evidence/planner-shell/manifest.json`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-default.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-loading.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-empty.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-error.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-unauthorized.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-shopping-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-legacy-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-default-meal-log-disabled.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-default.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-loading.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-empty.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-error.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-unauthorized.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-shopping-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-legacy-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-mobile-narrow-meal-log-disabled.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-default.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-loading.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-empty.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-error.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-unauthorized.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-shopping-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-legacy-read-only.png`
> - `ui/designs/evidence/planner-shell/PLANNER_WEEK-desktop-meal-log-disabled.png`

### Verdict

**APPROVE**

- P0 blocker: **0**
- P1 major: **0**
- P2 minor: **0**
- unresolved required finding: **0**

공식 계약, 390px/320px/1280px UX, 접근성 기본 동작, 코드 품질·보안·성능·회귀, current-head delivery evidence를 대조한 결과 Stage 5를 막는 finding이 없다. 이 판정은 위 exact reviewed head/tree의 제품과 evidence만 대상으로 한다. 이 보고서를 싣는 successor publication commit은 제품 self-approval 대상으로 재해석하지 않는다.

`Design Status`는 `pending-review`로 유지한다. 이 public Stage 5 승인은 `confirmed`, final authority, Stage 6, Ready, merge, production 또는 activation 승인이 아니다.

### 독립성 및 변경 경계

- 이 task는 author, repair, generator와 다른 fresh Codex App task다.
- Claude, 제품 repair, generator, final authority, Stage 6, Ready/merge, Discord, remote production write를 수행하지 않았다.
- 제품 코드, 테스트, PNG, manifest를 수정하지 않았다. reviewer-owned 산출물은 이 보고서와 `review=5` 체크리스트 projection뿐이다.
- evidence generator task `019fefab-38cc-77b0-bcd5-00be9f024690`의 verdict `green`을 확인했다.

### Exact-head, lineage 및 delivery

| 항목 | 검증 결과 |
| --- | --- |
| reviewed local / PR head | `2d11ad27249d05de6d21397c8787ce6f470c4219` 일치 |
| reviewed tree / parent | `20582227840ad500734a7566bc964abc0b9aabd3` / `3556375f7d5a131c7a7ea9db333b5a6b05acb922` |
| base | `2a32d20bc45279bebbcd2cf9f201898f2edc658b` |
| PR lifecycle | Draft / OPEN / MERGEABLE, workpack `in_progress`, verification `pending`, auto-merge `false` |
| reviewed-head checks | raw 18 terminal: 16 SUCCESS + 2 intended SKIPPED (`lighthouse`, `full-regression`); fail/pending/cancel/neutral/rerun 0 |
| GitGuardian | SUCCESS |
| commits | Conventional subject + Lore trailers 확인 |

Manifest의 implementation tuple은 base `2a32d20b...`, product head `3556375f...`, tree `5892a3c2...`, parent `c38e0b10...`이다. reviewed head `2d11ad27...`는 그 제품 head 위에 24 PNG/README/manifest만 추가한 evidence commit이므로 두 tuple의 차이는 의도된 evidence publication lineage와 일치한다.

### 원본 PNG 및 manifest 무결성

24 PNG를 thumbnail이 아닌 original-size로 각각 직접 열어 검사했다. 파일을 다시 읽어 SHA-256, PNG signature, width/height, bytes를 독립 계산한 결과 manifest와 **24/24 일치**, 총 **1,192,681 bytes**, mismatch **0**이었다. 공통 capture timestamp는 `2026-08-11T07:24:52.810Z`다.

| viewport | original-size matrix | 검토 결과 |
| --- | --- | --- |
| mobile default | 390px × 8 states | 16px gutter, 44px target, 7-day rail, 2-day overview, 3 columns, state hierarchy와 bottom-tab clearance가 안정적이다. |
| mobile narrow | 320px × 8 states | 5 columns와 긴 텍스트/200% reflow가 세로 흐름으로 유지되고 page overflow가 없다. cold Sunday deep link는 rail `332/262/70/70` geometry에서 선택 날짜가 완전히 보인다. |
| desktop | 1280px × 8 states | 1-column plan, desktop navigation, two-day overview와 loading/empty/error/unauthorized/read-only/disabled 상태가 일관된다. |

긴 full-page 모바일 캡처에서 fixed bottom tab이 중간 콘텐츠 위에 합성되어 보이는 장면은 full-page stitching 특성이다. manifest의 viewport geometry, bottom clearance 32/72px와 focused Playwright에서 실제 마지막 action 접근성을 별도로 확인했으므로 제품 overlap finding으로 세지 않았다.

### 공식 계약 및 UX 판정

1. 기존 `/planner` route와 bottom tab 안에 정확히 `요리 계획 | 식사 기록` 두 segment만 존재한다. 새 screen, bottom tab 또는 parallel route는 없다.
2. `요리 계획`은 plan-only다. Meal Log는 unavailable panel만 렌더링하며 private planner fetch를 시작하지 않는다. `cook_done`을 consumed/goal로 표시하지 않는다.
3. plan nutrition UI와 신규 nutrition call producer는 없다. retained `GET /planner/nutrition` endpoint/decoder와 legacy compatibility contract는 삭제·변경되지 않았다.
4. legacy product는 selected-date read-only card, same-screen detail, owner delete만 제공한다. add/edit/repin/migration/cook/shop/XP/status action, 새 endpoint/field/status/error는 없다.
5. 7-day rail은 컨테이너 안에서만 가로 이동하고, cold `/planner?date=2026-07-26`의 Sunday가 320px에서도 자동 노출된다. 본문은 1/3/5 column 설정과 두 날짜 overview를 유지하며 page-level overflow가 없다.
6. loading, empty, error, unauthorized, shopping read-only, legacy read-only, Meal Log unavailable가 서로 다른 상태와 의미로 보인다. fixed bottom tab safe-area와 44px target을 지킨다.
7. #12 MEAL_LOG body/add/edit/delete/recent/frequent는 구현하지 않았다. HOME recipe-only 및 #11/#13 ownership도 건드리지 않았다.

### 접근성 및 브라우저 동작

- segment는 `tablist` / `tab` / `tabpanel`, `aria-selected`, `aria-controls` / `aria-labelledby`, selected-only `tabIndex=0`로 연결된다.
- Arrow Left/Right와 Home/End가 focus와 selection을 같이 이동하며 visible focus를 유지한다. ordinary segment selection이 panel focus를 강제로 빼앗지 않는다.
- URL `segment`/`date`가 source of truth라 deep-link와 back/forward 복원이 같은 경로를 사용한다. Playwright는 deep-link, history back, auth return을 검증했다.
- unauthenticated 진입은 segment/date/action context를 보존하고 private data를 렌더링하지 않는다.
- legacy detail bottom sheet와 delete confirmation은 focus trap, Escape, opener/fallback focus restore와 실패 시 입력/confirmation 유지 경계를 지킨다.
- screenshot은 키보드, history, focus, screen-reader announcement를 증명하지 않으므로 DOM/code와 component/Playwright evidence로 분리 판정했다.

### 코드 품질·보안·성능·회귀

- public API/schema/migration/status/error/field 파일 변경이 없고 planner shell의 navigation parser와 UI boundary에 변경이 한정된다.
- plan/log 상태 전환에 stale nutrition/product producer가 없고, initial Meal Log deep link에서 private planner fetch가 0임을 테스트로 고정한다.
- `use-dialog-boundary` 변경은 optional `fallbackFocusRef` 추가뿐이며 기존 소비자의 기본 focus restore semantics는 그대로다.
- planner data는 단일 route load 흐름을 유지하고 새 N+1/query loop, secret, direct DB write 또는 권한 완화가 없다.
- cold Sunday fixed fixture와 320px rail geometry, 200% text, bottom action clearance는 정확한 수치 assertion으로 고정돼 있다.

### 검증 증거

- focused Vitest: **5 files / 27 tests passed**
- focused Playwright: `slice-planner-shell.spec.ts`, desktop/mobile **10/10 passed**
- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `validate:source-of-truth-sync`: pass
- `validate:workflow-v2`: pass
- `validate:workpack -- --slice planner-shell`: pass
- `validate-automation-spec.mjs --slice planner-shell`: pass
- `validate:omo-bookkeeping`: pass
- `validate:closeout-sync -- --slice planner-shell`: pass
- `validate:authority-evidence-presence -- --slice planner-shell`: pass
- `git diff --check`: clean
- `pnpm audit --audit-level high`: high/critical 0; 기존 low 1 / moderate 1

첫 focused Vitest 시도는 checkout에 `node_modules`가 없어 `Command \"vitest\" not found`로 종료됐다. `pnpm install --frozen-lockfile`로 lockfile과 tracked file을 바꾸지 않고 로컬 의존성을 복원한 뒤 동일 명령이 27/27 통과했다. 이 환경 준비 실패는 제품 finding으로 계산하지 않는다.

### 제한 및 다음 단계

- physical keyboard, VoiceOver/TalkBack, 실제 320/390 device safe-area/virtual keyboard, server-Mac/OAuth, merged-exact server-production/local-rehearsal, #9 capability/R/R+1/R+2/activation은 Manual pending이다.
- static PNG는 실제 assistive technology announcement, browser timing, focus movement를 대체하지 않는다.
- workpack lifecycle은 `in_progress`, verification은 `pending`, Design Status는 `pending-review`로 유지한다.
- 다음 단계는 Stage 4/5와 다른 fresh Codex `product-design-authority` task의 final authority gate다.

---

## Historical H2 Authority Review (superseded)

> 대상 slice: `H2-planner-week-v2-redesign` Stage 5 authority review
> evidence:
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-before-mobile.png`
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile.png`
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-narrow.png`
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-mobile-scrolled.png`
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-2day-overview.png`
> - `ui/designs/evidence/H2-planner-week-v2/PLANNER_WEEK-v2-day-card-filled.png`
> - design reference: `ui/designs/PLANNER_WEEK-v2.md`
> - implementation reference: `components/planner/planner-week-screen.tsx`
> 검토일: 2026-04-17
> 검토자: product-design-authority (Stage 5 review by Codex)
> 상태: superseded — 2026-04-27 Baemin prototype parity contract에서 planner-level "가로 스크롤 없음" 잠금은 제거됨. 이 문서는 H2 당시 authority 기록으로만 사용한다.

## Verdict

- verdict: `pass`
- 한 줄 요약: `PLANNER_WEEK`는 승인된 H4/H2 방향대로 day-card 본문으로 전환됐고, 같은 날짜 4끼가 하나의 card 경계 안에서 읽히며 390px 첫 화면에서도 2일 이상 overview가 보인다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 390px에서 2일 이상 overview가 보이고, 320px narrow에서도 CTA 가림·텍스트 잘림 없이 안정적이다. |
| Interaction Clarity | 4/5 | 끼니명 → 식사명 → chip 순서가 일관되고, 같은 날짜의 4끼가 하나의 card 안에서 읽힌다. |
| Visual Hierarchy | 4/5 | shared header 이후 week context bar, weekday strip, day card 본문 위계가 분명하다. |
| Color / Material Fit | 3/5 | 브랜드 토큰과 상태 chip은 안정적이지만 planner만의 강한 개성은 아직 보수적이다. |
| Familiar App Pattern Fit | 4/5 | 날짜 카드 중심 구조가 모바일 planner 탐색에 더 자연스럽고, 가로 스크롤 제거로 학습 비용이 줄었다. |

## Evidence Notes

- before 대비 가장 큰 차이는 `2×2 grid`에서 `세로 slot row`로의 전환이다.
- `PLANNER_WEEK-v2-mobile.png`와 `PLANNER_WEEK-v2-2day-overview.png`에서 첫 화면 기준 day card 2개 이상이 동시에 읽힌다.
- `PLANNER_WEEK-v2-mobile-narrow.png`에서 320px sentinel 폭에서도 끼니명, 식사명, 인분/상태 chip이 한 행 안에서 유지된다.
- `PLANNER_WEEK-v2-mobile-scrolled.png`에서 secondary toolbar와 week context bar가 day card 스크롤과 충돌하지 않는다.
- `PLANNER_WEEK-v2-day-card-filled.png`에서 같은 날짜의 4끼가 card 경계 안에 함께 배치된다.

## Resolved Since Previous Review

| # | 항목 | 이전 문제 | 현재 상태 |
|---|------|----------|----------|
| 1 | interaction model 승인 경로 | day-card 전환은 승인 없이 진행하면 안 되는 anchor extension이었다. | 해소. H4 gate 승인과 contract-evolution 후 H2 구현으로 전환됐다. |
| 2 | 하루 단위 인지 약함 | 같은 날짜의 끼니가 grid에 흩어져 읽히는 부담이 있었다. | 해소. day card 경계 안에서 4끼가 한 덩어리로 읽힌다. |
| 3 | 2일 이상 overview 부족 | 모바일 첫 화면에서 day overview가 충분히 보이지 않았다. | 해소. 390px evidence 기준 2일 이상이 자연스럽게 노출된다. |
| 4 | horizontal scroll 의존 | planner 내부 horizontal movement 이해 비용이 있었다. | 해소. 현재 H2 baseline은 page-level / planner-level horizontal scroll이 없다. |

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | planner tone | 구조는 명확해졌지만 planner 고유의 시각적 캐릭터는 여전히 절제된 편이다. | 기능 변경과 분리된 visual polish 라운드에서 다룬다. |
| 2 | empty density | 긴 범위에서는 `비어 있음` row 반복이 누적되면 시선 피로가 생길 수 있다. | 후속 slice에서 range window 또는 empty density 완화 패턴을 검토한다. |

## Decision

- Stage 4 진행 가능 여부: `완료`
- Stage 5 confirmed 가능 여부: `가능`
- 다음 행동:
  - H2 PR closeout에서 이 authority report와 evidence E1~E6를 함께 잠근다.
  - H3에서 planner add 성공 후 특정 날짜 card focus/scroll anchoring 여부를 이 baseline에 맞춰 결정한다.
  - 5-column 대응이 실제 제품 범위로 들어오면 row 추가 방식 기준으로 별도 authority 재확인한다.

## Stage 5 Conclusion (H2)

- **신규 blocker**: 없음
- **신규 major**: 없음
- **신규 minor**: 없음
- **잔존 major**: 없음
- **최종 verdict**: `pass`
- `PLANNER_WEEK` H2 day-card baseline은 현재 evidence와 구현, 설계 문서가 서로 일치한다.
