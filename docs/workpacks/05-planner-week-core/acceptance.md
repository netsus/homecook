# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.

## Happy Path

- [x] 플래너 화면 진입 시 기본 주간 범위(오늘 ±7일)로 플래너 조회 성공
- [x] 고정 4끼 슬롯(`아침 / 점심 / 간식 / 저녁`)과 식사 목록이 정상 표시됨
- [x] 같은 날짜의 4끼가 하루 카드 안에 함께 노출됨
- [x] 모바일 기본형에서 page-level horizontal scroll이 없다
- [x] 주간 범위 표시와 주간 이동 컨트롤이 플래너 본문 바로 위에 붙어 있다
- [x] 상단 CTA `[장보기] [요리하기] [남은요리]`가 disabled 상태로 노출됨
- [x] API 응답 형식이 `{ success, data, error }` 래퍼를 따름
- [x] 백엔드 계약과 프론트엔드 타입이 일치함 (고정 slots + meals 구조)
- [x] 식사 상태 뱃지(registered / shopping_done / cook_done)가 시각적으로 구분됨
- [x] 이전 주/다음 주 이동 시 새로운 범위로 플래너 재조회 성공

## State / Policy

- [x] 상단 CTA는 노출되지만 클릭/탭/키보드 활성화로 이동하지 않는다
- [x] 고정 슬롯 순서는 `아침 -> 점심 -> 간식 -> 저녁`으로 유지된다
- [x] `meals` 배열이 `plan_date ASC, column_id ASC, created_at ASC` 순서로 정렬됨
- [x] legacy custom column 데이터가 남아 있어도 GET 응답은 4끼 슬롯으로 정규화된다

## Error / Permission

- [x] loading 상태가 있다 (플래너 조회 중 스켈레톤)
- [x] empty 상태가 있다 (주간 범위 내 식사 없음 안내)
- [x] error 상태가 있다 (플래너 조회 실패 시 오류 안내 + 재시도)
- [x] unauthorized 처리 흐름이 있다 (비로그인 시 플래너 탭 진입 차단 또는 로그인 안내)
- [x] 로그인 게이트 후 return-to-action이 맞다 (플래너 탭은 로그인 필수 화면)
- [x] 비로그인 시 모든 플래너 API 호출 시 401 Unauthorized 반환

## Data Integrity

- [x] 회원가입 또는 bootstrap 이후 기본 슬롯(아침/점심/간식/저녁) 4개가 정상 조회된다
- [x] `GET /planner` 응답의 `columns`와 `meals` 데이터 무결성이 유지됨
- [x] legacy meal이 custom column에 매달려 있어도 사용자에게는 4끼 슬롯으로 안정적으로 보인다

## Data Setup / Preconditions

- QA fixture:
  - `HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`
  - `localStorage["homecook.e2e-auth-override"] = "guest" | "authenticated"`
  - fixture 경로: `/planner`
- 실 DB smoke:
  - `pnpm qa:seed:01-05 -- --user-id <supabase-user-uuid>`
  - seed 결과로 현재 범위에 planner meals 3건이 생성된다

## Manual QA

1. **플래너 화면 진입 및 조회**
   - 하단 탭에서 [플래너] 선택 → `PLANNER_WEEK` 진입
   - 기본 주간 범위(오늘 ±7일)로 고정 4끼 슬롯과 식사 목록 조회 확인
   - 식사가 없는 경우 empty 상태 표시 확인

2. **하루 카드 및 슬롯 확인**
   - 같은 날짜 카드 안에 `아침 / 점심 / 간식 / 저녁` 4개 슬롯이 모두 보이는지 확인
   - 등록된 식사가 있는 슬롯은 레시피명, 인분, 상태 뱃지가 함께 보이는지 확인
   - 빈 슬롯은 짧은 empty copy로 표시되는지 확인

3. **상태 뱃지 표시**
   - 기존 식사가 등록된 셀에서 상태 뱃지 확인
   - `registered` / `shopping_done` / `cook_done` 상태가 시각적으로 구분되는지 확인

4. **주간 이동**
   - [이전 주], [다음 주], [이번주로 가기]로 날짜 범위 변경 → 새로운 범위로 플래너 재조회 확인
   - 로딩 상태 표시 확인

5. **상단 CTA 버튼 (disabled)**
   - [장보기] [요리하기] [남은요리] 버튼이 disabled 상태로 보이는지 확인
   - 클릭/탭/키보드 활성화로 화면 이동이나 placeholder 라우팅이 일어나지 않는지 확인
   - 실제 동작은 09, 14, 16 슬라이스에서 구현

6. **비로그인 처리**
   - 로그아웃 후 플래너 탭 진입 시도 → 로그인 안내 또는 차단 확인
   - 로그인 후 플래너로 자동 복귀 확인 (return-to-action)

## Automation Split

### Vitest

- [x] `GET /planner` 권한 검증 (로그인 필수, 401)
- [x] `meals` 배열 정렬 순서 검증 (plan_date, column_id, created_at)
- [x] bootstrap 이후 고정 4끼 슬롯이 보장되는지 확인
- [x] legacy custom column 데이터가 4끼 슬롯 응답으로 정규화되는지 확인
- [x] API 응답 형식 검증 (`{ success, data, error }`)

### Playwright

- [x] 플래너 화면 진입 후 4끼 고정 day card와 식사 목록 표시 확인
- [x] 모바일/태블릿에서 page-level horizontal scroll이 없는지 확인
- [x] 주간 이동 컨트롤이 플래너 본문과 붙어 있는지 확인
- [x] 같은 날짜의 4끼가 한 카드 안에서 읽히는지 확인
- [x] 비로그인 시 플래너 탭 진입 → 로그인 게이트 확인
- [x] 로그인 후 플래너로 복귀 확인 (return-to-action)
- [x] 식사 상태 뱃지 시각적 구분 확인 (registered / shopping_done / cook_done)
- [x] 이전 주/다음 주 이동 → 플래너 재조회 확인
- [x] 상단 CTA 버튼([장보기] [요리하기] [남은요리])이 동일한 disabled 시각 상태를 유지한다
- [x] 다양한 화면 크기(모바일/태블릿)에서도 day card 핵심 입력 영역이 화면 내에서 접근 가능하다

### Manual Only

- [x] 플래너 화면 장시간 사용 시 성능 확인 (많은 식사 데이터) (`2026-04-10`, local Supabase + `pnpm dev:demo` + `pnpm qa:perf:05`, 계정 `local-other@homecook.local`, 고정 슬롯 `4개`, first viewport density + 주간 이동 반응속도 확인)
- [x] 회원가입 직후 기본 슬롯(아침/점심/간식/저녁) 4개 자동 보장 확인 (auth flow 검증) (`2026-04-10`, 새 Google 계정 + local Supabase Google OAuth + `http://localhost:3000`, `/planner` 첫 로그인 직후 4개 슬롯 확인)
