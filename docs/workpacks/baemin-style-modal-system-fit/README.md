# baemin-style-modal-system-fit

> Modal/sheet 오버레이 패밀리의 배민 스타일 시각 정합 슬라이스.
> 앵커 화면 리트로핏(HOME, RECIPE_DETAIL, PLANNER_WEEK) 완료 이후, 모달/시트 표면이 동일한 토큰·프리미티브 시스템을 사용하도록 맞춘다.
> H5 Quiet Kitchen modal 결정(D1-D6)은 보존하며, 기능/API/DB/상태 전이 변경 없음.
> Stage 2/3 are N/A (no backend). Implementation is Stage 4 (Claude). Review is Stage 5/6 (Codex).

## Goal

앵커 화면 3종(HOME, RECIPE_DETAIL, PLANNER_WEEK)의 배민 스타일 리트로핏이 완료된 상태에서, 이 화면들 위에 overlay되는 모달/시트 패밀리가 동일한 배민 스타일 토큰과 공유 프리미티브를 사용하도록 시각적 정합을 완성한다.

H5 Quiet Kitchen 결정(D1~D6)은 잠겨 있다. 이 슬라이스는 H5 결정을 변경하지 않고, 토큰 일관성·surface 톤·shadow/radius 정합·공유 프리미티브 소비만 다룬다.

핵심 정합 항목:

1. **LoginGateModal**: 현재 H5 ModalHeader를 사용하지 않는다. H5 패밀리에 합류시킨다 — icon-only 44x44 close, eyebrow 제거 검토, ModalHeader 소비.
2. **Modal 공유 컴포넌트(ModalHeader, ModalFooterActions)**: 배민 스타일 토큰 shadow/radius/surface 일관성 검증. 이미 토큰 기반이므로 미세 조정만 예상.
3. **IngredientFilterModal, PlannerAddSheet, SaveModal, SortSheet(home-screen.tsx)**: 이미 H5 + 토큰 기반이나, 앵커 화면 리트로핏 이후 달라진 토큰 값(`--brand`, `--brand-deep`, `--brand-soft`)과의 시각적 정합 확인 및 필요 시 미세 조정.

## Branches

| Type | Branch |
| --- | --- |
| Docs | `docs/baemin-style-modal-system-fit` |
| Implementation | `feature/fe-baemin-style-modal-system-fit` |

## Stage Owner Mapping

| Stage | Name | Owner | Status |
| --- | --- | --- | --- |
| 1 | Workpack README + acceptance | **Claude** | this workpack |
| 2 | Backend implementation | N/A | no backend in this slice |
| 3 | Backend PR review | N/A | no backend in this slice |
| 4 | Frontend / modal system fit implementation | **Claude** | visual fit |
| 5 | Design review | **Codex** | authority evidence, a11y, visual regression |
| 6 | Frontend PR review / closeout | **Codex** | final review and merge |

## In Scope

### Modal/Sheet Visual Fit

다음 모달/시트 파일을 배민 스타일 토큰 시스템과 시각적으로 정합한다. H5 결정(D1~D6)을 보존하면서 앵커 화면 리트로핏 이후의 토큰 환경에 맞춘다.

| Target | File | Fit scope |
| --- | --- | --- |
| ModalHeader | `components/shared/modal-header.tsx` | shadow/radius/surface 토큰 일관성 검증, 필요 시 미세 조정 |
| ModalFooterActions | `components/shared/modal-footer-actions.tsx` | olive CTA + cancel 버튼 토큰 일관성 검증, shadow/radius 정합 |
| IngredientFilterModal | `components/home/ingredient-filter-modal.tsx` | 패널 surface, skeleton, footer 영역 토큰 정합 |
| SortMenu (mobile sheet) | `components/home/home-screen.tsx` (sort sheet/menu only) | 모바일 시트 surface/shadow/radius 토큰 정합 |
| PlannerAddSheet | `components/recipe/planner-add-sheet.tsx` | 패널 surface, loading skeleton, error state 토큰 정합 |
| SaveModal | `components/recipe/save-modal.tsx` | 패널 surface, book row selected state, error/loading 토큰 정합 |
| LoginGateModal | `components/auth/login-gate-modal.tsx` | **H5 ModalHeader 소비 전환**, close button → icon-only 44x44, eyebrow("보호된 작업") 제거, surface/shadow/radius 토큰 정합 |

