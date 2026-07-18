# FOOD_PRODUCT_CREATE 설계 리뷰 — repair-final

> 검토 대상: `ui/designs/FOOD_PRODUCT_CREATE.md`
> 기준 문서: 화면정의서 v1.5.27 / 요구사항 기준선 v1.7.21 / 유저 Flow맵 v1.3.24 / DB v1.3.22 / API v1.2.26 / 현행 디자인·모바일 UX·anchor 규칙
> 검토일: 2026-07-18
> 검토자: design-critic (fresh independent repair-final re-review)
> Blocker 수: **0**
> 구현 전 필수 수정: **아니오**

## 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: 이전 Blocker 2건과 minor 3건이 모두 수리됐고, shared manual create/edit/delete가 공식 body·권한·moderation·immutable version 계약만으로 구현 가능하게 닫혔다.

## 선행 authority와 이번 판정의 범위

- 선행 `prepared-food-planner-entry`의 private manual 등록 authority는 당시 구현 evidence에 한정해 보존한다.
- 이번 판정은 shared `public/manual`, g/mL-only 기준, owner 수정/삭제, moderation lock을 추가한 `community-prepared-food-catalog` Stage 1 텍스트 설계 계약만 승인한다.
- 신규 community 확장의 `390×844`, `320×568`, `1280×900` 실제 screenshot/Figma authority는 구현 후 별도 gate다.

## 이전 크리티컬 이슈 수리 확인

| # | 이전 문제 | repair-final 확인 | 결과 |
|---|----------|-------------------|------|
| 1 | `PRODUCT_MODERATION_LOCKED`를 신고 원인으로 단정 | `현재 검토 또는 운영 제한 상태`라는 원인 중립 copy로 바꾸고, `hidden_by_report`/`hidden_by_operator`를 client가 추정하지 못하게 했다. save/delete 차단, picker 최신 검색 복귀, 기존 pin 보존은 유지했다. | 해소 |
| 2 | create/edit/delete generic mutation 오류 recovery 누락 | create/edit은 form draft와 return context를 보존하고 CTA 위 inline retry를 제공한다. delete는 confirm dialog와 card를 보존하고 dialog 안에서 같은 delete를 재시도하며 성공 전에는 결과를 제거하지 않는다. | 해소 |

## 이전 마이너 이슈 수리 확인

| # | 이전 문제 | repair-final 확인 | 결과 |
|---|----------|-------------------|------|
| 1 | 320px 공개 안내에서 `로그인 사용자`·`식단` 의미 축약 | 320px wireframe과 보조 규칙에서 `다른 로그인 사용자도 검색하고 식단에 추가` 의미를 줄바꿈으로 보존했다. | 해소 |
| 2 | 모바일 수평 gutter 미정 | header/form body/sticky footer의 모바일 좌우 gutter를 `--space-4`(16px)로 잠갔다. | 해소 |
| 3 | primary/danger action token 미정 | create/edit CTA는 `--brand-primary`/`--brand-primary-hover`/`--control-height-lg`, delete는 현행 `--danger` 계열을 사용하고 임의 hex를 금지했다. | 해소 |

## 크리티컬 이슈 (수정 필수)

없음.

## 마이너 이슈 (권장 수정)

없음.

## 공식 계약 밖 요소 재검토

- 신규 endpoint 없음. 공식 `POST /food-products`, `PATCH /food-products/{product_id}`, `DELETE /food-products/{product_id}`만 사용한다.
- create/PATCH body는 `name`, nullable `brand`, `nutrition.basis.amount/unit`, optional `nutrition.label_basis_text`, 공식 nutrient values만 사용한다.
- client 입력에서 `visibility`, `source_type`, `owner_user_id`, `moderation_status`, `external_product_key`, public stable key, `basis_relations`를 금지한다.
- 신규 status/error code 없음. 공식 `VALIDATION_ERROR`, `UNSUPPORTED_NUTRIENT`, `UNSUPPORTED_FIELD`, `NUTRITION_VERSION_CONFLICT`, `PRODUCT_MODERATION_LOCKED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND` 경계만 사용한다.
- 삭제된 `DELETE /recipes/{id}/save`는 등장하지 않는다.

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면 정의서의 제품명, 브랜드, g/mL 기준량, 원 라벨 text, 열량·optional nutrient 입력이 포함됐다.
- [x] shared public 저장 안내와 owner-only 수정/soft-delete 경계가 포함됐다.
- [x] 공식 문서 밖 field/API/status/control을 추가하지 않았다.
- [x] login gate 뒤 picker/search/source/date/column과 안전한 draft를 return-to-action으로 복원한다.
- [x] public dataset, 다른 사용자, owner 익명화 제품에는 edit/delete 진입이 없다.
- [x] legacy private 자동 공개와 공개 toggle이 없다.
- [x] 삭제된 recipe save endpoint가 없다.

