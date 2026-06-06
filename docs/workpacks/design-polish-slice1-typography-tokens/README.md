# Slice: design-polish-slice1-typography-tokens

## Goal
앱 전역의 타이포그래피 weight가 과도하게 무거워 본문과 제목의 시각적 위계가 불분명하고 가독성이 떨어지는 문제를 해결한다. font-weight 기본값을 한 단계씩 경량화하여 사용자가 텍스트를 편하게 읽을 수 있게 한다.
동시에 레거시 `--olive` 직접 참조와 하드코딩 hex 색상을 현재 역할 토큰(`--brand`, `--brand-primary` 등)으로 일원화하여, 향후 앱 전체의 색상·타이포 조정이 globals.css 토큰 한 곳에서 이루어지도록 정비한다. 웹 토큰은 변경하지 않으며, 제거된 Jua 브랜드 폰트는 복원하지 않는다.

## Branches

- 백엔드: N/A (FE-only visual/token cleanup)
- 프론트엔드: `feature/fe-design-polish-slice1-typography-tokens`

## In Scope
- 화면: 앱 전역 (globals.css 토큰 + 모든 컴포넌트의 font-weight / `--olive` 사용처)
- API: 없음
- 상태 전이: 없음
- DB 영향: 없음
- Schema Change:
  - [x] 없음 (읽기 전용)
  - [ ] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

### 세부 범위

1. **앱 전역 font-weight 경량화**
   - Tailwind `font-bold` (700) / `font-extrabold` (800) / `font-black` (900) 사용처를 전수 조사하고, 가독성 기준으로 한 단계씩 낮춘다.
   - globals.css의 `--app-font-action: 700` → `600`, `--app-font-strong: 800` → `700` 등 글로벌 토큰 기본값을 재조정한다.
   - `text-xs` ~ `text-3xl` 스케일의 weight 가이드라인을 실제 코드와 정합시킨다.
   - 히어로/화면 제목(text-xl, text-2xl, text-3xl)은 700 이하, 본문/버튼(text-base)은 400~500, 카드 메타(text-sm)는 400~500 기준을 원칙으로 한다.

2. **`--olive` 앱 직접 사용 제거**
   - globals.css의 `--olive: var(--brand-primary)` alias는 현재 유지되어 있지만, 컴포넌트 코드에서 `var(--olive)` / `text-olive` / `bg-olive` 등을 직접 참조하는 곳을 현재 역할 토큰(`--brand`, `--brand-primary`, `--brand-soft`, `--brand-deep` 등)으로 교체한다.
   - `@theme inline` 블록의 `--color-olive` 등록도 제거 대상으로 평가한다.
   - 오래된 C2 / additive 시절 hex 값(`#1f6b52`, `#6e7c4a` 등)이 직접 하드코딩된 곳이 있으면 역할 토큰으로 교체한다.

3. **글로벌 앱 토큰 중앙화 강화**
   - 컴포넌트별로 흩어진 직접 hex 색상을 globals.css 역할 토큰으로 교체한다 (앱 표면만).
   - 웹 `--web-*` 토큰은 변경하지 않는다.
   - Jua 브랜드 폰트는 의도적으로 복원하지 않는다.

## Out of Scope
- HOME 모달 레이아웃/색상 수정
- 앱 셸 하단 탭/헤더 동작 수정
- RECIPE_DETAIL 컨트롤/메트릭 색상 (역할 토큰 교체 제외)
- Planner/menu picker 모달 동작
- 수동/유튜브 레시피 생성 UX
- Cooking mode 레이아웃/서빙 로직
- Mypage/settings/account 네비게이션 버그
- API, DB, auth, 상태 전이 계약 변경
- 웹 색상 리디자인 (`--web-*` 토큰, 1024px 미디어 블록)
- 프로토타입 font-family 변경 (현재 sans-serif 스택 유지)
- 새로운 색상 토큰 도입 (기존 역할 토큰만 사용)

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `wave1-derived-state-ui-prep` | merged | [x] |

> 모든 선행 슬라이스가 `merged` 상태. 이 슬라이스는 기존 앱 토큰 인프라(`app/globals.css`)를 기반으로 하며, 이전 슬라이스들이 모두 merged 상태이므로 착수 가능.

