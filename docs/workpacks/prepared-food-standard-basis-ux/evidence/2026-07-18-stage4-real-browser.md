# prepared-food-standard-basis-ux Stage 4 실제 검증

- 검증일: 2026-07-18 KST
- 환경: local Supabase + 실제 route/DB, 로그인된 Chrome 테스트 계정
- 외부 write: production/staging/provider 0건
- 계약 변경: API/DB/field/status/error/endpoint 0건

## TDD

구현 전에 g/mL 입력의 브라우저 유효성 테스트를 추가했다. 기존 `min=0.01`이 남아 있어 다음 3개 assertion이 RED로 실패했다.

- picker의 direct g 제품: expected `min=1`, received `0.01`
- MealScreen의 현재 g 제품: expected `min=1`, received `0.01`
- MealScreen의 serving → g 단위 전환: expected `min=1`, received `0.01`

최소 수리는 picker와 MealScreen 양쪽에서 다음 규칙만 맞췄다.

- `g/ml`: `min=1`, `step=1`
- `serving/package`: `min=0.01`, `step=any`

## 실제 local Supabase + Chrome 흐름

1. 실제 공공 고형 제품을 검색해 `공공 영양DB`, `100g 기준`, 원 라벨과 핵심 영양을 확인했다.
2. 실제 공공 액상 제품을 검색해 `공공 영양DB`, `100mL 기준`, 원 라벨과 핵심 영양을 확인했다.
3. 다른 사용자가 등록한 공유 제품을 검색해 `사용자 등록`, `100g 기준`과 partial 제품의 `정보 준비 중`을 확인했다.
4. g 제품 선택 직후 input은 `value=100`, `min=1`, `step=1`, `valid=true`였다.
5. 100g을 101g으로 바꿨을 때 `stepMismatch=false`였고 저장에 성공했다.
6. 같은 끼니의 계획 영양은 `847.4 kcal → 851.2 kcal`로 다시 계산됐다.

테스트 계정 데이터는 사용자 승인에 따라 복구하지 않았다.

## 반응형·접근성 증거

- before: `ui/designs/evidence/prepared-food-standard-basis-ux/before/`
- after: `ui/designs/evidence/prepared-food-standard-basis-ux/after/`
- 파일: `meal-screen-quantity-edit-{320,390,1280}.png`

| viewport | page-level horizontal overflow | 수량 input | primary button |
| --- | --- | --- | --- |
| 320×720 | 0 | 44px | 44px |
| 390×844 | 0 | 44px | 44px |
| 1280×900 | 0 | 44px | 44px |

320/390은 bottom sheet, 1280은 center modal 패턴을 유지한다. dialog label, 초기 input focus, Tab containment, ESC close, opener focus return은 기존 회귀 테스트가 통과했다.

## 자동 검증

- 관련 UI Vitest: `83 passed`
- backend read/service 회귀: `17 passed`
- local PostgreSQL integration: `11 passed`
- slice Playwright grep: `3 passed / 1 intentional skip`
- core smoke: `59 passed / 10 intentional skip`
- core accessibility: `8 passed / 1 intentional skip`
- core visual: desktop `4 passed`, mobile `8 passed`
- production build: pass

첫 cold Turbopack 접근성/시각 실행은 동적 recipe route의 최초 컴파일에서 `PageNotFoundError`가 발생했다. 제품 코드 변경 없이 같은 서버 캐시를 사용한 즉시 재실행이 전부 통과했고, 해당 route와 이 slice의 focused Playwright도 정상이다.

## 탐색 QA

- bundle: `.artifacts/qa/prepared-food-standard-basis-ux/2026-07-18T17-49-23-752Z/`
- eval: `97/100`, pass
- blocker/major/minor finding: `0/0/0`
- 필수 device coverage: desktop, mobile, small-mobile 모두 충족

## 보안·성능

- input 속성 분기만 바뀌어 새 fetch/query/N+1이 없다.
- owner/auth/RLS, pinned nutrition version, exactly-one direct relation, mismatch 422를 변경하지 않았다.
- secret, raw provider row, cookie, private filesystem path를 evidence에 기록하지 않았다.
- ProductPlannerEntry는 Recipe Meal/shopping/cooking/leftover/XP에 들어가지 않는다.

## 독립 심사

- code review: 초기 E2E public g/ml coverage gap 1건을 발견해 수리 후 repair-final 재심사
- design critic: PASS, blocker/major/minor `0/0/0`
- product design authority: PASS, blocker/major/minor `0/0/0`
- 남은 Manual Only: 실제 물리 기기 screen reader/가상 키보드, production-scale 측정, 외부 환경 write