### B. 공통 상태 커버리지

- [x] initial/submitting Loading과 double-submit 방지가 포함됐다.
- [x] 초기 Empty form과 optional blank semantics가 포함됐다.
- [x] create/edit/delete generic Error와 `[다시 시도]`가 포함됐다.
- [x] validation, read-only, unauthorized, nutrition conflict, moderation lock, deleted/permission race가 분리됐다.
- [x] partial/unavailable와 실제 0을 구분한다.

### C. 내비게이션 & 플로우

- [x] `FOOD_PRODUCT_PICKER → FOOD_PRODUCT_CREATE → selected PICKER → ProductPlannerEntry`가 Flow맵과 일치한다.
- [x] 제품 저장만으로 entry/Meal/status/XP를 만들지 않는다.
- [x] back/ESC, unsaved discard, nested dialog close, success focus return이 명시됐다.
- [x] 실패 후 draft/dialog/card를 보존해 플로우가 단절되지 않는다.
- [x] 하단 탭 4개 구조를 변경하지 않는다.

### D. UX 품질

- [x] input/action 최소 44px와 primary CTA 높이가 명시됐다.
- [x] 390px 모바일 우선, 320px 한 열 reflow, 1280px desktop form이 정의됐다.
- [x] whole-page horizontal scroll을 금지하고 form body만 scroll한다.
- [x] sticky header/footer, keyboard/safe-area, 마지막 field/error 비가림 규칙이 명확하다.
- [x] create/edit primary CTA와 danger delete의 시각 위계가 분리됐다.
- [x] 글로우·과도한 그라디언트 같은 AI형 generic UI가 없다.
- [x] 장보기 D&D와 SHOPPING_DETAIL 2영역 규칙은 해당 없음이다.

### E. 도메인 규칙 정합성

- [x] 신규 manual은 server-authoritative `public/manual`이고 owner만 수정·soft-delete한다.
- [x] nutrition 수정은 새 immutable version을 만들며 metadata-only 수정은 current version을 유지한다.
- [x] 기존 planner entry와 pin된 version은 edit/delete 뒤에도 바뀌지 않는다.
- [x] shared manual은 g/mL basis만 받고 `basis_relations` 입력과 g↔mL 추정을 금지한다.
- [x] Meal/status/shopping/cooking/leftover/XP/activity를 만들지 않는다.
- [x] 팬트리 수량, 요리 모드 인분, 레시피북 타입 규칙은 해당 없음이다.

### F. 디자인 토큰 준수

- [x] create/edit primary CTA는 현행 `--brand-primary (#00A1FF)`를 사용한다.
- [x] delete는 app runtime의 `--danger` 계열 token을 사용한다.
- [x] input/panel/source badge는 `--surface-fill`, `--line`, `--brand-primary-soft`, `--text-2`를 사용한다.
- [x] control/chip/sheet는 현행 app-scoped radius/control token을 참조한다.
- [x] 모바일 수평 여백은 `--space-4`(16px)다.
- [x] 구버전 또는 임의 hex를 직접 추가하지 않는다.

> 앱 화면은 현행 `docs/design/design-tokens.md`의 app runtime/Wave1 override가 우선이다. 과거 checklist의 coral CTA와 16px card-radius 고정값은 이 화면의 판정 기준이 아니다.

## 남은 non-blocking 위험

- 실제 구현에서 320px의 긴 공개 안내·validation·keyboard가 sticky CTA나 마지막 nutrient field를 가리지 않는지 screenshot authority로 확인해야 한다.
- create/edit/delete retry가 실제로 draft/dialog/card를 보존하고 중복 mutation을 막는지는 integration/interaction 테스트가 필요하다.
- focus trap, discard confirmation, invalid-field focus, picker opener focus return은 실제 DOM과 보조기기 QA에서 검증해야 한다.

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
