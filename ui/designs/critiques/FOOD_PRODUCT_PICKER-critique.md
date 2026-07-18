# FOOD_PRODUCT_PICKER 설계 리뷰 — repair-final

> 검토 대상: `ui/designs/FOOD_PRODUCT_PICKER.md`
> 기준 문서: 화면정의서 v1.5.27 / 요구사항 기준선 v1.7.21 / 유저 Flow맵 v1.3.24 / DB v1.3.22 / API v1.2.26 / 현행 디자인·모바일 UX·anchor 규칙
> 검토일: 2026-07-18
> 검토자: design-critic (fresh independent repair-final re-review)
> Blocker 수: **0**
> 구현 전 필수 수정: **아니오**

## 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: 이전 Blocker 4건과 minor 3건이 모두 수리됐고, 공동 catalog 검색·신고·수량·소유권 UI가 공식 field/API/status만으로 구현 가능하게 닫혔다.

## 선행 authority와 이번 판정의 범위

- 선행 `prepared-food-planner-entry`의 `Stage 5 pass + final authority approved + Stage 6 approved / Design Status confirmed` 기록은 당시 private manual 구현 evidence에 한정해 보존한다.
- 이번 판정은 `community-prepared-food-catalog`의 Stage 1 텍스트 설계 계약만 승인한다.
- 신규 community 확장의 `390×844`, `320×568`, `1280×900` 실제 screenshot/Figma authority는 구현 후 별도 gate다. 아직 evidence가 없다는 사실은 Stage 1 텍스트 설계 blocker가 아니다.

## 이전 크리티컬 이슈 수리 확인

| # | 이전 문제 | repair-final 확인 | 결과 |
|---|----------|-------------------|------|
| 1 | 검색 응답 exact field path와 action/pin field 누락 | `id`, `name`, nullable `brand`, `visibility`, `source_type`, `editable`, `nutrition_version_id`, top-level `basis_relations[]`, `label_basis_text`, `nutrition.basis`, nutrient별 `status`, `nutrition.calculation_status`를 정확히 분리했다. 비공식 top-level `nutrition.status`는 명시적으로 금지했다. | 해소 |
| 2 | relation 없는 legacy `serving/package`의 100g/100mL 추정 위험 | 같은 row·같은 immutable version의 approved direct relation이 있을 때만 비교값과 교차 단위를 허용한다. 관계가 없으면 원 basis와 `100g/100mL 비교 불가`만 표시하고 비교 숫자를 비운다. | 해소 |
| 3 | 신고 body 계약 미완성 | 공식 6개 `reason_code`와 사용자 label의 1:1 mapping, 필수 단일 선택, optional `detail_text`, 공식 maxlength 부재를 명시했다. | 해소 |
| 4 | 신고 network/5xx/common error recovery 누락 | sheet·reason·detail draft를 보존하고 inline 오류 + 동일 요청 `[다시 시도]`, pending 중 중복 submit 차단을 명시했다. success/duplicate/not-allowed/forbidden과 generic retry를 분리했다. | 해소 |

## 이전 마이너 이슈 수리 확인

| # | 이전 문제 | repair-final 확인 | 결과 |
|---|----------|-------------------|------|
| 1 | populated list에 상시 `[직접 등록]` 노출 | `[직접 등록]`은 empty recovery에만 남고 populated wireframe에서는 제거됐다. | 해소 |
| 2 | owner 수정/삭제의 card 선택 분리·접근성 미정 | report/edit/delete 모두 44×44px 독립 target, 고유 접근성 이름, pointer/keyboard propagation 차단을 사용하며 삭제 확인 dialog와 focus return도 명시했다. | 해소 |
| 3 | filter/source badge token 역할 미정 | normal/selected/read-only 역할을 `--surface-fill`, `--text-3`, `--line`, `--brand-primary-soft`, `--brand-primary`, `--brand-primary-border`, `--radius-chip`으로 고정하고 임의 hex를 금지했다. 모바일 gutter도 `--space-4`로 잠갔다. | 해소 |

## 크리티컬 이슈 (수정 필수)

없음.

## 마이너 이슈 (권장 수정)

없음.

## 공식 계약 밖 요소 재검토