### LoginGateModal H5 합류

LoginGateModal은 현재 H5 ModalHeader를 사용하지 않고 자체 header를 구현하고 있다:
- 텍스트 "닫기" 버튼 (pill shape) → icon-only 44x44 close 전환
- "보호된 작업" eyebrow badge → H5 D2 기준 제거
- 자체 header 구조 → ModalHeader 공유 컴포넌트 소비

이 전환은 H5 D2(eyebrow 제거), D3(icon-only close), D6(modal family 통일) 결정의 자연 확장이다.

### Token Fit Verification

모든 모달/시트에서 다음 토큰 사용을 검증한다:

| 토큰 카테고리 | 검증 항목 |
| --- | --- |
| Surface | `--panel`, `--surface`, `--surface-fill`, `--surface-subtle` 일관 사용 |
| Shadow | `--shadow-1`, `--shadow-2`, `--shadow-3` 일관 사용 |
| Radius | `--radius-sm/md/lg/xl/full` 일관 사용 |
| Border | `--line` 일관 사용 |
| Text | `--foreground`, `--muted`, `--text-2`, `--text-3` 일관 사용 |

### H5 Decision Preservation

| # | 결정 | 보존 방법 |
| --- | --- | --- |
| D1 | accent = olive base + thin orange highlight | olive CTA 유지, orange 허용 범위 준수 |
| D2 | 인터랙션 모달 eyebrow 기본 제거 | LoginGateModal eyebrow 제거로 통일 |
| D3 | close = icon-only 44x44 | LoginGateModal close 전환 |
| D4 | 날짜 chip = 요일 + M/D | PlannerAdd 변경 없음 |
| D5 | Save 제목 = 레시피 저장 | SaveModal 변경 없음 |
| D6 | modal family 통일 | LoginGateModal 합류로 완성 |

### Other In-Scope Items

- `components/ui/` 공유 프리미티브(`Skeleton` 등) 소비 가능 — 적합한 곳에서 import하여 사용
- API: 없음
- DB: 없음
- 상태 전이: 없음
- Schema Change:
  - [x] 없음

## Out of Scope

- H5 D1~D6 결정 변경 (accent, eyebrow, close, 날짜 chip, save 제목, modal family 방향 재실험)
- 모달/시트 기능 변경 (정렬 즉시 적용, PlannerAdd 성공 동작, Save 성공 동작, filter 적용 흐름)
- 앵커 화면(HOME, RECIPE_DETAIL, PLANNER_WEEK) 본문 리스타일 (이미 완료)
- BottomTabs, AppShell, AppHeader 구조 변경
- API, DB, 상태 전이, endpoint, auth 변경
- 새로운 모달/시트 추가
- Jua 또는 prototype-only 폰트 import
- 프로토타입 JSX/HTML 직접 복사
- `--background`, `--foreground`, `--muted`, `--surface`, `--panel`, `--line`, `--olive`, `--cook-*` 토큰 값 변경
- 신규 CSS 토큰 추가
- `components/ui/` 프리미티브 수정 (소비만 허용)
- SocialLoginButtons 리스타일 (LoginGateModal 내부 소비, `components/auth/` 공유 범위)
- H5에서 만든 shared 컴포넌트(`OptionRow`, `SelectionChipRail`, `NumericStepperCompact`) 구조/API 변경
- COOK_MODE, MEAL_SCREEN, SHOPPING_DETAIL 등 다른 화면 모달

## Dependencies

