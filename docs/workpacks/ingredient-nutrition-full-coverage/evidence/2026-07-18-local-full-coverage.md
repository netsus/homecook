# 2026-07-18 재료 영양 전수 local promotion evidence

## 범위와 안전선

- 대상: local inventory의 canonical ingredient 전체 `845`개
- source: 농촌진흥청 국가표준식품성분표 10.4 + 식품의약품안전처 K-FIND 영양성분 DB
- 공식 출처:
  - `https://koreanfood.rda.go.kr/kfi/fct/fctFoodSrch/list`
  - `https://various.foodsafetykorea.go.kr/nutrient/`
- 실행 환경: 격리된 local Supabase/PostgreSQL
- production/staging write: `0`
- provider 재요청: `0` — 기존 immutable local source snapshot만 재정규화
- secret, 인증 query, cookie, raw provider row의 commit/report/browser 노출: `0`

## 가식 기준 보완

MFDS provider row는 공식 `SERVING_SIZE`가 정확히 `100g` 또는 `100mL`로 파싱될 때만 아래 제한된 내부 문구를 보존한다.

| 기준 | 승인 source item |
| --- | ---: |
| MFDS `가식부 100g 기준` | 157 |
| MFDS `가식부 100mL 기준` | 7 |
| RDA `per 100g Edible Portion` | 652 |
| 가식 기준 결측 | 0 |
| 임의 가식 비율 | 0 |

`REFUSE` 같은 별도 숫자로 `100 - refuse`를 계산하지 않았고, 레시피 양에는 가식 비율을 다시 곱하지 않는다. 현재 recipe ingredient의 종류와 실제 사용량을 그대로 사용하므로 사용자에게 손질 상태·크기·가식 상태를 새로 요구하지 않는다.

## 전수 분류와 source accounting

| 항목 | 건수 |
| --- | ---: |
| inventory denominator | 845 |
| eligible / approved exactly once | 838 |
| strict excluded | 7 |
| unclassified | 0 |
| eligible without profile | 0 |
| classification conflict | 0 |
| multiple qualified primary | 0 |
| unique approved source item / profile | 816 / 816 |
| nutrient values | 4,572 |
| missing values | 206 |
| observed zero values | 305 |

같은 공인 source item을 두 canonical ingredient가 함께 쓰는 검수 결정도 허용하되, 각 ingredient의 exact source key/fingerprint 결정은 별도로 유지한다. source 명칭이 표준명과 다를 때는 링크 insert와 같은 transaction 안에서만 제한된 검수 alias를 사용하고 즉시 제거한다. 따라서 이름 안전장치를 완화하지 않으면서 ingredient dictionary와 inventory checksum도 변경하지 않는다.

## Local apply와 replay

| 항목 | 최초 apply | 같은 입력 replay |
| --- | ---: | ---: |
| status | applied | applied |
| writes committed | 7,049 | 0 |
| replayed | false | true |
| denominator | 845 | 845 |
| approved exactly once | 838 | 838 |
| excluded | 7 | 7 |
| unclassified / conflict / multiple primary | 0 / 0 / 0 | 0 / 0 / 0 |
| production DB writes | 0 | 0 |
| secret leak count | 0 | 0 |

최종 full dataset은 후속 `all-recipe-nutrition-recalculation`이 사용할 수 있도록 local에서 active 상태로 유지했다. disable은 선행 Stage 2/3의 격리 PostgreSQL lifecycle test가 보장하며, 이 실행에서는 전체 데이터를 다시 비활성화하지 않았다.

## TDD와 자동 검증

- RED → GREEN:
  - MFDS exact `100g` row의 edible basis 결측
  - MFDS exact `100mL` row의 volume edible basis 결측
  - 검수된 source 명칭과 canonical/synonym 불일치로 인한 link guard 거절
  - 한 source item을 여러 canonical ingredient가 공유할 때의 1:1 승인 제한
  - 큰 전수 registry replay를 읽을 때 local psql 기본 output buffer 초과
- public nutrition source unit: `25/25` passed
- local DB invocation unit: `6/6` passed
- isolated PostgreSQL nutrition model: `14/14` passed
- changed-file ESLint, TypeScript typecheck, SQL migration application: passed
- local Supabase DB/API health: healthy

후속 recipe 전수 재계산은 이 active link를 소비하되, 계산할 수 없는 값은 계속 `0`이 아니라 `partial/unavailable`로 표시해야 한다.