- 신규 endpoint 없음. `GET /food-products`, `POST /food-products/{product_id}/report`, `POST /product-planner-entries`와 기존 owner 수정/삭제 흐름만 소비한다.
- 신규 response/request field 없음. owner ID, `moderation_status`, `external_product_key`, public stable key, relation 입력을 client에 요구하지 않는다.
- 신규 status/error code 없음. 공식 `PRODUCT_ALREADY_REPORTED`, `PRODUCT_REPORT_NOT_ALLOWED`, `PRODUCT_HIDDEN`, `PRODUCT_DELETED`, `NUTRITION_VERSION_CONFLICT`, `NUTRITION_BASIS_MISMATCH`, `FORBIDDEN` 경계만 사용한다.
- 삭제된 `DELETE /recipes/{id}/save`는 등장하지 않는다.

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면 정의서의 검색, source filter/badge, card, 수량, 신고, 직접 등록 진입이 포함됐다.
- [x] 공식 문서 밖 field/API/status/control을 추가하지 않았다.
- [x] 로그인 안내 후 검색어·날짜·끼니·선택·수량을 return-to-action으로 복원한다.
- [x] public dataset, 다른 사용자 shared manual, owner 익명화 row는 수정/삭제 read-only다.
- [x] hidden/deleted 신규 제외와 기존 planner pin 보존이 분리됐다.
- [x] 삭제된 recipe save endpoint가 없다.

### B. 공통 상태 커버리지

- [x] initial/pagination/action Loading과 중복 submit 방지가 포함됐다.
- [x] 검색 맥락별 Empty 안내와 `[직접 등록]` CTA가 포함됐다.
- [x] 검색·추가·신고 Error와 `[다시 시도]`/전용 recovery가 포함됐다.
- [x] read-only, unauthorized, hidden/deleted, partial/unavailable 상태가 분리됐다.

### C. 내비게이션 & 플로우

- [x] `PLANNER_WEEK → MEAL_SCREEN → MENU_ADD → FOOD_PRODUCT_PICKER` anchor extension을 유지한다.
- [x] create 복귀와 add 성공 후 `MEAL_SCREEN` 복귀가 Flow맵과 일치한다.
- [x] ESC/back, nested overlay close, opener focus return이 명시됐다.
- [x] query/filter pagination race와 stale selection recovery가 닫혀 있다.
- [x] 하단 탭 4개 구조를 변경하지 않는다.

### D. UX 품질

- [x] 모든 action/control의 최소 44×44px target이 명시됐다.
- [x] 390px 모바일 우선, 320px sentinel, 1280px desktop 구조가 정의됐다.
- [x] filter wrap, card metadata/action reflow, sticky CTA가 좁은 폭에서도 유지된다.
- [x] whole-page horizontal scroll을 금지하고 header/search/filter와 footer 사이 body만 scroll한다.
- [x] primary CTA가 sticky footer에서 명확하다.
- [x] exact relation 없는 legacy basis는 추정 없이 fail-closed다.
- [x] 글로우·과도한 그라디언트 같은 AI형 generic UI가 없다.
- [x] 장보기 D&D와 SHOPPING_DETAIL 2영역 규칙은 해당 없음이다.

### E. 도메인 규칙 정합성

- [x] ProductPlannerEntry가 `meals.status`를 만들거나 바꾸지 않는다.
- [x] 장보기·요리·남은요리·recipe metric·XP/activity action을 만들지 않는다.
- [x] hidden/deleted 뒤 기존 entry와 pinned nutrition version을 보존한다.
- [x] 팬트리 수량, 요리 모드 인분, 레시피북 타입 규칙은 해당 없음이다.

### F. 디자인 토큰 준수

- [x] primary CTA는 현행 app token `--brand-primary (#00A1FF)`를 사용한다.
- [x] card/input/filter/badge가 `--surface`, `--surface-fill`, `--line`, `--text-3`와 app-scoped brand token을 사용한다.
- [x] card/control/chip은 `--radius-card`, `--radius-control`, `--radius-chip`을 참조한다.
- [x] 모바일 수평 여백은 `--space-4`(16px)다.
- [x] 구버전 또는 임의 hex를 직접 추가하지 않는다.

> 앱 화면은 현행 `docs/design/design-tokens.md`의 app runtime/Wave1 override가 우선이다. 과거 checklist의 coral CTA와 16px card-radius 고정값은 이 화면의 판정 기준이 아니다.

## 남은 non-blocking 위험

- 실제 구현에서 320px filter wrap, card 내부 action, stepper, keyboard/safe-area가 겹치지 않는지는 screenshot authority로 확인해야 한다.
- focus trap, opener focus return, live region 낭독량, pointer/keyboard propagation은 실제 DOM과 보조기기 QA에서 검증해야 한다.
- abort/generation 기반 latest-query-wins와 opaque cursor append/dedupe는 구현 테스트로 고정해야 한다.

## design-generator 재작업 요청 항목

없음.

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:

- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 0개
- [x] 공식 field/API/status 밖 확장 0개

구현 후에는 별도로:

- [ ] 신규 community 확장의 390/320/1280 screenshot/Figma evidence 확보
- [ ] fresh product-design authority의 blocker 0 판정