## Backend First Contract

N/A — 이 슬라이스에 백엔드 변경 없음. FE-only visual/token cleanup.

## Frontend Delivery Mode
- 기능 변경 없음: 기존 화면의 시각적 weight/token 교체만 수행
- 필수 상태: 기존 `loading / empty / error / read-only / unauthorized` 유지 (신규 추가 없음)
- 로그인 보호 액션: 해당 없음

## Design Authority
- UI risk: `low-risk`
- Anchor screen dependency: `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK` (visual verification 대상, 구조 변경 아님)
- Visual artifact: Stage 4에서 대표 앵커 화면 before/after screenshot 제공 예정
- Authority status: `not-required`
- Notes: 이 슬라이스는 font-weight 경량화와 token alias 교체만 수행한다. 화면 레이아웃, 정보 구조, interaction model을 변경하지 않으므로 anchor-extension이 아니라 low-risk app-wide visual cleanup이다. design-generator / design-critic은 신규 화면이나 high-risk UI change가 아니므로 생략한다. Stage 4 완료 시 앵커 화면 3곳(HOME, RECIPE_DETAIL, PLANNER_WEEK)의 mobile default + narrow before/after screenshot으로 regression 검증만 수행한다.

## Design Status

- [ ] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비 상태
- [x] 확정 (confirmed) — Stage 5 public review 통과 후, authority-required면 final authority gate까지 통과, Tailwind/공용 컴포넌트 정리 완료, authority blocker 0개
- [ ] N/A — BE-only 슬라이스 (FE 화면 없음, Stage 4~6 스킵)

> 이 슬라이스는 기존 confirmed 앵커 화면의 low-risk token/weight 교체만 수행하며, 신규 화면이나 구조 변경은 없다.
> `temporary`에서 시작했고, Stage 4 완료 후 Stage 5 lightweight design check와 Claude approve-with-nits 리뷰를 거쳐 Codex가 합리적 지적을 반영했다.

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md` — 확정 토큰 기준
- `ui/designs/WAVE1_MOBILE_APP_BASELINE.md` — Wave1 mobile target tokens
- `app/globals.css` — 앱 런타임 토큰 단일 소스

## QA / Test Data Plan
- fixture baseline: 기존 fixture 그대로 사용 (데이터 변경 없음)
- real DB smoke 경로: `pnpm dev:demo` — 토큰 교체 후 시각적 regression 확인
- seed / reset 명령: 해당 없음 (DB 변경 없음)
- bootstrap이 생성해야 하는 시스템 row: 해당 없음
- blocker 조건: 없음

### 검증 전략
- `pnpm lint` + `pnpm typecheck` — 정적 분석 통과
- `pnpm verify:frontend` — 기존 Vitest + Playwright 테스트 전체 통과 (regression 확인)
- 대표 앵커 화면(HOME, RECIPE_DETAIL, PLANNER_WEEK) mobile default (390px) + narrow (320px) before/after screenshot 비교
- font-weight 변경 전후 가독성 주관적 확인 (manual QA)

## Key Rules
- **앱 표면만 변경**: 웹 `--web-*` 토큰과 1024px 미디어 블록 내 스타일은 건드리지 않는다.
- **Jua 미복원**: 브랜드 폰트 Jua는 의도적으로 제거된 상태이며 복원하지 않는다.
- **`--olive` 직접 참조 금지**: `var(--olive)`, `text-olive`, `bg-olive` 등의 직접 사용을 `var(--brand)` / `var(--brand-primary)` 등 역할 토큰으로 교체한다. globals.css의 `--olive: var(--brand-primary)` alias 자체는 호환성을 위해 당분간 유지할 수 있으나, 컴포넌트 코드에서의 직접 참조를 제거하는 것이 목표다.
- **역할 토큰 사용 원칙**: 컴포넌트에서 직접 hex 색상(`#00A1FF` 등)을 사용하지 않고, `var(--brand)`, `var(--brand-primary)`, `var(--text-2)` 등 역할 토큰을 사용한다.
- **font-weight 기준**:
  - 화면 제목 (text-xl, text-2xl): `700` 이하
  - 소제목 (text-lg): `600~700`
  - 본문/버튼 (text-base): `400~500`
  - 카드 메타 (text-sm): `400~500`
  - 배지/태그 (text-xs): `500~600`
