# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.

## Happy Path

- [x] 플래너 화면 진입 시 기본 주간 범위(오늘 ±7일)로 플래너 조회 성공
- [x] 끼니 컬럼 목록과 식사 목록이 정상 표시됨 (columns + meals)
- [x] 상단 CTA `[장보기] [요리하기] [남은요리]`가 disabled 상태로 노출됨
- [x] 끼니 컬럼 추가 시 새로운 컬럼이 생성되고 화면에 즉시 반영됨
- [x] 끼니 컬럼명 수정 시 변경사항이 즉시 반영됨
- [x] 끼니 컬럼 순서 변경(sort_order) 시 그리드 순서가 즉시 반영됨
- [x] 비어있는 끼니 컬럼 삭제 시 정상 삭제됨 (204 응답)
- [x] API 응답 형식이 `{ success, data, error }` 래퍼를 따름
- [x] 백엔드 계약과 프론트엔드 타입이 일치함 (columns, meals 구조)
- [x] 식사 상태 뱃지(registered / shopping_done / cook_done)가 시각적으로 구분됨
- [x] 날짜 범위 스크롤 시 새로운 범위로 플래너 재조회 성공

## State / Policy

- [x] 끼니 컬럼 최대 5개 제한: 6번째 추가 시도 시 409 CONFLICT 반환
- [x] 상단 CTA는 노출되지만 클릭/탭/키보드 활성화로 이동하지 않는다
- [x] 소속 meals 존재하는 컬럼 삭제 시도 시 409 CONFLICT 반환
- [x] 중복 컬럼 추가 호출에도 결과가 꼬이지 않음 (멱등성 불필요, 각각 새 컬럼 생성)
- [x] 존재하지 않는 column_id로 수정/삭제 시도 시 404 반환
- [x] `meals` 배열이 `plan_date ASC, column_id ASC, created_at ASC` 순서로 정렬됨
- [x] 끼니 컬럼 `sort_order`가 UNIQUE 제약 조건을 만족함 (user_id, sort_order)

## Error / Permission

- [x] loading 상태가 있다 (플래너 조회 중 스켈레톤)
- [x] empty 상태가 있다 (주간 범위 내 식사 없음 안내)
- [x] error 상태가 있다 (플래너 조회 실패 시 오류 안내 + 재시도)
- [x] unauthorized 처리 흐름이 있다 (비로그인 시 플래너 탭 진입 차단 또는 로그인 안내)
- [x] conflict 처리 흐름이 있다 (최대 5개 제한, 소속 meals 존재 시 삭제 불가)
- [x] 로그인 게이트 후 return-to-action이 맞다 (플래너 탭은 로그인 필수 화면)
- [x] 비로그인 시 모든 플래너 API 호출 시 401 Unauthorized 반환
- [x] 다른 사용자의 끼니 컬럼 수정/삭제 시도 시 403 FORBIDDEN 반환

## Data Integrity

- [x] 타인 리소스를 수정할 수 없다 (컬럼 수정/삭제 시 user_id 검증)
- [x] invalid input을 적절히 거부한다 (name 빈 문자열, sort_order 음수 등 422)
- [x] 끼니 컬럼 추가 시 sort_order가 자동 할당됨 (마지막 순서 + 1)
- [x] 회원가입 시 생성된 기본 컬럼(아침/점심/저녁)이 정상 조회됨
- [x] `GET /planner` 응답의 `columns`와 `meals` 데이터 무결성이 유지됨

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
   - 기본 주간 범위(오늘 ±7일)로 끼니 컬럼과 식사 목록 조회 확인
   - 식사가 없는 경우 empty 상태 표시 확인

2. **끼니 컬럼 추가**
   - [+] 버튼 클릭 → 컬럼명 입력(예: "간식") → 추가
   - 새로운 컬럼이 그리드에 즉시 반영되는지 확인
   - 5개 컬럼 생성 후 6번째 추가 시도 → 409 에러 안내 확인

3. **끼니 컬럼 수정**
   - 기존 컬럼명 클릭 → 수정(예: "점심" → "브런치") → 저장
   - 컬럼명 변경이 즉시 반영되는지 확인
   - drag handle로 컬럼 순서를 변경 → sort_order 변경 반영 확인
   - 저장 실패 시 직전 순서로 원복되고 오류 안내가 보이는지 확인
   - 화살표 버튼 기반 순서 변경 UI가 제거되었는지 확인

4. **끼니 컬럼 삭제**
   - 비어있는 컬럼 삭제 버튼 클릭 → 삭제 성공 확인 (204)
   - 식사가 등록된 컬럼 삭제 시도 → 409 에러 안내 확인
   - 에러 메시지: "식사가 등록된 컬럼은 삭제할 수 없어요. 식사를 먼저 삭제하거나 이동해주세요."

