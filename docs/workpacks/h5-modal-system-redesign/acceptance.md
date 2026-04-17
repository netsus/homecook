# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path

- [ ] PlannerAdd: 날짜/끼니/인분 선택 → `플래너에 추가` 탭 → 성공 toast → sheet 닫힘 <!-- omo:id=accept-happy-path-planner-add;stage=4;scope=frontend;review=5,6 -->
- [ ] Save: 레시피북 선택 → `저장` 탭 → 성공 toast → modal 닫힘 <!-- omo:id=accept-happy-path-save;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilter: 재료 선택 → `N개 적용` 탭 → 필터 반영 → sheet 닫힘 <!-- omo:id=accept-happy-path-ingredient;stage=4;scope=frontend;review=5,6 -->
- [ ] Sort: 옵션 탭 → 즉시 정렬 반영 + sheet 닫힘 <!-- omo:id=accept-happy-path-sort;stage=4;scope=frontend;review=5,6 -->
- [ ] 문서 기준 화면 상태와 액션이 맞다 (화면정의서 v1.5.0 기준) <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
- [ ] 백엔드 계약과 프론트 타입이 일치한다 (기존 계약 무변경 확인) <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## State / Policy

- [ ] 정렬은 즉시 적용형 유지 (탭 → 반영 → sheet 닫힘, 별도 확인 CTA 없음) <!-- omo:id=accept-sort-immediate;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAdd 성공 후 동작이 기존과 동일하다 (toast만 표시, 이동 없음) <!-- omo:id=accept-planner-add-success;stage=4;scope=frontend;review=5,6 -->
- [ ] Save 성공 후 동작이 기존과 동일하다 <!-- omo:id=accept-save-success;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilter 초기화 후 필터가 올바르게 리셋된다 <!-- omo:id=accept-filter-reset;stage=4;scope=frontend;review=5,6 -->
- [ ] API/DB 계약 변경 없음 (`POST /meals`, `POST /recipes/{id}/save`, `GET /ingredients` 무변경) <!-- omo:id=accept-api-contract-immutable;stage=2;scope=backend;review=3,6 -->

## Error / Permission

- [ ] loading 상태가 있다 (4개 modal 각각) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [ ] empty 상태가 있다 (Save: 저장된 책 없음, IngredientFilter: 재료 없음) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [ ] error 상태가 있다 (API 실패 시 각 modal 에러 처리) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [ ] unauthorized 처리 흐름이 있다 (로그인 게이트 기존 동작 유지) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [ ] 로그인 게이트 후 return-to-action이 맞다 (기존 동작 유지) <!-- omo:id=accept-return-to-action;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] invalid input을 적절히 거부하거나 무시한다 (PlannerAdd: 날짜/끼니 미선택 시 CTA disable) <!-- omo:id=accept-invalid-input;stage=4;scope=frontend;review=5,6 -->
- [ ] Save: 책 미선택 시 `저장` CTA disable <!-- omo:id=accept-save-disabled;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 데이터 무결성 불변 (UI chrome 변경이 저장 데이터에 영향 없음) <!-- omo:id=accept-data-integrity;stage=4;scope=shared;review=6 -->

## Data Setup / Preconditions

- [ ] fixture / mock에서 필요한 baseline 데이터가 준비되어 있다 (기존 fixture 재사용) <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [ ] real DB smoke에 필요한 테이블 / seed / bootstrap이 준비되어 있다 (기존 재사용) <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [ ] before 캡처 (E1/E3/E5/E7)가 Pass 1 구현 전 현행 UI 상태에서 완료됐다 <!-- omo:id=accept-before-capture;stage=4;scope=frontend;review=5,6 -->

## Manual QA

- **verifier**: Codex (구현) → Claude (authority review)
- **environment**: `pnpm dev` (local) + real Supabase
- **scenarios**:
  1. PlannerAdd: 390px mobile — 날짜 chip `요일 + 4/17` 확인, 인분 `2`+`인분` 분리 확인
  2. PlannerAdd: 320px narrow — chip 잘림 없음, CTA 잘림 없음
  3. Save: eyebrow 없음, 제목 `레시피 저장`, close icon-only 확인
  4. IngredientFilter: 카테고리 rail 초기 scrollbar 없음, fade affordance 확인
  5. Sort: `현재 {label}` badge 없음, selected option olive tint 확인
  6. Sort: desktop dropdown — mobile sheet와 같은 option 언어 확인
  7. 4개 modal: close button 44px 이상, tap 동작 확인
  8. authority before/after 비교: E1 vs E2, E3 vs E4, E5 vs E6, E7 vs E8

