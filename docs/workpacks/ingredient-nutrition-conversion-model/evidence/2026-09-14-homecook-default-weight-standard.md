# Homecook 기본 적당량·개당 중량 표준 수립안

상태: 기준 수립 완료 — full-local approved medium piece 표준 10건 등록

## 목표

`약간`, `적당량`, `한 꼬집`, `개`, `장`을 전역 임의 상수로 바꾸지 않고 재료·표현·상태별 재현 가능한 예상 중량으로 관리한다.

## 근거 우선순위

1. 같은 레시피 원문에 함께 적힌 `g + 개/장` 환산
2. 농촌진흥청·식약처 등 공식 계량 또는 제조사 포장 중량/개수
3. Homecook 직접 측정 protocol

상위 근거가 있으면 하위 근거로 덮어쓰지 않는다. category 평균과 다른 재료의 중량을 재사용하지 않는다.

## Homecook 직접 측정 protocol

- exact canonical ingredient, preparation state, edible state, size label, phrase를 먼저 고정한다.
- 1g 이하 정밀도가 필요한 분말·향신료는 0.1g 저울, 나머지는 1g 이하 저울을 사용한다.
- 용기 tare 뒤 독립 표본 10개 이상을 측정한다.
- 손질 전 구매중량이 아니라 실제 투입 가식부 중량을 기록한다.
- 대표값은 평균이 아니라 median을 사용하고 min/max와 표본 수를 함께 남긴다.
- `한 꼬집`, `약간`, `적당량`은 서로 다른 phrase로 측정하며 하나의 값으로 합치지 않는다.
- actor, measured_at, 장비 해상도, 표본 수, median/min/max, evidence digest, version을 보존한다.
- 적용값은 `estimated`이며 새 evidence/version으로만 교정한다.

## 현재 15개 piece blocker 측정 단위

| 재료 | 필요한 표준 |
| --- | --- |
| 양파 | 중간 크기, 손질한 1개 가식부 g |
| 청오이 | 중간 크기 1개 g |
| 청양고추 | 중간 크기 1개 g |
| 통밀 식빵 | 해당 제품 1장 g; 제품이 다르면 공유 금지 |
| 레몬 | 중간 크기 1개 가식부 g |
| 양배추 | 중간 크기 1통 가식부 g |
| 호밀빵 | 해당 제품 1장 g; 제품이 다르면 공유 금지 |

현재 레시피에 `size_code`가 없으면 approved `medium`을 사용한다. recipe 원문에 `15g(1/8개)`처럼 g와 개수가 함께 있으면 직접 g가 medium 기본값보다 우선한다.

### 2026-09-14 근거 감사 결과

| 재료 | 현재 blocker | 확인한 근거 | 환산 후보 | 판정 |
| --- | ---: | --- | ---: | --- |
| 양파 | 5 | 사용자가 중간 크기 분포 150~175g을 기준으로 승인 | 160g/개 | `medium` 기본값 승인 |
| 청오이 | 3 | 해당 원문 `청오이 1개(120g)` | 해당 recipe 120g/개 | 원문이 고정한 해당 recipe 1건에는 직접 적용 가능. 나머지 오이 2건으로 일반화 금지 |
| 청양고추 | 2 | 사용자 승인 및 식품안전나라 공개 recipe의 `청양고추 10g(1개)` | 10g/개 | `medium` 기본값 승인 |
| 통밀 식빵 | 2 | 사용자는 실제 제품 완전 일치보다 수정 가능한 일관된 기본값을 선택 | 40g/장 | 식빵 계열 `medium` 기본값 승인 |
| 레몬 | 1 | USDA FDC 167746의 중간 레몬 가식부 58g을 표시 단위로 반올림하고 사용자 승인 | 60g/개 | `medium` 가식부 기본값 승인 |
| 양배추 | 1 | USDA FDC 169975의 중간 통 908g을 표시 단위로 반올림하고 사용자 승인 | 900g/통 | `medium` 가식부 기본값 승인 |
| 호밀빵 | 1 | 사용자는 실제 제품 완전 일치보다 수정 가능한 일관된 기본값을 선택 | 40g/장 | 식빵 계열 `medium` 기본값 승인 |

### 레몬·양배추 승인값