- **regression 금지**: 기존 Vitest / Playwright 테스트가 전부 통과해야 한다. 시각적 regression은 앵커 화면 screenshot으로 확인한다.

## Contract Evolution Candidates (Optional)

없음. 공식 문서 변경 불필요.

## Primary User Path
1. 사용자가 앱의 아무 화면을 연다 (HOME, RECIPE_DETAIL, PLANNER_WEEK 등).
2. 텍스트가 이전보다 가볍고 읽기 편해진 것을 체감한다. 굵은 제목이 과하지 않고, 본문과 보조 텍스트의 위계가 더 자연스럽다.
3. 색상이 일관되게 앱 브랜드 토큰을 따르며, 이전 olive 등 레거시 색상이 의도치 않게 튀는 부분이 없다.

## Delivery Checklist
> 이 체크리스트는 Stage 4~6 동안 계속 갱신하는 living closeout 문서다.
> 백엔드 항목은 N/A (FE-only 슬라이스).

- [x] 앱 전역 font-weight 토큰 재조정 (globals.css) <!-- omo:id=dp1-font-weight-tokens;stage=4;scope=frontend;review=5,6 -->
- [x] Tailwind font-weight theme token 적용 (컴포넌트 클래스 대량 변경 없이 한 단계 경량화) <!-- omo:id=dp1-font-weight-classes;stage=4;scope=frontend;review=5,6 -->
- [x] `--olive` 직접 참조 제거 (컴포넌트 코드) <!-- omo:id=dp1-olive-removal;stage=4;scope=frontend;review=5,6 -->
- [x] `@theme inline` olive 등록 정리 평가 <!-- omo:id=dp1-theme-olive-cleanup;stage=4;scope=frontend;review=5,6 -->
- [x] 레거시 브랜드/olive 하드코딩 hex 색상 → 역할 토큰 교체 <!-- omo:id=dp1-hex-to-token;stage=4;scope=frontend;review=5,6 -->
- [x] 앵커 화면 screenshot 생성 및 visual snapshot 갱신 <!-- omo:id=dp1-anchor-screenshots;stage=4;scope=frontend;review=5,6 -->
- [x] `pnpm lint` + `pnpm typecheck` 통과 <!-- omo:id=dp1-lint-typecheck;stage=4;scope=frontend;review=6 -->
- [x] `pnpm verify:frontend` 통과 (Vitest + Playwright regression) <!-- omo:id=dp1-verify-frontend;stage=4;scope=frontend;review=6 -->
- [x] `loading / empty / error / read-only` 기존 상태 UI 유지 확인 <!-- omo:id=dp1-state-ui-preserved;stage=4;scope=frontend;review=5,6 -->
- [x] Codex 수동 시각적 가독성 확인 (mobile default + narrow snapshot) <!-- omo:id=dp1-manual-readability;stage=4;scope=frontend;review=5,6 -->

## Stage 5/6 Evidence

- Claude review: `.omx/artifacts/claude-delegate-design-polish-slice1-typography-tokens-stage5-review-response-2026-05-19T12-24-31Z.md` (`approve-with-nits`, nits 반영)
- Visual snapshots: `pnpm test:e2e:visual:update` 통과, HOME / ingredient filter modal / login gate mobile snapshots 갱신
- Manual visual check: `view_image`로 HOME, ingredient filter modal, RECIPE_DETAIL, PLANNER_WEEK snapshot 확인
- Real smoke: `pnpm dev:demo -- -p 3021` 실행 후 `/`, `/recipe/mock-kimchi-jjigae`, `/planner` HEAD 200 확인
- Regression: `pnpm verify:frontend` 통과 후 Claude nits 반영, 이후 `pnpm lint`, `pnpm typecheck`, targeted Vitest 57 tests 통과
- Token scan: `var(--olive)`, `text-olive`, `bg-olive`, `font-black`, legacy brand hex 직접 참조 0건