5. **상태 뱃지 표시**
   - 기존 식사가 등록된 셀에서 상태 뱃지 확인
   - `registered` / `shopping_done` / `cook_done` 상태가 시각적으로 구분되는지 확인

6. **날짜 범위 스크롤**
   - 위/아래 스크롤로 날짜 범위 변경 → 새로운 범위로 플래너 재조회 확인
   - 로딩 상태 표시 확인

7. **상단 CTA 버튼 (disabled)**
   - [장보기] [요리하기] [남은요리] 버튼이 disabled 상태로 보이는지 확인
   - 클릭/탭/키보드 활성화로 화면 이동이나 placeholder 라우팅이 일어나지 않는지 확인
   - 실제 동작은 09, 14, 16 슬라이스에서 구현

8. **비로그인 처리**
   - 로그아웃 후 플래너 탭 진입 시도 → 로그인 안내 또는 차단 확인
   - 로그인 후 플래너로 자동 복귀 확인 (return-to-action)

## Automation Split

### Vitest

- [x] `GET /planner` 권한 검증 (로그인 필수, 401)
- [x] `POST /planner/columns` 최대 5개 제한 (409)
- [x] `DELETE /planner/columns/{id}` 소속 meals 존재 시 409
- [x] 타인 컬럼 수정/삭제 시 403 FORBIDDEN
- [x] 존재하지 않는 column_id로 수정/삭제 시 404
- [x] invalid input 검증 (name 빈 문자열, sort_order 음수 등 422)
- [x] `meals` 배열 정렬 순서 검증 (plan_date, column_id, created_at)
- [x] 끼니 컬럼 sort_order 자동 할당 로직
- [x] 끼니 컬럼 순서 변경 저장 실패 시 직전 순서 유지 + 오류 안내 확인
- [x] API 응답 형식 검증 (`{ success, data, error }`)

### Playwright

- [x] 플래너 화면 진입 후 끼니 컬럼과 식사 목록 표시 확인
- [x] 끼니 컬럼 추가 → 화면 반영 확인
- [x] 끼니 컬럼 수정 (name, sort_order) → 화면 반영 확인
- [x] 끼니 컬럼 삭제 (비어있는 컬럼) → 화면 반영 확인
- [x] 최대 5개 제한 초과 시 409 에러 안내 확인
- [x] 소속 meals 존재하는 컬럼 삭제 시 409 에러 안내 확인
- [x] 비로그인 시 플래너 탭 진입 → 로그인 게이트 확인
- [x] 로그인 후 플래너로 복귀 확인 (return-to-action)
- [x] 식사 상태 뱃지 시각적 구분 확인 (registered / shopping_done / cook_done)
- [x] 날짜 범위 스크롤 → 플래너 재조회 확인
- [x] drag handle 기반 끼니 컬럼 reorder → 새로고침 후 순서 유지 확인
- [x] 긴 거리 drag 시 source 컬럼과 drop target 컬럼만 직접 교환되고 중간 컬럼 순서는 유지된다
- [x] 상단 CTA 버튼([장보기] [요리하기] [남은요리])이 동일한 disabled 시각 상태를 유지한다
- [x] 다양한 화면 크기(모바일/태블릿)에서도 플래너 그리드 핵심 입력 영역이 화면 내에서 접근 가능하다

### Manual Only

- [x] drag handle 기반 끼니 컬럼 순서 변경 인터랙션 (드롭 저장, 실패 시 원복, 화살표 제거, 긴 거리 drag 시 source/target 직접 교환) (`2026-04-09`, `pnpm exec vitest run tests/planner-columns-route.test.ts tests/planner-week-screen.test.tsx`, `pnpm exec playwright test tests/e2e/slice-05-planner-week-core.spec.ts --project=desktop-chrome --project=mobile-chrome --grep "manage planner columns|drag planner columns|touch drag handle|swaps only the source and target columns on long moves"`, drag handle reorder + 새로고침 유지 + 저장 실패 원복/오류 안내 + 화살표 제거 + 긴 거리 swap 확인)
- [x] 플래너 화면 장시간 사용 시 성능 확인 (많은 식사 데이터) (`2026-04-09`, local Supabase + `pnpm dev:demo` + `pnpm qa:perf:05`, 계정 `local-other@homecook.local`, 컬럼 `5개`, 레시피 `72개`, meals `343개`, 초기 범위 `89건`, `initialReady=1130ms`, `averageShift=199ms`, `maxShift=221ms`, `horizontalReach=53ms`)
- [x] 회원가입 직후 기본 컬럼(아침/점심/저녁) 3개 자동 생성 확인 (auth flow 검증) (`2026-04-04`, 새 Google 계정 + local Supabase Google OAuth + `http://localhost:3000`, `/planner` 첫 로그인 직후 3개 컬럼 생성 확인)