두 재료의 RDA profile은 모두 `가식부 100g` 기준이므로 구매한 통째 무게가 아니라 실제 먹는 부분 중량을 사용한다.

- 레몬: USDA FoodData Central `Lemons, raw, without peel`(FDC 167746)은 지름 2-1/8인치 과실 58g, 2-3/8인치 과실 84g을 제공한다. 사용자 승인에 따라 Homecook `medium`은 계산과 표시가 쉬운 **가식부 60g/개**로 등록한다. 레몬즙은 이 개수 기준을 쓰지 않고 실제 g/mL를 우선한다.
- 양배추: USDA FoodData Central `Cabbage, raw`(FDC 169975)은 작은 통 714g, 중간 통 908g, 큰 통 1,248g을 제공한다. 사용자 승인에 따라 Homecook `medium`은 외잎·심을 뺀 **가식부 900g/통**으로 등록한다. 미니 양배추나 `150g(1/2개)`처럼 원문 g가 있으면 원문을 우선한다.

두 값은 2026-09-15 KST에 full-local `piece_unit_weights`의 active approved row로 등록했다.

#### blocker 15건별 처리 근거

| recipe | 재료 | 행 수 | 원문/내부 근거 | 현재 처리 |
| --- | --- | ---: | --- | --- |
| 간장불고기 | 양파 `1/2개` | 1 | 해당 원문에 g 병기 없음 | medium 160g/개 적용 |
| 돼지고기가 이렇게 맛있는 줄 몰랐죠… | 양배추 `0.25개` | 1 | USDA 중간 통 908g 및 사용자 승인 | medium 900g/통 적용 |
| 살찔 걱정 절대 없는 초간단 오이 샌드위치 | 청오이 `1개` | 1 | 해당 원문 `청오이 1개(120g)` | recipe 직접값 120g 적용 가능 |
| 살찔 걱정 절대 없는 초간단 오이 샌드위치 | 호밀빵 `2장` | 1 | 제품명·장당 중량 없음 | medium 40g/장 적용 |
| 서브웨이 뺨치는 오이 참치 샌드위치 | 양파 `0.5개` | 2 | 해당 원문 `양파 1/2개(약 80g)` | 원문과 medium 160g/개가 일치하여 80g 적용 |
| 서브웨이 뺨치는 오이 참치 샌드위치 | 오이 `1개` | 2 | 해당 원문에 g 병기 없음 | exact 오이 근거 대기 |
| 서브웨이 뺨치는 오이 참치 샌드위치 | 통밀 식빵 `2장` | 2 | 제품명·장당 중량 없음 | medium 40g/장 적용 |
| 여러가지 시도해보고 정착한 두부찌개 | 양파 `0.5개` | 1 | 해당 원문에 g 병기 없음 | medium 160g/개 적용 |
| 여러가지 시도해보고 정착한 두부찌개 | 청양고추 `1개` | 1 | 해당 원문에 g 병기 없음 | medium 10g/개 적용 |
| 연어오븐구이 | 레몬 `1/4개` | 1 | USDA 중간 가식부 58g 및 사용자 승인 | medium 60g/개 적용 |
| 집밥 김치찌개 | 양파 `1/2개` | 1 | 해당 원문에 g 병기 없음 | medium 160g/개 적용 |
| 흑백요리사 이모카세 두부찌개 | 청양고추 `2개` | 1 | 해당 원문에 g 병기 없음 | medium 10g/개 적용 |

승인된 medium 표준은 현재 blocker 중 양파 5건, 청양고추 2건, 통밀 식빵 2건, 호밀빵 1건, 레몬 1건, 양배추 1건에 적용한다. 원래 15건 중 청오이 3건만 `PIECE_WEIGHT_REQUIRED`로 남는다. recipe 행 직접 변경은 account-generation mutation fence가 차단했으므로 데이터 우회 수정을 하지 않았고, piece 표준을 소비하는 v2 계산·재계산 경로로 반영한다.