| Dependency | Status | Why it matters |
| --- | --- | --- |
| `h5-modal-system-redesign` | merged | H5 Quiet Kitchen modal 결정(D1-D6)과 ModalHeader/ModalFooterActions 공유 컴포넌트가 프로덕션에 존재 |
| `h6-baemin-style-direction` | merged | 배민 스타일 공식 채택 방향, rollout 순서, non-goals 잠금 |
| `baemin-style-tokens-additive` | merged | Additive token foundation이 `app/globals.css`에 존재 |
| `baemin-style-token-values` | merged | Brand tokens이 사용자 승인 값(#ED7470, #C84C48, #FDEBEA)으로 설정됨 |
| `baemin-style-shared-components` | merged | 공유 UI 프리미티브(Skeleton 등)가 소비 가능 상태 |
| `baemin-style-home-retrofit` | merged | HOME 앵커 화면 리트로핏 완료 — 모달 overlay 기반 화면이 배민 스타일 |
| `baemin-style-recipe-detail-retrofit` | merged | RECIPE_DETAIL 앵커 화면 리트로핏 완료 — PlannerAdd/Save 모달 기반 화면이 배민 스타일 |
| `baemin-style-planner-week-retrofit` | merged | PLANNER_WEEK 앵커 화면 리트로핏 완료 — 전체 앵커 화면 리트로핏 완성 |

## Backend First Contract

백엔드 변경 없음. 기존 계약 보존:

- API response envelope: `{ success, data, error }`
- 기존 endpoint 파라미터/응답 구조 변경 없음
- 이 슬라이스에서 endpoint, field, table, status value 추가 금지

## Frontend Delivery Mode

- H5 ModalHeader/ModalFooterActions 공유 컴포넌트를 기준으로 모달 패밀리 시각 정합.
- LoginGateModal에 ModalHeader 적용, icon-only close 전환, eyebrow 제거.
- 모든 모달/시트에서 배민 스타일 토큰(surface, shadow, radius, border, text) 일관 사용 검증.
- 필수 상태 보존: 각 모달의 `loading / ready / empty / error / submitting` 상태가 사라지면 안 됨.
- 기존 TypeScript props 인터페이스 보존 — visual-only 변경.
- H5 결정(D1~D6) 엄수.
- H5 olive accent + thin orange highlight 색상 정책 유지.

## Design Authority

- UI risk: `high` (modal family = H5 anchor extension, LoginGateModal H5 합류 포함)
- Anchor screen dependency: 간접 — modal은 `HOME`, `RECIPE_DETAIL` 위에 overlay
- Visual artifact: modal before/after screenshots at mobile default (390px); key active states (LoginGateModal H5 전환 전후, 4개 interaction modal 정합 상태)
- Authority status: not_started

### Design-Generator / Critic Skip Rationale

이 슬라이스는 별도 design-generator 또는 design-critic 실행을 생략한다.

**근거**:
1. **기존 H5 설계 산출물 재사용**: 4개 interaction modal의 chrome, copy lock, selection language는 `h5-modal-system-redesign` Stage 1에서 확정되었고, `MODAL_SYSTEM-authority.md`에서 authority pass를 받았다. 이 결정을 변경하지 않는다.
2. **범위 격리**: 이 슬라이스는 토큰 일관성 검증과 LoginGateModal H5 합류만 다룬다. 새로운 레이아웃, 정보 구조, interaction model을 도입하지 않는다.
3. **LoginGateModal 변경은 기존 결정의 적용**: LoginGateModal에 ModalHeader를 적용하는 것은 H5 D2/D3/D6 결정의 자연 확장이다. 새로운 디자인 결정이 아니다.
4. **Stage 5 authority evidence로 충분**: Codex가 Stage 5에서 before/after screenshot evidence를 캡처하고, authority report에서 H5 결정 보존과 토큰 정합을 검증한다.

### Authority 판정 기준

| # | 기준 |
| --- | --- |
| A1 | LoginGateModal이 H5 modal family에 합류했는가 (icon-only close, eyebrow 없음, ModalHeader 사용) |
| A2 | 7개 모달/시트 전체에서 surface/shadow/radius 토큰이 일관되는가 |
| A3 | H5 olive accent + thin orange highlight 정책이 보존되는가 |
| A4 | 기존 모달 기능 플로우(정렬 즉시 적용, PlannerAdd 성공 동작, Save 성공 동작)가 보존되는가 |
| A5 | 모바일 390px/320px에서 모달 레이아웃이 안정적인가 |

## Design Status

- [x] 임시 UI (temporary) — Stage 1 기본값; 배민 스타일 모달 시각 정합 미실행
- [ ] 리뷰 대기 (pending-review) — Stage 4 완료 후, public review 준비
- [ ] 확정 (confirmed) — Stage 5/6 review 통과, authority blocker 0개
- [ ] N/A

> 이 슬라이스는 high-risk modal family 변경이다. Authority review가 필수다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/design/design-tokens.md`
- `ui/designs/BAEMIN_STYLE_DIRECTION.md`
- `ui/designs/authority/MODAL_SYSTEM-authority.md`
- `docs/workpacks/h5-modal-system-redesign/README.md`
- `docs/workpacks/baemin-style-home-retrofit/README.md`
- `docs/workpacks/baemin-style-recipe-detail-retrofit/README.md`
- `docs/workpacks/baemin-style-planner-week-retrofit/README.md`

## QA / Test Data Plan

- Fixture baseline: 기존 modal 관련 fixture 그대로 사용. 변경 없음.
- Real DB smoke: 컴포넌트 수준 변경만이므로 불필요.
- Browser smoke: 모달 before/after screenshots + key active state screenshots.
- Exploratory QA: modal family high-risk UI 변경이므로 기본 필수. Codex가 Stage 5에서 실행.
- Required checks:
  - `git diff --check`
  - `pnpm validate:workflow-v2`
  - `pnpm validate:workpack`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm verify:frontend`
- Blocker criteria:
  - H5 D1~D6 결정 위반
  - 모달 기능 플로우 변경
  - 비승인 토큰 값 hardcode
  - 모달/시트에서 horizontal overflow
  - LoginGateModal 로그인 게이트 기능 깨짐
  - `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
  - 모달 상태(loading/ready/error/empty/submitting)가 사라짐

## Key Rules

1. **H5 D1~D6 재탐색 금지**: accent, eyebrow, close, 날짜 chip, save 제목, modal family 방향을 다시 실험하지 않는다.
2. **Olive accent 보존**: H5가 명시적으로 요구하는 olive modal CTA와 selection language를 brand orange로 대체하지 않는다. Brand tokens(`--brand`, `--brand-deep`, `--brand-soft`)는 앵커 화면 CTA에 사용되지만, modal CTA는 H5 olive 결정을 따른다.
3. **API/DB 계약 불변**: 기존 endpoint, response shape, DB 구조를 바꾸지 않는다.
4. **기능 플로우 불변**: 정렬 즉시 적용, PlannerAdd 성공 동작, Save 성공 동작, Filter 적용 흐름을 바꾸지 않는다.
5. **토큰만 사용**: 모든 리스타일은 CSS 변수 사용 — hardcoded hex, rgba 금지. 파생 색상은 `color-mix()` 사용.
6. **LoginGateModal H5 합류**: ModalHeader 소비, icon-only close 전환, eyebrow 제거. 로그인 게이트 기능(return-to-action)은 보존.
7. **터치 타겟**: close button, CTA, chip, option row 전체 44px 이상.
8. **`components/ui/` 수정 금지**: 소비만 가능.
9. **Jua/prototype 폰트 금지**.

## Contract Evolution Candidates

없음. 이 슬라이스는 승인된 H5 + h6 방향 내의 visual-only 정합 변경이다.

## Primary User Path

### LoginGateModal (H5 합류)
1. 비로그인 상태에서 좋아요/저장/플래너 추가 탭
2. LoginGateModal 열림 — **ModalHeader** 적용, icon-only close, eyebrow 없음
3. "로그인이 필요한 작업이에요" 제목 + description
4. 소셜 로그인 버튼 또는 닫기
5. 로그인 후 return-to-action 복구

### PlannerAdd
1. RECIPE_DETAIL에서 `플래너에 추가` 탭
2. bottom sheet 열림 — 토큰 정합된 surface/shadow
3. 날짜/끼니/인분 선택 → CTA 탭 → 성공

### Save
1. RECIPE_DETAIL에서 `저장` 탭
2. modal 열림 — 토큰 정합된 surface/shadow
3. 레시피북 선택 → CTA 탭 → 성공

### IngredientFilter
1. HOME에서 `재료로 검색` 탭
2. bottom sheet 열림 — 토큰 정합된 surface/shadow
3. 카테고리/재료 선택 → 적용

### Sort
1. HOME에서 `정렬 · {label}` 탭
2. mobile sheet 열림 — 토큰 정합된 surface/shadow
3. 옵션 탭 → 즉시 적용

## Delivery Checklist

> Living closeout 문서. Stage 4에서 구현 항목 체크, Stage 5/6에서 리뷰.

- [ ] LoginGateModal에 ModalHeader 적용 (icon-only close, eyebrow 제거) <!-- omo:id=bsmsf-login-gate-modal-header;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal close button → icon-only 44x44 전환 <!-- omo:id=bsmsf-login-gate-close;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal "보호된 작업" eyebrow badge 제거 <!-- omo:id=bsmsf-login-gate-eyebrow;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal surface/shadow/radius 토큰 정합 <!-- omo:id=bsmsf-login-gate-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] ModalHeader 토큰 일관성 검증/조정 <!-- omo:id=bsmsf-modal-header-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] ModalFooterActions 토큰 일관성 검증/조정 <!-- omo:id=bsmsf-modal-footer-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilterModal 토큰 정합 (skeleton, footer, surface) <!-- omo:id=bsmsf-ingredient-filter-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] SortMenu mobile sheet 토큰 정합 <!-- omo:id=bsmsf-sort-sheet-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAddSheet 토큰 정합 (loading, error, surface) <!-- omo:id=bsmsf-planner-add-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] SaveModal 토큰 정합 (loading, error, book rows, surface) <!-- omo:id=bsmsf-save-modal-tokens;stage=4;scope=frontend;review=5,6 -->
- [ ] 모든 리스타일이 CSS 변수만 사용 — hardcoded hex/rgba 없음 <!-- omo:id=bsmsf-token-usage;stage=4;scope=frontend;review=5,6 -->
- [ ] H5 D1~D6 결정 보존 확인 <!-- omo:id=bsmsf-h5-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 모달 상태(loading/ready/error/empty/submitting) 보존 확인 <!-- omo:id=bsmsf-states-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] Olive accent + thin orange highlight 정책 보존 확인 <!-- omo:id=bsmsf-olive-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 TypeScript props 인터페이스 보존 확인 <!-- omo:id=bsmsf-props-preserved;stage=4;scope=frontend;review=5,6 -->
- [ ] `pnpm verify:frontend` 통과 <!-- omo:id=bsmsf-verify-frontend;stage=4;scope=frontend;review=5,6 -->
- [ ] 모달 before/after screenshots 캡처 (mobile default 390px) <!-- omo:id=bsmsf-regression-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] LoginGateModal H5 전환 before/after screenshots <!-- omo:id=bsmsf-login-gate-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] Exploratory QA bundle 또는 low-risk skip rationale 기록 <!-- omo:id=bsmsf-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

## Blockers

- H5 D1~D6 결정 위반
- Hardcoded hex/rgba 색상이 리스타일된 컴포넌트에 남아 있음
- 선언된 범위 밖의 컴포넌트, 페이지, 레이아웃 파일이 수정됨
- Jua 또는 prototype-only 폰트 import
- 모달 기능 플로우 변경
- 모바일에서 모달 horizontal overflow
- 모달 상태(loading/ready/error/empty/submitting)가 사라짐
- LoginGateModal 로그인 게이트 기능(return-to-action) 깨짐
- `components/ui/` 프리미티브 파일이 수정됨 (소비만 허용)
- 미해결 authority blocker (Stage 5)
- Exploratory QA 미실행 및 유효한 skip rationale 미기록