## Automation Split

### Vitest

- [ ] `ModalHeader` props 렌더링 단위 테스트 (title, description, onClose) <!-- omo:id=accept-vitest-modal-header;stage=4;scope=frontend;review=5,6 -->
- [ ] `OptionRow` selected/idle/disabled 상태 단위 테스트 <!-- omo:id=accept-vitest-option-row;stage=4;scope=frontend;review=5,6 -->
- [ ] `SelectionChipRail` 선택 상태 단위 테스트 <!-- omo:id=accept-vitest-chip-rail;stage=4;scope=frontend;review=5,6 -->
- [ ] `NumericStepperCompact` +/- 동작 + 경계값 단위 테스트 <!-- omo:id=accept-vitest-stepper;stage=4;scope=frontend;review=5,6 -->
- [ ] PlannerAdd: 날짜/끼니 미선택 시 CTA disable 로직 <!-- omo:id=accept-vitest-planner-add-disabled;stage=4;scope=frontend;review=5,6 -->

### Playwright

- [ ] PlannerAdd: 날짜 chip 렌더링 + 탭 선택 + CTA 활성 → 제출 흐름 <!-- omo:id=accept-playwright-planner-add;stage=4;scope=frontend;review=5,6 -->
- [ ] Save: modal 열기 + 책 선택 + 저장 흐름 <!-- omo:id=accept-playwright-save;stage=4;scope=frontend;review=5,6 -->
- [ ] IngredientFilter: modal 열기 + 카테고리 선택 + 재료 선택 + 적용 흐름 <!-- omo:id=accept-playwright-ingredient;stage=4;scope=frontend;review=5,6 -->
- [ ] Sort: mobile sheet 열기 + 옵션 탭 → 즉시 적용 흐름 <!-- omo:id=accept-playwright-sort;stage=4;scope=frontend;review=5,6 -->
- [ ] 4개 modal: icon close 탭 → 닫힘 흐름 <!-- omo:id=accept-playwright-close;stage=4;scope=frontend;review=5,6 -->
- [ ] 외부 연동 없음 — live-only 분기 해당 없음 <!-- omo:id=accept-playwright-live-split;stage=4;scope=frontend;review=6 -->

### Manual Only

- [ ] authority evidence E1~E10 visual 판정 (A1~A5 기준) — 스크린샷 캡처 후 authority 검토

---

## 공통 UI 시스템 체크 (authority 기준)

| # | 기준 | 검증 |
|---|------|------|
| F1 | 4개 modal 전체에서 eyebrow 제거됨 | E1-E8 |
| F2 | 4개 modal 전체의 close button이 icon-only 원형 (`44×44`) | E2/E4/E6/E8 |
| F3 | 제목이 copy lock 표 기준으로 통일됨 | E2/E4/E6/E8 |
| F4 | 모달 내부 accent가 `olive base + thin orange highlight` 원칙을 따름 | authority A3 |
| F5 | 선택 상태 표현이 olive family로 통일됨 (dark fill, orange fill 잔류 없음) | authority A5 |
| F6 | API/DB 계약 변경 없음 | 코드 확인 |
| F7 | 기능 플로우 변경 없음 | 동작 확인 |

## 모달별 UI 체크

### PlannerAdd

| # | 기준 | 검증 |
|---|------|------|
| P1 | 날짜 chip이 `요일 + 4/17` compact 표기로 보임 | E2 |
| P2 | 날짜 아래 중복 확인 라벨 없음 | E2 |
| P3 | 날짜/끼니/인분 섹션의 시각 밀도가 균형을 이룸 | E1 vs E2 |
| P4 | 인분 표시가 `2` + 작은 `인분` hierarchy로 분리됨 | E2 |
| P5 | `SelectionChipRail`을 사용함 (날짜 rail) | 코드 확인 |

### Save

| # | 기준 | 검증 |
|---|------|------|
| S1 | 제목이 `레시피 저장`임 | E4 |
| S2 | 영어 eyebrow `Save Recipe` 및 문장형 제목 없음 | E3 vs E4 |
| S3 | `새 레시피북 만들기` 블록이 리스트보다 과도하게 무겁지 않음 | E4 |
| S4 | 선택 row가 olive tint 표현을 사용함 | E4 |