- `국가표준식품성분표 영양가 계산`은 계량단위 중량 필드를 제공하지만 2026-09-14에 `양파 생것`, `오이 다다기/취청 생것`, `청양고추 생것`, `레몬 생것`, `양배추 생것`, `식빵`을 조회했을 때 계량단위와 중량이 비어 있었다. UI가 필드를 갖고 있다는 사실만으로 중량 근거를 만들지 않는다.
- 식품안전나라 공개 예시의 `오이 1/2개(70g)`는 generic 오이 140g/개의 보조 후보일 뿐 `청오이` exact evidence가 아니므로 승인값으로 사용하지 않는다.
- 동일 recipe 원문에 직접 병기된 값은 전역 표준보다 강하다. 따라서 `청오이 1개(120g)`와 `양파 1/2개(약 80g)`는 먼저 해당 recipe 행을 g로 교정하는 근거로 사용하고, 다른 recipe에 복사하지 않는다.

근거 URL:

- 농촌진흥청 국가표준식품성분표 영양가 계산: https://www.nics.go.kr/food/kfi/fct/fctNutCal/list
- 식품안전나라 어린이 건강메뉴 예시: https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22444
- 식품안전나라 삼삼한 밥상Ⅱ(`청양고추 10g(1개)`): https://www.foodsafetykorea.go.kr/upload/20170417/20170417053825_1492418305244.pdf
- 원문이 보존된 Homecook recipe source: https://www.youtube.com/watch?v=MMSS6Rs7CQs, https://www.youtube.com/watch?v=Q1IpAhF6p7U
- USDA FoodData Central 레몬 FDC 167746: https://fdc.nal.usda.gov/food-details/167746/nutrients
- USDA FoodData Central 양배추 FDC 169975: https://fdc.nal.usda.gov/food-details/169975/nutrients

## 현재 적당량 phrase 기준

- `한 꼬집`: 소금/분말 향신료별로 별도 측정한다.
- `약간`: 재료별 측정값이 없으면 `한 꼬집`이나 `1작은술`로 자동 치환하지 않는다.
- `적당량`: 조리기름, 액상 조미료, 고형 재료를 분리하며 하나의 전역 중량을 두지 않는다.
- 원본 profile에서 관측 0인 nutrient는 중량 승인 전에도 exact zero로 반영할 수 있다.

### 현재 active 19건의 우선순위

| 우선순위 | 재료·표현 | 건수 | 필요한 표준 |
| --- | --- | ---: | --- |
| 1 | 참깨/통깨 `약간` 또는 수량 없음 | 3 | 고명으로 뿌리는 1회량 g |
| 1 | 후추 `약간` / `3바퀴` | 3 | 분말 약간과 grinder 3회전을 분리 측정 |
| 1 | 대파 `약간` 또는 수량 없음 | 2 | 고명용 손질 대파 g; bare ingredient는 자동 환산하지 않음 |
| 1 | 버터 `약간` | 2 | 팬 코팅용 g. `버터 또는 올리브 오일`은 재료 선택을 먼저 확정 |
| 1 | 소금 `약간` | 2 | 소금 종류별 약간 g; `한 꼬집`과 분리 |
| 1 | 참기름 `약간` | 2 | 무침 마무리용 g |
| 2 | 럼, 식초, 올리브 오일, 치커리, 튀김가루 | 각 1 | 재료·조리행동·phrase별 개별 표준 |

상위 6개 재료군이 19건 중 14건을 차지하므로 이를 먼저 측정한다. 같은 재료라도 `한 꼬집`, `약간`, `3바퀴`, `팬에 두르기`, `고명으로 뿌리기`는 서로 다른 표준이다.

### 데이터 모델 원칙

적당량 기본값은 `ingredient_id + phrase_code + preparation_state + usage_context` 조합으로 식별한다. 값에는 `weight_g`, `sample_count`, `median/min/max`, `evidence_id`, `version`, `review_status`, `is_active`를 둔다. calculator는 active/current/approved exact match만 사용하고, 사용 시 계산 품질을 `estimated`로 표시한다. exact match가 없으면 기존처럼 비영 영양소는 미확정으로 남긴다.

`bare`(재료명만 있고 양 없음), `alternative`(`버터 또는 올리브 오일`)는 중량 표준으로 덮지 않는다. 먼저 원문 재료와 선택지를 확정해야 한다.

## 승인 gate

- exact ingredient/phrase/state당 active 표준은 최대 1개다.
- 표본 10 미만, 장비/가식부/phrase 불명, 제품 장당 중량 미확인은 승인하지 않는다.
- 값 승인 뒤 calculator·snapshot validation·UI copy 테스트와 운영 dry-run을 통과해야 한다.