### IngredientFilter

| # | 기준 | 검증 |
|---|------|------|
| I1 | 카테고리 rail 초기 scrollbar가 눈에 띄게 노출되지 않음 | E6 |
| I2 | 카테고리 rail에 edge fade affordance가 있음 | E6 |
| I3 | 검색 / 카테고리 / 결과 목록이 한 시스템처럼 읽힘 | E5 vs E6 |
| I4 | 선택 수 badge가 title 옆 또는 footer CTA 한 군데에만 표시됨 | E6 |
| I5 | `SelectionChipRail`을 사용함 (category rail) | 코드 확인 |

### Sort

| # | 기준 | 검증 |
|---|------|------|
| O1 | `현재 {label}` badge 없음 (또는 필수 최소화) | E7 vs E8 |
| O2 | selected option이 olive tint 표현을 사용함 (dark fill 없음) | E8 |
| O3 | mobile sheet와 desktop dropdown의 선택 언어가 일관됨 | E8/E10 |

## Mobile UX 체크

| # | 기준 | 검증 |
|---|------|------|
| M1 | 390px에서 4개 modal header/body/footer hierarchy가 안정적임 | E2/E4/E6/E8 |
| M2 | 320px에서 CTA 잘림, 옵션 잘림, close button 축소 없음 | E9 |
| M3 | localized horizontal scroll이 page-level overflow처럼 느껴지지 않음 | E2/E6 |
| M4 | scroll affordance가 fade/peek로 드러남 (초기 scrollbar 미의존) | E6 |
| M5 | 터치 타겟 44px 이상 (close button, CTA, chip, option row) | E2/E4/E6/E8 |

## Authority Evidence 필수 목록

| ID | artifact | 경로 | 필수 여부 |
|----|----------|------|----------|
| E1 | planner-add before (390px) | `ui/designs/evidence/h5-modal-system-redesign/planner-add-before.png` | 필수 |
| E2 | planner-add after (390px) | `ui/designs/evidence/h5-modal-system-redesign/planner-add-after.png` | 필수 |
| E3 | save before (390px) | `ui/designs/evidence/h5-modal-system-redesign/save-before.png` | 필수 |
| E4 | save after (390px) | `ui/designs/evidence/h5-modal-system-redesign/save-after.png` | 필수 |
| E5 | ingredient-filter before (390px) | `ui/designs/evidence/h5-modal-system-redesign/ingredient-filter-before.png` | 필수 |
| E6 | ingredient-filter after (390px) | `ui/designs/evidence/h5-modal-system-redesign/ingredient-filter-after.png` | 필수 |
| E7 | sort before (390px) | `ui/designs/evidence/h5-modal-system-redesign/sort-before.png` | 필수 |
| E8 | sort after (390px) | `ui/designs/evidence/h5-modal-system-redesign/sort-after.png` | 필수 |
| E9 | narrow sentinel (planner-add, ingredient-filter, 320px) | `ui/designs/evidence/h5-modal-system-redesign/narrow-*.png` | 필수 |
| E10 | desktop set (save, sort) | `ui/designs/evidence/h5-modal-system-redesign/desktop-*.png` | 필수 |

## Closeout 금지 조건

| # | 조건 |
|---|------|
| CB1 | authority evidence 필수 항목 E1~E10 누락 |
| CB2 | 4개 modal 중 일부만 새 system으로 바뀌고 일부는 예전 chrome이 남아 있음 |
| CB3 | eyebrow 제거 원칙이 문서/구현/authority에서 서로 다름 |
| CB4 | accent 체계가 modal별 개별 색놀이로 돌아감 |
| CB5 | 날짜 chip compact 규칙이 PlannerAdd에서 지켜지지 않음 (`요일 + 4/17` 미적용) |
| CB6 | IngredientFilter category rail 초기 scrollbar 노출 버그 잔류 |
| CB7 | API/DB 계약 변경 발생 |
| CB8 | 기능 플로우 변경 발생 (정렬 즉시 적용 → 확인형 전환 등) |
| CB9 | authority report에 unresolved blocker 존재 |
| CB10 | 터치 타겟 44px 미달 (close button, CTA, chip, option row) |
| CB11 | `ModalHeader` 없이 각 modal이 독자 header 구현 유지 (공통화 누락) |
